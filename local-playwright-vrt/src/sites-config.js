/**
 * 🌐 複数サイト管理設定
 * 最大30サイトまでの設定を管理
 */

const fs = require('fs-extra');
const path = require('path');
const { getSecureCredentials } = require('../../src/security');

// デフォルトのサイト設定
const DEFAULT_SITES_CONFIG = {
  "demo-site-1": {
    name: "テストサイト（更新確認用）",
    baseUrl: "https://www.hiro-blogs.com/tool/clp/url-search-regular/",
    maxPages: 10,
    enabled: true,
    crawlSettings: {
      maxDepth: 3,
      excludePatterns: [
        /\/wp-admin/,
        /\/admin/,
        /\?.*preview/
      ]
    }
  }
};

/**
 * 外部JSONファイルからサイト設定を読み込む
 */
function loadSitesFromJSON() {
  const configPaths = [
    path.join(__dirname, '..', 'config.json'),
    path.join(__dirname, '..', 'sites.json'),
    '/Users/kando/Documents/00_webcreate/00_Work/02_ツール制作/20250708_プラグインデータ収集のみ/config.json'
  ];
  
  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        console.log(`📁 サイト設定を読み込み: ${configPath}`);
        const jsonData = fs.readFileSync(configPath, 'utf8');
        const sites = JSON.parse(jsonData);
        
        if (Array.isArray(sites)) {
          const convertedSites = {};
          console.log(`📊 処理開始: ${sites.length}サイトを変換します`);
          sites.forEach((site, index) => {
            // URLを正規化
            let baseUrl = site.url;
            if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
              baseUrl = 'https://' + baseUrl;
            }
            
            // サイトIDを生成（日本語文字対応）
            const siteId = `site-${index + 1}-${site.siteName.replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '').replace(/\s+/g, '-').toLowerCase()}`;
            
            convertedSites[siteId] = {
              name: site.siteName,
              baseUrl: baseUrl,
              maxPages: 20,
              enabled: true,
              crawlSettings: {
                maxDepth: 3,
                excludePatterns: [
                  /\/wp-admin/,
                  /\/admin/,
                  /\/wp-login/,
                  /\?.*preview/,
                  /\?.*login/
                ]
              },
              // 管理情報（VRT用途では使用しないが保持）
              admin: {
                loginUrl: site.urladmin,
                username: site.username,
                password: site.password
              }
            };
            console.log(`✓ ${index + 1}. ${site.siteName} (${siteId})`);
          });
          
          console.log(`✅ ${Object.keys(convertedSites).length}サイトを読み込みました`);
          return convertedSites;
        }
      }
    } catch (error) {
      console.log(`⚠️ ${configPath} の読み込みに失敗: ${error.message}`);
    }
  }
  
  console.log('📁 デフォルト設定を使用します');
  return DEFAULT_SITES_CONFIG;
}

// サイト設定を読み込み
const SITES_CONFIG = loadSitesFromJSON();

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
   * 安全な認証情報を取得（暗号化対応）
   */
  getSecureSite(siteId) {
    const site = this.sites[siteId];
    if (!site) return null;
    
    // 認証情報を復号化
    const secureCredentials = getSecureCredentials(site);
    
    return {
      ...site,
      admin: secureCredentials
    };
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
      maxPages: config.maxPages || 20,
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
        .map(id => this.sites[id] ? ({ id, ...this.sites[id] }) : null)
        .filter(site => site && site.enabled !== false);
    }
    
    // 単一サイトID
    const site = this.sites[siteIds];
    return site && site.enabled !== false ? [{ id: siteIds, ...site }] : [];
  }
}

// シングルトンインスタンス
const sitesManager = new SitesManager();

module.exports = {
  sitesManager,
  SITES_CONFIG
};