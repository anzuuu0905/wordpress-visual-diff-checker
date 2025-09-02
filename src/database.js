/**
 * 🗄️ データベース統合設計
 * Firestore/ローカルDB対応の永続化システム
 */

const fs = require('fs-extra');
const path = require('path');

class VRTDatabase {
  constructor(options = {}) {
    this.mode = options.mode || 'local'; // 'local' or 'firestore'
    this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    this.firestoreConfig = options.firestore || null;
    
    // ローカルDB初期化
    if (this.mode === 'local') {
      fs.ensureDirSync(this.dataDir);
      this.initializeLocalDB();
    }
  }

  /**
   * ローカルDB初期化
   */
  initializeLocalDB() {
    const collections = ['sites', 'sessions', 'results', 'metadata'];
    collections.forEach(collection => {
      const collectionPath = path.join(this.dataDir, `${collection}.json`);
      if (!fs.existsSync(collectionPath)) {
        fs.writeFileSync(collectionPath, JSON.stringify([], null, 2));
      }
    });
    console.log('📦 ローカルDB初期化完了');
  }

  /**
   * サイト設定を保存
   */
  async saveSiteConfig(siteId, config) {
    const data = {
      id: siteId,
      ...config,
      updatedAt: new Date().toISOString(),
      version: 1
    };

    if (this.mode === 'local') {
      const sitesPath = path.join(this.dataDir, 'sites.json');
      const sites = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
      
      const existingIndex = sites.findIndex(s => s.id === siteId);
      if (existingIndex >= 0) {
        sites[existingIndex] = { ...sites[existingIndex], ...data };
      } else {
        sites.push(data);
      }
      
      fs.writeFileSync(sitesPath, JSON.stringify(sites, null, 2));
      console.log(`💾 サイト設定保存: ${siteId}`);
      return data;
    }
    
    // Firestore実装は将来対応
    throw new Error('Firestoreモードは未実装です');
  }

  /**
   * サイト設定を取得
   */
  async getSiteConfig(siteId) {
    if (this.mode === 'local') {
      const sitesPath = path.join(this.dataDir, 'sites.json');
      const sites = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
      return sites.find(s => s.id === siteId) || null;
    }
    
    throw new Error('Firestoreモードは未実装です');
  }

  /**
   * 全サイト設定を取得
   */
  async getAllSiteConfigs() {
    if (this.mode === 'local') {
      const sitesPath = path.join(this.dataDir, 'sites.json');
      return JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
    }
    
    throw new Error('Firestoreモードは未実装です');
  }

  /**
   * VRTセッションを保存
   */
  async saveVRTSession(sessionData) {
    const data = {
      id: sessionData.id || `session-${Date.now()}`,
      type: sessionData.type, // 'baseline' or 'comparison'
      siteId: sessionData.siteId,
      device: sessionData.device,
      urls: sessionData.urls || [],
      status: sessionData.status || 'running',
      results: sessionData.results || [],
      createdAt: new Date().toISOString(),
      completedAt: sessionData.completedAt || null,
      metadata: sessionData.metadata || {}
    };

    if (this.mode === 'local') {
      const sessionsPath = path.join(this.dataDir, 'sessions.json');
      const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
      
      const existingIndex = sessions.findIndex(s => s.id === data.id);
      if (existingIndex >= 0) {
        sessions[existingIndex] = { ...sessions[existingIndex], ...data };
      } else {
        sessions.push(data);
      }
      
      fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2));
      console.log(`📊 VRTセッション保存: ${data.id}`);
      return data;
    }
    
    throw new Error('Firestoreモードは未実装です');
  }

  /**
   * VRTセッションを取得
   */
  async getVRTSession(sessionId) {
    if (this.mode === 'local') {
      const sessionsPath = path.join(this.dataDir, 'sessions.json');
      const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
      return sessions.find(s => s.id === sessionId) || null;
    }
    
    throw new Error('Firestoreモードは未実装です');
  }

  /**
   * サイトのVRTセッション履歴を取得
   */
  async getSiteVRTHistory(siteId, limit = 50) {
    if (this.mode === 'local') {
      const sessionsPath = path.join(this.dataDir, 'sessions.json');
      const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
      
      return sessions
        .filter(s => s.siteId === siteId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
    }
    
    throw new Error('Firestoreモードは未実装です');
  }

  /**
   * 比較結果を保存
   */
  async saveComparisonResult(resultData) {
    const data = {
      id: `result-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionId: resultData.sessionId,
      siteId: resultData.siteId,
      device: resultData.device,
      status: resultData.status, // 'OK', 'NG', 'ERROR'
      diffPercentage: resultData.diffPercentage,
      diffPixels: resultData.diffPixels,
      threshold: resultData.threshold,
      baselineFile: resultData.baselineFile,
      afterFile: resultData.afterFile,
      diffFile: resultData.diffFile,
      url: resultData.url,
      pageId: resultData.pageId,
      createdAt: new Date().toISOString(),
      metadata: resultData.metadata || {}
    };

    if (this.mode === 'local') {
      const resultsPath = path.join(this.dataDir, 'results.json');
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      results.push(data);
      
      fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
      console.log(`📈 比較結果保存: ${data.id}`);
      return data;
    }
    
    throw new Error('Firestoreモードは未実装です');
  }

  /**
   * 比較結果の統計を取得
   */
  async getComparisonStats(siteId, days = 30) {
    if (this.mode === 'local') {
      const resultsPath = path.join(this.dataDir, 'results.json');
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const filteredResults = results.filter(r => 
        r.siteId === siteId && 
        new Date(r.createdAt) >= cutoffDate
      );

      return {
        total: filteredResults.length,
        ok: filteredResults.filter(r => r.status === 'OK').length,
        ng: filteredResults.filter(r => r.status === 'NG').length,
        error: filteredResults.filter(r => r.status === 'ERROR').length,
        avgDiffPercentage: filteredResults.length > 0 
          ? filteredResults.reduce((sum, r) => sum + (r.diffPercentage || 0), 0) / filteredResults.length 
          : 0,
        period: days,
        createdAt: new Date().toISOString()
      };
    }
    
    throw new Error('Firestoreモードは未実装です');
  }

  /**
   * メタデータを保存
   */
  async saveMetadata(key, data) {
    const metadata = {
      key,
      data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (this.mode === 'local') {
      const metadataPath = path.join(this.dataDir, 'metadata.json');
      const allMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      
      const existingIndex = allMetadata.findIndex(m => m.key === key);
      if (existingIndex >= 0) {
        allMetadata[existingIndex] = { ...allMetadata[existingIndex], ...metadata };
      } else {
        allMetadata.push(metadata);
      }
      
      fs.writeFileSync(metadataPath, JSON.stringify(allMetadata, null, 2));
      console.log(`🏷️ メタデータ保存: ${key}`);
      return metadata;
    }
    
    throw new Error('Firestoreモードは未実装です');
  }

  /**
   * メタデータを取得
   */
  async getMetadata(key) {
    if (this.mode === 'local') {
      const metadataPath = path.join(this.dataDir, 'metadata.json');
      const allMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      const found = allMetadata.find(m => m.key === key);
      return found ? found.data : null;
    }
    
    throw new Error('Firestoreモードは未実装です');
  }

  /**
   * データベースクリーンアップ（古いデータ削除）
   */
  async cleanup(daysToKeep = 90) {
    if (this.mode === 'local') {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // セッションクリーンアップ
      const sessionsPath = path.join(this.dataDir, 'sessions.json');
      const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
      const filteredSessions = sessions.filter(s => new Date(s.createdAt) >= cutoffDate);
      fs.writeFileSync(sessionsPath, JSON.stringify(filteredSessions, null, 2));

      // 結果クリーンアップ
      const resultsPath = path.join(this.dataDir, 'results.json');
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      const filteredResults = results.filter(r => new Date(r.createdAt) >= cutoffDate);
      fs.writeFileSync(resultsPath, JSON.stringify(filteredResults, null, 2));

      const deletedSessions = sessions.length - filteredSessions.length;
      const deletedResults = results.length - filteredResults.length;

      console.log(`🧹 DB クリーンアップ完了: ${deletedSessions}セッション, ${deletedResults}結果を削除`);
      
      return {
        deletedSessions,
        deletedResults,
        cutoffDate: cutoffDate.toISOString()
      };
    }
    
    throw new Error('Firestoreモードは未実装です');
  }

  /**
   * データベース統計情報を取得
   */
  async getStats() {
    if (this.mode === 'local') {
      const files = ['sites.json', 'sessions.json', 'results.json', 'metadata.json'];
      const stats = {};
      
      for (const file of files) {
        const filePath = path.join(this.dataDir, file);
        if (fs.existsSync(filePath)) {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const fileStats = fs.statSync(filePath);
          stats[file.replace('.json', '')] = {
            count: data.length,
            sizeKB: Math.round(fileStats.size / 1024),
            lastModified: fileStats.mtime.toISOString()
          };
        }
      }
      
      return {
        mode: this.mode,
        dataDir: this.dataDir,
        collections: stats,
        totalSizeKB: Object.values(stats).reduce((sum, s) => sum + s.sizeKB, 0),
        createdAt: new Date().toISOString()
      };
    }
    
    throw new Error('Firestoreモードは未実装です');
  }
}

// シングルトンインスタンス
let dbInstance = null;

function getDatabase(options = {}) {
  if (!dbInstance) {
    dbInstance = new VRTDatabase(options);
  }
  return dbInstance;
}

module.exports = {
  VRTDatabase,
  getDatabase
};