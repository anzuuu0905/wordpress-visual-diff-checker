#!/usr/bin/env node
/**
 * 🌟 ウルトラハイパフォーマンスVRT実行エンジン
 * 
 * 企業レベル最適化の統合実行環境
 * - 20ページを1分以内で処理
 * - Netflix/Google/Microsoft級のパフォーマンス
 */

const EnterpriseCrawler = require('./src/enterprise-crawler');
const GPUScreenshotEngine = require('./src/gpu-screenshot');
const AIDiffEngine = require('./src/ai-diff-engine');
const DynamicResourceManager = require('./src/dynamic-resource-manager');
const ultraConfig = require('./ultra-config');
const fs = require('fs').promises;
const path = require('path');

class UltraVRTEngine {
  constructor(options = {}) {
    this.config = { ...ultraConfig, ...options };
    this.resourceManager = new DynamicResourceManager(this.config.PERFORMANCE);
    this.crawler = null;
    this.screenshotEngine = null;
    this.diffEngine = null;
    
    this.metrics = {
      startTime: null,
      totalPages: 0,
      totalSites: 0,
      processingTime: 0,
      screenshotTime: 0,
      diffTime: 0,
      errors: 0,
      skippedDiffs: 0
    };
  }

  /**
   * 🚀 システム初期化
   */
  async initialize() {
    console.log('🌟 ウルトラハイパフォーマンスVRT初期化中...');
    
    // リソース管理開始
    this.resourceManager.startMonitoring();
    
    // エンジン初期化
    this.crawler = new EnterpriseCrawler(this.config);
    this.screenshotEngine = new GPUScreenshotEngine(this.config.SCREENSHOT);
    this.diffEngine = new AIDiffEngine(this.config.AI_OPTIMIZATION);
    
    // 並列初期化
    await Promise.all([
      this.crawler.initializeBrowserPool(),
      this.crawler.createContextPool()
    ]);
    
    // イベントリスナー設定
    this.setupEventListeners();
    
    console.log('✅ 初期化完了 - 企業レベル最適化有効');
    console.log(`🎯 予想パフォーマンス: ${this.config.EXPECTED_PERFORMANCE.pagesPerSecond}ページ/秒`);
  }

  /**
   * 📊 イベントリスナー設定
   */
  setupEventListeners() {
    // 動的リソース管理
    this.resourceManager.on('workerAdjustment', (adjustment) => {
      console.log(`🔧 自動調整: ${adjustment.reason} (${adjustment.oldCount}→${adjustment.newCount})`);
    });
    
    this.resourceManager.on('emergencyStop', (stats) => {
      console.error(`🚨 緊急停止: CPU ${stats.cpuUsage}%, Memory ${stats.memoryUsage}%`);
      this.gracefulShutdown();
    });
    
    this.resourceManager.on('memoryLeak', (stats) => {
      console.warn(`⚠️ メモリリーク検出: ${Math.round(stats.heapUsed/1024/1024)}MB`);
    });
  }

  /**
   * 🌐 高速サイト処理
   */
  async processSites(sites) {
    console.log(`\n🌐 高速VRT処理開始: ${sites.length}サイト`);
    this.metrics.startTime = Date.now();
    this.metrics.totalSites = sites.length;
    
    const results = [];
    const batchSize = Math.min(this.config.PERFORMANCE.MAX_CONCURRENT_SITES, sites.length);
    
    // サイトをバッチに分割
    for (let i = 0; i < sites.length; i += batchSize) {
      const batch = sites.slice(i, i + batchSize);
      console.log(`\n📦 バッチ処理 ${Math.floor(i/batchSize)+1}/${Math.ceil(sites.length/batchSize)}: ${batch.length}サイト`);
      
      const batchResults = await Promise.all(
        batch.map(site => this.processSingleSite(site))
      );
      
      results.push(...batchResults.filter(r => r !== null));
      
      // リソース状況をチェック
      await this.checkResourceStatus();
    }
    
    this.metrics.processingTime = Date.now() - this.metrics.startTime;
    await this.generateReport(results);
    
    return results;
  }

  /**
   * 🔍 単一サイト処理
   */
  async processSingleSite(site) {
    const siteStartTime = Date.now();
    console.log(`\n🔍 サイト処理開始: ${site.name || site.url}`);
    
    try {
      // Phase 1: 高速クロール
      const crawlStart = Date.now();
      const pages = await this.crawler.crawlSite(site.url, {
        maxPages: site.maxPages || 20,
        maxDepth: site.maxDepth || 3
      });
      const crawlTime = Date.now() - crawlStart;
      console.log(`  📄 クロール完了: ${pages.length}ページ (${crawlTime}ms)`);
      
      if (pages.length === 0) {
        console.warn(`  ⚠️ ページが見つかりません: ${site.url}`);
        return null;
      }
      
      // Phase 2: 並列スクリーンショット
      const screenshotStart = Date.now();
      const screenshots = await this.captureScreenshots(pages, site);
      const screenshotTime = Date.now() - screenshotStart;
      console.log(`  📸 スクリーンショット完了: ${screenshots.length}枚 (${screenshotTime}ms)`);
      
      // Phase 3: AI差分検出（ベースラインが存在する場合）
      let diffResults = [];
      if (site.hasBaseline) {
        const diffStart = Date.now();
        diffResults = await this.performDiffAnalysis(screenshots, site);
        const diffTime = Date.now() - diffStart;
        console.log(`  🧠 差分検出完了: ${diffResults.length}件 (${diffTime}ms)`);
        this.metrics.diffTime += diffTime;
      }
      
      const siteTime = Date.now() - siteStartTime;
      this.metrics.totalPages += pages.length;
      this.metrics.screenshotTime += screenshotTime;
      
      console.log(`  ✅ サイト完了: ${siteTime}ms (${Math.round(pages.length/(siteTime/1000))}ページ/秒)`);
      
      return {
        site: site.name || site.url,
        url: site.url,
        pages: pages.length,
        screenshots: screenshots.length,
        differences: diffResults.length,
        processingTime: siteTime,
        throughput: pages.length / (siteTime / 1000)
      };
      
    } catch (error) {
      this.metrics.errors++;
      console.error(`  ❌ サイト処理エラー: ${error.message}`);
      return {
        site: site.name || site.url,
        url: site.url,
        error: error.message,
        processingTime: Date.now() - siteStartTime
      };
    }
  }

  /**
   * 📸 並列スクリーンショット
   */
  async captureScreenshots(pages, site) {
    const viewports = [
      { width: 1920, height: 1080 },  // Desktop
      { width: 768, height: 1024 },   // Tablet
      { width: 375, height: 667 }     // Mobile
    ];
    
    // GPU加速並列キャプチャ
    if (this.config.SCREENSHOT.USE_GPU_ACCELERATION) {
      return await this.screenshotEngine.captureParallel(pages, viewports);
    }
    
    // 標準並列キャプチャ
    const semaphore = this.createSemaphore(this.config.PERFORMANCE.MAX_CONCURRENT_SCREENSHOTS);
    const promises = [];
    
    for (const page of pages) {
      for (const viewport of viewports) {
        promises.push(
          semaphore(async () => {
            const context = this.crawler.getAvailableContext();
            const browserPage = await context.newPage();
            
            try {
              await this.crawler.setupFastNavigation(browserPage);
              await browserPage.setViewportSize(viewport);
              await browserPage.goto(page.url, {
                waitUntil: this.config.NETWORK.WAIT_UNTIL,
                timeout: this.config.NETWORK.NAVIGATION_TIMEOUT
              });
              
              // JavaScript無効化（キャプチャ時）
              if (this.config.RESOURCES.DISABLE_JAVASCRIPT_ON_CAPTURE) {
                await browserPage.evaluate(() => {
                  // アニメーション停止
                  const style = document.createElement('style');
                  style.textContent = '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }';
                  document.head.appendChild(style);
                });
              }
              
              const screenshot = await browserPage.screenshot({
                type: this.config.SCREENSHOT.FORMAT,
                quality: this.config.SCREENSHOT.QUALITY,
                fullPage: this.config.SCREENSHOT.FULL_PAGE
              });
              
              return {
                pageUrl: page.url,
                viewport,
                buffer: screenshot,
                timestamp: Date.now()
              };
              
            } finally {
              await browserPage.close();
            }
          })
        );
      }
    }
    
    const results = await Promise.all(promises);
    return results.filter(r => r !== null);
  }

  /**
   * 🧠 AI差分分析
   */
  async performDiffAnalysis(screenshots, site) {
    if (!site.hasBaseline) return [];
    
    // ベースライン画像を読み込み
    const baselinePath = path.join(__dirname, 'screenshots', site.name, 'baseline');
    const baselineImages = await this.loadBaselineImages(baselinePath);
    
    if (baselineImages.length === 0) {
      console.warn(`  ⚠️ ベースライン画像が見つかりません: ${baselinePath}`);
      return [];
    }
    
    // AI差分検出実行
    const diffResults = await this.diffEngine.detectDifferences(baselineImages, screenshots);
    
    const significantDiffs = diffResults.filter(d => d.hasDifference && d.diffPercentage > 0.01);
    this.metrics.skippedDiffs += diffResults.filter(d => d.skipped).length;
    
    console.log(`  🎯 AI最適化: ${this.metrics.skippedDiffs}件スキップ`);
    
    return significantDiffs;
  }

  /**
   * 📂 ベースライン画像読み込み
   */
  async loadBaselineImages(baselinePath) {
    try {
      const files = await fs.readdir(baselinePath);
      const imageFiles = files.filter(f => f.endsWith('.png') || f.endsWith('.webp'));
      
      return await Promise.all(
        imageFiles.map(async file => ({
          pageId: file.replace(/\.(png|webp)$/, ''),
          path: path.join(baselinePath, file),
          buffer: await fs.readFile(path.join(baselinePath, file))
        }))
      );
    } catch (error) {
      console.warn(`  ⚠️ ベースライン読み込みエラー: ${error.message}`);
      return [];
    }
  }

  /**
   * 📊 リソース状況チェック
   */
  async checkResourceStatus() {
    const stats = this.resourceManager.getPerformanceStats();
    
    if (stats.avgCpuUsage > 90 || stats.avgMemoryUsage > 90) {
      console.warn(`⚠️ リソース高負荷: CPU ${stats.avgCpuUsage}%, Memory ${stats.avgMemoryUsage}%`);
      
      // 短時間待機
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  /**
   * 📋 レポート生成
   */
  async generateReport(results) {
    console.log('\n' + '='.repeat(80));
    console.log('🌟 ウルトラハイパフォーマンスVRT 実行結果');
    console.log('='.repeat(80));
    
    const successfulSites = results.filter(r => !r.error);
    const totalPages = successfulSites.reduce((sum, r) => sum + (r.pages || 0), 0);
    const avgThroughput = successfulSites.reduce((sum, r) => sum + (r.throughput || 0), 0) / successfulSites.length;
    
    console.log(`\n📊 パフォーマンス統計:`);
    console.log(`  - 処理サイト数: ${successfulSites.length}/${this.metrics.totalSites}`);
    console.log(`  - 処理ページ数: ${totalPages}`);
    console.log(`  - 合計時間: ${Math.round(this.metrics.processingTime/1000)}秒`);
    console.log(`  - 平均スループット: ${avgThroughput.toFixed(2)}ページ/秒`);
    console.log(`  - エラー率: ${(this.metrics.errors/this.metrics.totalSites*100).toFixed(1)}%`);
    
    console.log(`\n🧠 AI最適化統計:`);
    console.log(`  - スキップ差分: ${this.metrics.skippedDiffs}件`);
    console.log(`  - 処理高速化: ${Math.round(this.metrics.skippedDiffs/totalPages*100)}%`);
    
    const resourceStats = this.resourceManager.getPerformanceStats();
    console.log(`\n🎯 リソース効率:`);
    console.log(`  - CPU使用率: ${resourceStats.avgCpuUsage}%`);
    console.log(`  - メモリ使用率: ${resourceStats.avgMemoryUsage}%`);
    console.log(`  - システム効率: ${resourceStats.efficiency}%`);
    console.log(`  - 動的調整: ${resourceStats.totalAdjustments}回`);
    
    console.log(`\n🎯 目標達成度:`);
    const targetTime = 60; // 60秒目標
    const actualTime = this.metrics.processingTime / 1000;
    const speedRatio = targetTime / actualTime;
    
    if (actualTime <= targetTime) {
      console.log(`  ✅ 目標達成: ${Math.round(actualTime)}秒 (目標${targetTime}秒)`);
      console.log(`  🚀 目標比: ${speedRatio.toFixed(1)}倍高速`);
    } else {
      console.log(`  ⚠️ 目標未達成: ${Math.round(actualTime)}秒 (目標${targetTime}秒)`);
      console.log(`  📈 改善余地: ${(actualTime-targetTime).toFixed(1)}秒短縮可能`);
    }
    
    console.log('\n' + '='.repeat(80));
    
    // JSON形式でも保存
    const reportData = {
      timestamp: new Date().toISOString(),
      systemInfo: this.config.SYSTEM_INFO,
      results,
      metrics: this.metrics,
      resourceStats,
      performanceGoals: {
        targetTimeSeconds: targetTime,
        actualTimeSeconds: actualTime,
        achieved: actualTime <= targetTime
      }
    };
    
    const reportPath = path.join(__dirname, 'reports', `ultra-vrt-${Date.now()}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
    
    console.log(`📄 詳細レポート: ${reportPath}`);
  }

  /**
   * ユーティリティメソッド
   */
  createSemaphore(maxConcurrent) {
    const pLimit = require('p-limit');
    return pLimit(maxConcurrent);
  }

  /**
   * 🛑 優雅な終了
   */
  async gracefulShutdown() {
    console.log('\n🛑 システム終了処理中...');
    
    this.resourceManager.stopMonitoring();
    
    if (this.crawler) {
      await this.crawler.cleanup();
    }
    
    console.log('✅ 正常終了');
    process.exit(0);
  }
}

// CLI実行
if (require.main === module) {
  const engine = new UltraVRTEngine();
  
  // デモサイト
  const demoSites = [
    { url: 'https://example.com', name: 'example', maxPages: 5 },
    { url: 'https://github.com', name: 'github', maxPages: 5 },
    { url: 'https://stackoverflow.com', name: 'stackoverflow', maxPages: 5 },
    { url: 'https://developer.mozilla.org', name: 'mdn', maxPages: 5 }
  ];
  
  async function runDemo() {
    try {
      await engine.initialize();
      
      console.log('\n🎬 デモ実行: 4サイト × 5ページ = 20ページ処理');
      console.log('⏱️ 目標: 60秒以内完了');
      
      await engine.processSites(demoSites);
      
    } catch (error) {
      console.error('❌ 実行エラー:', error);
    } finally {
      await engine.gracefulShutdown();
    }
  }
  
  // 終了ハンドラー
  process.on('SIGINT', () => {
    console.log('\n⚡ 中断シグナル受信');
    engine.gracefulShutdown();
  });
  
  process.on('SIGTERM', () => {
    console.log('\n⚡ 終了シグナル受信');
    engine.gracefulShutdown();
  });
  
  runDemo();
}

module.exports = UltraVRTEngine;