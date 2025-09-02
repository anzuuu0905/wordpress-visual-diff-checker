/**
 * 🔐 セキュリティユーティリティ
 * 認証情報の暗号化・復号化
 */

const crypto = require('crypto');

// 暗号化キー（本番では環境変数から取得）
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
const IV_LENGTH = 16;

/**
 * 文字列を暗号化
 */
function encrypt(text) {
  if (!text) return text;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * 文字列を復号化
 */
function decrypt(text) {
  if (!text || !text.includes(':')) return text;
  
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = textParts.join(':');
  
  const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * 設定ファイルから機密情報を安全に取得
 */
function getSecureCredentials(siteConfig) {
  if (siteConfig.admin) {
    return {
      ...siteConfig.admin,
      username: decrypt(siteConfig.admin.username),
      password: decrypt(siteConfig.admin.password)
    };
  }
  return null;
}

/**
 * 機密情報を暗号化して保存
 */
function setSecureCredentials(username, password) {
  return {
    username: encrypt(username),
    password: encrypt(password)
  };
}

module.exports = {
  encrypt,
  decrypt,
  getSecureCredentials,
  setSecureCredentials
};