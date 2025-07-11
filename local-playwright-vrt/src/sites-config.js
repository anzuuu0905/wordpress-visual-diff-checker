/**
 * 🌐 複数サイト管理設定
 * 最大30サイトまでの設定を管理
 */

const SITES_CONFIG = {
  // デモサイト例
  "demo-site-1": {
    name: "デモサイト1",
    baseUrl: "https://example.com",
    maxPages: 30,
    enabled: true,
    crawlSettings: {
      maxDepth: 3,
      excludePatterns: [
        /\/wp-admin/,
        /\/admin/,
        /\?.*preview/
      ]
    }
  },
  
  "demo-site-2": {
    name: "デモサイト2", 
    baseUrl: "https://blog.example.com",
    maxPages: 20,
    enabled: true,
    crawlSettings: {
      maxDepth: 2,
      excludePatterns: [
        /\/tag\//,
        /\/category\//
      ]
    }
  },
  
  "demo-site-3": {
    name: "デモサイト3",
    baseUrl: "https://shop.example.com",
    maxPages: 50,
    enabled: false, // 無効化されたサイト
    crawlSettings: {
      maxDepth: 3,
      excludePatterns: [
        /\/cart/,
        /\/checkout/,
        /\/my-account/
      ]
    }
  }
  
  // 実際の運用では最大30サイトまで追加可能
};

/**
 * サイト設定管理クラス
 */
class SitesManager {
  constructor() {
    this.sites = SITES_CONFIG;
  }
  
  /**
   * 有効なサイト一覧を取得
   */
  getEnabledSites() {
    return Object.entries(this.sites)
      .filter(([_, config]) => config.enabled)
      .map(([id, config]) => ({ id, ...config }));
  }
  
  /**
   * 全サイト一覧を取得
   */
  getAllSites() {
    return Object.entries(this.sites)
      .map(([id, config]) => ({ id, ...config }));
  }
  
  /**
   * サイトIDからサイト情報を取得
   */
  getSite(siteId) {
    return this.sites[siteId];
  }
  
  /**
   * サイトを追加
   */
  addSite(siteId, config) {
    if (Object.keys(this.sites).length >= 30) {
      throw new Error('最大30サイトまでしか登録できません');
    }
    
    if (this.sites[siteId]) {
      throw new Error(`サイトID ${siteId} は既に存在します`);
    }
    
    this.sites[siteId] = {
      name: config.name || siteId,
      baseUrl: config.baseUrl,
      maxPages: config.maxPages || 30,
      enabled: config.enabled !== false,
      crawlSettings: config.crawlSettings || {
        maxDepth: 3,
        excludePatterns: []
      }
    };
    
    return this.sites[siteId];
  }
  
  /**
   * サイト設定を更新
   */
  updateSite(siteId, updates) {
    if (!this.sites[siteId]) {
      throw new Error(`サイトID ${siteId} が見つかりません`);
    }
    
    this.sites[siteId] = {
      ...this.sites[siteId],
      ...updates
    };
    
    return this.sites[siteId];
  }
  
  /**
   * サイトを削除
   */
  deleteSite(siteId) {
    if (!this.sites[siteId]) {
      throw new Error(`サイトID ${siteId} が見つかりません`);
    }
    
    delete this.sites[siteId];
    return true;
  }
  
  /**
   * サイトの有効/無効を切り替え
   */
  toggleSite(siteId) {
    if (!this.sites[siteId]) {
      throw new Error(`サイトID ${siteId} が見つかりません`);
    }
    
    this.sites[siteId].enabled = !this.sites[siteId].enabled;
    return this.sites[siteId];
  }
  
  /**
   * 複数サイトのバッチ処理用設定を取得
   */
  getBatchProcessingSites(siteIds = 'all') {
    if (siteIds === 'all') {
      return this.getEnabledSites();
    }
    
    if (Array.isArray(siteIds)) {
      return siteIds
        .map(id => ({ id, ...this.sites[id] }))
        .filter(site => site.enabled);
    }
    
    // 単一サイトID
    const site = this.sites[siteIds];
    return site && site.enabled ? [{ id: siteIds, ...site }] : [];
  }
}

// シングルトンインスタンス
const sitesManager = new SitesManager();

module.exports = {
  sitesManager,
  SITES_CONFIG
};