/**
 * 🔐 セキュアな設定読み込み
 * 認証情報を環境変数から取得
 */

require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');

/**
 * パスワードマスキング関数
 */
function maskPassword(password) {
  if (!password || password.length < 4) return '****';
  return password.substring(0, 2) + '*'.repeat(password.length - 4) + password.substring(password.length - 2);
}

/**
 * セキュアな認証情報取得
 */
function getSecureCredentials(siteName) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    // 本番環境では認証情報を返さない
    return null;
  }

  // 開発環境では環境変数から取得
  const siteKey = siteName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const username = process.env[`${siteKey}_USERNAME`];
  const password = process.env[`${siteKey}_PASSWORD`];

  if (username && password) {
    return {
      username,
      password,
      masked: {
        username,
        password: maskPassword(password)
      }
    };
  }

  return null;
}

/**
 * config.jsonを安全に読み込む
 */
function loadSecureConfig() {
  const configPath = path.join(__dirname, 'config.json');
  
  try {
    if (!fs.existsSync(configPath)) {
      console.log('⚠️ config.json が見つかりません');
      return [];
    }

    const jsonData = fs.readFileSync(configPath, 'utf8');
    const sites = JSON.parse(jsonData);

    // 認証情報を環境変数に置き換え
    const secureSites = sites.map((site, index) => {
      const credentials = getSecureCredentials(site.siteName);
      
      const secureSite = {
        siteName: site.siteName,
        url: site.url,
        urladmin: site.urladmin
      };

      // 開発環境でのみ認証情報を追加
      if (credentials) {
        secureSite.username = credentials.username;
        secureSite.password = credentials.password;
        console.log(`✅ ${site.siteName}: 認証情報を環境変数から取得`);
      } else {
        console.log(`⚠️ ${site.siteName}: 環境変数に認証情報がありません`);
      }

      return secureSite;
    });

    return secureSites;

  } catch (error) {
    console.error('❌ config.json 読み込みエラー:', error.message);
    return [];
  }
}

/**
 * VPS用の設定生成（認証情報なし）
 */
function generateProductionConfig(sites) {
  const productionSites = sites.map(site => ({
    siteName: site.siteName,
    url: site.url,
    // 認証情報は除外
    urladmin: null  // 管理機能も無効化
  }));

  const outputPath = path.join(__dirname, 'config-production.json');
  fs.writeFileSync(outputPath, JSON.stringify(productionSites, null, 2));
  console.log(`📁 本番用設定を出力: ${outputPath}`);
}

module.exports = {
  loadSecureConfig,
  getSecureCredentials,
  maskPassword,
  generateProductionConfig
};