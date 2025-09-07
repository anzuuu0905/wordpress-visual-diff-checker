/**
 * 🎯 動的リソース管理システム
 * 
 * CPUとメモリ使用量を監視し、自動的に並列度を最適化
 * - システムリソースに基づく動的スケーリング
 * - メモリリーク検出と自動回復
 * - 負荷バランシング
 */

const os = require('os');
const { EventEmitter } = require('events');

class DynamicResourceManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      // リソース制限
      maxCpuUsage: 80,           // CPU使用率上限（%）
      maxMemoryUsage: 85,        // メモリ使用率上限（%）
      memoryLeakThreshold: 100,  // メモリリーク閾値（MB/分）
      
      // 動的調整
      minWorkers: 2,
      maxWorkers: os.cpus().length * 2,
      adjustmentInterval: 5000,   // 5秒ごとに調整
      
      // 緊急制御
      emergencyShutdownCpu: 95,   // 緊急停止CPU%
      emergencyShutdownMemory: 95, // 緊急停止メモリ%
      
      ...options
    };
    
    this.metrics = {
      currentWorkers: this.config.minWorkers,
      cpuHistory: [],
      memoryHistory: [],
      adjustmentHistory: [],
      emergencyStops: 0
    };
    
    this.monitoring = false;
    this.lastMemoryUsage = process.memoryUsage();
    this.baselineMemory = process.memoryUsage().heapUsed;
  }

  /**
   * 監視開始
   */
  startMonitoring() {
    if (this.monitoring) return;
    
    console.log('🎯 動的リソース管理開始');
    this.monitoring = true;
    
    this.monitoringInterval = setInterval(() => {
      this.checkAndAdjustResources();
    }, this.config.adjustmentInterval);
    
    // 緊急停止監視（より頻繁に）
    this.emergencyInterval = setInterval(() => {
      this.checkEmergencyConditions();
    }, 1000);
  }

  /**
   * 監視停止
   */
  stopMonitoring() {
    if (!this.monitoring) return;
    
    console.log('🛑 動的リソース管理停止');
    this.monitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.emergencyInterval) {
      clearInterval(this.emergencyInterval);
      this.emergencyInterval = null;
    }
  }

  /**
   * リソースチェックと調整
   */
  async checkAndAdjustResources() {
    try {
      const systemStats = await this.getSystemStats();
      const processStats = this.getProcessStats();
      
      // 履歴に追加
      this.metrics.cpuHistory.push(systemStats.cpuUsage);
      this.metrics.memoryHistory.push(systemStats.memoryUsage);
      
      // 履歴を制限（直近20ポイント）
      if (this.metrics.cpuHistory.length > 20) {
        this.metrics.cpuHistory.shift();
      }
      if (this.metrics.memoryHistory.length > 20) {
        this.metrics.memoryHistory.shift();
      }
      
      // 調整判定
      const adjustment = this.calculateOptimalWorkers(systemStats, processStats);
      
      if (adjustment.shouldAdjust) {
        await this.adjustWorkerCount(adjustment.newWorkerCount, adjustment.reason);
      }
      
      // メモリリーク検出
      if (this.detectMemoryLeak(processStats)) {
        this.emit('memoryLeak', processStats);
      }
      
    } catch (error) {
      console.error('❌ リソース監視エラー:', error);
    }
  }

  /**
   * 緊急状況チェック
   */
  async checkEmergencyConditions() {
    try {
      const systemStats = await this.getSystemStats();
      
      if (systemStats.cpuUsage > this.config.emergencyShutdownCpu || 
          systemStats.memoryUsage > this.config.emergencyShutdownMemory) {
        
        console.error(`🚨 緊急停止発動: CPU ${systemStats.cpuUsage}%, Memory ${systemStats.memoryUsage}%`);
        this.metrics.emergencyStops++;
        this.emit('emergencyStop', systemStats);
      }
    } catch (error) {
      console.error('❌ 緊急監視エラー:', error);
    }
  }

  /**
   * 最適ワーカー数計算
   */
  calculateOptimalWorkers(systemStats, processStats) {
    const currentWorkers = this.metrics.currentWorkers;
    let targetWorkers = currentWorkers;
    let reason = '';
    
    // CPU使用率によるスケーリング
    if (systemStats.cpuUsage > this.config.maxCpuUsage) {
      targetWorkers = Math.max(this.config.minWorkers, currentWorkers - 1);
      reason = `CPU過負荷 (${systemStats.cpuUsage}%)`;
    } else if (systemStats.cpuUsage < 50 && currentWorkers < this.config.maxWorkers) {
      targetWorkers = Math.min(this.config.maxWorkers, currentWorkers + 1);
      reason = `CPU余裕あり (${systemStats.cpuUsage}%)`;
    }
    
    // メモリ使用率によるスケーリング
    if (systemStats.memoryUsage > this.config.maxMemoryUsage) {
      targetWorkers = Math.max(this.config.minWorkers, Math.min(targetWorkers, currentWorkers - 1));
      reason = `メモリ過負荷 (${systemStats.memoryUsage}%)`;
    }
    
    // プロセスメモリによる制限
    const processMemoryMB = processStats.heapUsed / 1024 / 1024;
    if (processMemoryMB > 1000) { // 1GB以上
      targetWorkers = Math.max(this.config.minWorkers, currentWorkers - 1);
      reason = `プロセスメモリ過多 (${Math.round(processMemoryMB)}MB)`;
    }
    
    // 安定性チェック（頻繁な調整を避ける）
    if (this.metrics.adjustmentHistory.length > 0) {
      const lastAdjustment = this.metrics.adjustmentHistory[this.metrics.adjustmentHistory.length - 1];
      const timeSinceLastAdjustment = Date.now() - lastAdjustment.timestamp;
      
      if (timeSinceLastAdjustment < this.config.adjustmentInterval * 2) {
        // 前回の調整から間もない場合はより大きな変化が必要
        const changeRequired = Math.abs(targetWorkers - currentWorkers);
        if (changeRequired === 1) {
          return { shouldAdjust: false, reason: '調整頻度制限' };
        }
      }
    }
    
    return {
      shouldAdjust: targetWorkers !== currentWorkers,
      newWorkerCount: targetWorkers,
      reason,
      systemStats,
      processStats
    };
  }

  /**
   * ワーカー数調整実行
   */
  async adjustWorkerCount(newCount, reason) {
    const oldCount = this.metrics.currentWorkers;
    this.metrics.currentWorkers = newCount;
    
    const adjustment = {
      timestamp: Date.now(),
      oldCount,
      newCount,
      reason,
      direction: newCount > oldCount ? 'scale-up' : 'scale-down'
    };
    
    this.metrics.adjustmentHistory.push(adjustment);
    
    // 履歴制限
    if (this.metrics.adjustmentHistory.length > 50) {
      this.metrics.adjustmentHistory.shift();
    }
    
    console.log(`🔧 ワーカー数調整: ${oldCount} → ${newCount} (${reason})`);
    
    this.emit('workerAdjustment', adjustment);
    
    return adjustment;
  }

  /**
   * システム統計取得
   */
  async getSystemStats() {
    // CPU使用率（1秒間測定）
    const cpuUsage = await new Promise((resolve) => {
      const startMeasures = os.cpus().map(cpu => ({
        idle: cpu.times.idle,
        total: Object.values(cpu.times).reduce((acc, time) => acc + time, 0)
      }));
      
      setTimeout(() => {
        const endMeasures = os.cpus().map(cpu => ({
          idle: cpu.times.idle,
          total: Object.values(cpu.times).reduce((acc, time) => acc + time, 0)
        }));
        
        let totalIdle = 0;
        let totalTick = 0;
        
        for (let i = 0; i < startMeasures.length; i++) {
          const idle = endMeasures[i].idle - startMeasures[i].idle;
          const total = endMeasures[i].total - startMeasures[i].total;
          totalIdle += idle;
          totalTick += total;
        }
        
        const usage = 100 - Math.round(100 * totalIdle / totalTick);
        resolve(usage);
      }, 1000);
    });
    
    // メモリ使用率
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = Math.round((usedMemory / totalMemory) * 100);
    
    return {
      cpuUsage,
      memoryUsage,
      totalMemory,
      freeMemory,
      usedMemory
    };
  }

  /**
   * プロセス統計取得
   */
  getProcessStats() {
    const memUsage = process.memoryUsage();
    return {
      ...memUsage,
      uptime: process.uptime(),
      pid: process.pid
    };
  }

  /**
   * メモリリーク検出
   */
  detectMemoryLeak(processStats) {
    if (this.metrics.memoryHistory.length < 5) return false;
    
    const currentMemoryMB = processStats.heapUsed / 1024 / 1024;
    const baselineMemoryMB = this.baselineMemory / 1024 / 1024;
    const memoryGrowth = currentMemoryMB - baselineMemoryMB;
    
    // 直近5回の平均メモリ増加率
    const recentMemory = this.metrics.memoryHistory.slice(-5);
    let totalGrowth = 0;
    for (let i = 1; i < recentMemory.length; i++) {
      totalGrowth += recentMemory[i] - recentMemory[i-1];
    }
    const avgGrowthRate = totalGrowth / (recentMemory.length - 1);
    
    // 分単位の成長率（MB/分）
    const growthPerMinute = (avgGrowthRate * 60000) / this.config.adjustmentInterval;
    
    return growthPerMinute > this.config.memoryLeakThreshold;
  }

  /**
   * 推奨設定取得
   */
  getRecommendedConfiguration() {
    const systemInfo = {
      cpuCores: os.cpus().length,
      totalMemoryGB: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      platform: os.platform(),
      arch: os.arch()
    };
    
    const recommendations = {
      // 基本設定
      maxWorkers: Math.min(systemInfo.cpuCores * 2, 16),
      maxConcurrentPages: systemInfo.cpuCores * 5,
      maxConcurrentScreenshots: systemInfo.cpuCores * 10,
      
      // メモリ設定
      browserPoolSize: Math.min(Math.floor(systemInfo.totalMemoryGB / 2), 8),
      contextPoolSize: Math.min(systemInfo.totalMemoryGB * 2, 20),
      
      // 品質設定
      screenshotFormat: systemInfo.totalMemoryGB >= 16 ? 'png' : 'webp',
      screenshotQuality: systemInfo.totalMemoryGB >= 8 ? 90 : 80,
      
      // キャッシュ設定
      enableCache: systemInfo.totalMemoryGB >= 8,
      cacheSize: Math.min(systemInfo.totalMemoryGB * 100, 1000) // MB
    };
    
    return { systemInfo, recommendations };
  }

  /**
   * パフォーマンス統計取得
   */
  getPerformanceStats() {
    const avgCpuUsage = this.metrics.cpuHistory.length > 0 
      ? this.metrics.cpuHistory.reduce((a, b) => a + b, 0) / this.metrics.cpuHistory.length 
      : 0;
      
    const avgMemoryUsage = this.metrics.memoryHistory.length > 0
      ? this.metrics.memoryHistory.reduce((a, b) => a + b, 0) / this.metrics.memoryHistory.length
      : 0;
    
    const totalAdjustments = this.metrics.adjustmentHistory.length;
    const scaleUps = this.metrics.adjustmentHistory.filter(a => a.direction === 'scale-up').length;
    const scaleDowns = this.metrics.adjustmentHistory.filter(a => a.direction === 'scale-down').length;
    
    return {
      currentWorkers: this.metrics.currentWorkers,
      avgCpuUsage: Math.round(avgCpuUsage),
      avgMemoryUsage: Math.round(avgMemoryUsage),
      totalAdjustments,
      scaleUps,
      scaleDowns,
      emergencyStops: this.metrics.emergencyStops,
      efficiency: this.calculateEfficiency()
    };
  }

  /**
   * 効率性計算
   */
  calculateEfficiency() {
    if (this.metrics.cpuHistory.length === 0) return 0;
    
    const avgCpu = this.metrics.cpuHistory.reduce((a, b) => a + b, 0) / this.metrics.cpuHistory.length;
    const targetCpu = 70; // 理想的なCPU使用率
    
    // CPU使用率が理想に近いほど効率が良い
    const cpuEfficiency = 1 - Math.abs(avgCpu - targetCpu) / targetCpu;
    
    // 調整回数が少ないほど効率が良い
    const adjustmentEfficiency = Math.max(0, 1 - this.metrics.adjustmentHistory.length / 100);
    
    return Math.round((cpuEfficiency * 0.7 + adjustmentEfficiency * 0.3) * 100);
  }

  /**
   * リアルタイム状態表示
   */
  displayRealtimeStatus() {
    setInterval(async () => {
      if (!this.monitoring) return;
      
      const systemStats = await this.getSystemStats();
      const processStats = this.getProcessStats();
      const perfStats = this.getPerformanceStats();
      
      console.clear();
      console.log('🎯 動的リソース管理 - リアルタイム状態');
      console.log('=' .repeat(60));
      console.log(`CPU使用率: ${systemStats.cpuUsage}% (平均: ${perfStats.avgCpuUsage}%)`);
      console.log(`メモリ使用率: ${systemStats.memoryUsage}% (平均: ${perfStats.avgMemoryUsage}%)`);
      console.log(`現在のワーカー数: ${perfStats.currentWorkers}`);
      console.log(`プロセスメモリ: ${Math.round(processStats.heapUsed / 1024 / 1024)}MB`);
      console.log(`システム効率: ${perfStats.efficiency}%`);
      console.log(`調整回数: ${perfStats.totalAdjustments} (↑${perfStats.scaleUps} ↓${perfStats.scaleDowns})`);
      console.log(`緊急停止: ${perfStats.emergencyStops}回`);
      console.log('=' .repeat(60));
      
    }, 2000);
  }
}

module.exports = DynamicResourceManager;