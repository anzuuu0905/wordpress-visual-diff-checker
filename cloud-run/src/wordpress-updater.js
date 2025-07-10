const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const execPromise = util.promisify(exec);

class WordPressUpdater {
  constructor(config = {}) {
    this.config = {
      timeout: 300000, // 5 minutes
      retries: 3,
      backupBeforeUpdate: true,
      ...config
    };
  }

  /**
   * WordPress サイトの自動更新
   */
  async updateWordPressSite(siteData) {
    const { url, updateMethod, credentials } = siteData;
    
    try {
      console.log(`Starting WordPress update for ${url}`);
      
      let result;
      switch (updateMethod) {
        case 'wp-cli':
          result = await this.updateViaWPCLI(siteData);
          break;
        case 'rest-api':
          result = await this.updateViaRestAPI(siteData);
          break;
        case 'ssh':
          result = await this.updateViaSSH(siteData);
          break;
        default:
          throw new Error(`Unsupported update method: ${updateMethod}`);
      }
      
      console.log(`WordPress update completed for ${url}`);
      return result;
      
    } catch (error) {
      console.error(`WordPress update failed for ${url}:`, error.message);
      throw error;
    }
  }

  /**
   * WP-CLI による更新
   */
  async updateViaWPCLI(siteData) {
    const { url, wpcliPath, installPath } = siteData;
    
    const commands = [
      // バックアップ作成
      `${wpcliPath} db export backup-$(date +%Y%m%d-%H%M%S).sql --path=${installPath}`,
      
      // コア更新
      `${wpcliPath} core update --path=${installPath}`,
      
      // プラグイン更新
      `${wpcliPath} plugin update --all --path=${installPath}`,
      
      // テーマ更新
      `${wpcliPath} theme update --all --path=${installPath}`,
      
      // キャッシュクリア
      `${wpcliPath} cache flush --path=${installPath}`,
      
      // パーマリンク更新
      `${wpcliPath} rewrite flush --path=${installPath}`
    ];
    
    const results = [];
    
    for (const command of commands) {
      try {
        const { stdout, stderr } = await execPromise(command, {
          timeout: this.config.timeout
        });
        
        results.push({
          command,
          success: true,
          output: stdout,
          error: stderr
        });
        
        console.log(`✓ ${command}`);
        
      } catch (error) {
        results.push({
          command,
          success: false,
          error: error.message
        });
        
        console.error(`✗ ${command}: ${error.message}`);
        
        // 重要なコマンドが失敗した場合は停止
        if (command.includes('core update') || command.includes('plugin update')) {
          throw error;
        }
      }
    }
    
    return {
      method: 'wp-cli',
      success: true,
      results
    };
  }

  /**
   * REST API による更新
   */
  async updateViaRestAPI(siteData) {
    const { url, credentials } = siteData;
    const { username, password } = credentials;
    
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    };
    
    const results = [];
    
    try {
      // 1. プラグイン一覧取得
      const pluginsResponse = await axios.get(`${url}/wp-json/wp/v2/plugins`, { headers });
      const plugins = pluginsResponse.data;
      
      // 2. 更新が必要なプラグインを特定
      const updatablePlugins = plugins.filter(plugin => plugin.update_available);
      
      // 3. プラグインを順次更新
      for (const plugin of updatablePlugins) {
        try {
          const updateResponse = await axios.post(
            `${url}/wp-json/wp/v2/plugins/${plugin.plugin}`,
            { status: 'active' },
            { headers }
          );
          
          results.push({
            type: 'plugin',
            name: plugin.name,
            success: true,
            version: updateResponse.data.version
          });
          
        } catch (error) {
          results.push({
            type: 'plugin',
            name: plugin.name,
            success: false,
            error: error.message
          });
        }
      }
      
      // 4. テーマ一覧取得と更新
      const themesResponse = await axios.get(`${url}/wp-json/wp/v2/themes`, { headers });
      const themes = themesResponse.data;
      
      const updatableThemes = themes.filter(theme => theme.update_available);
      
      for (const theme of updatableThemes) {
        try {
          const updateResponse = await axios.post(
            `${url}/wp-json/wp/v2/themes/${theme.stylesheet}`,
            { status: 'active' },
            { headers }
          );
          
          results.push({
            type: 'theme',
            name: theme.name,
            success: true,
            version: updateResponse.data.version
          });
          
        } catch (error) {
          results.push({
            type: 'theme',
            name: theme.name,
            success: false,
            error: error.message
          });
        }
      }
      
      return {
        method: 'rest-api',
        success: true,
        results
      };
      
    } catch (error) {
      throw new Error(`REST API update failed: ${error.message}`);
    }
  }

  /**
   * SSH による更新
   */
  async updateViaSSH(siteData) {
    const { sshHost, sshUser, sshKey, installPath } = siteData;
    
    const sshConfig = `-i ${sshKey} -o StrictHostKeyChecking=no`;
    const sshCommand = `ssh ${sshConfig} ${sshUser}@${sshHost}`;
    
    const commands = [
      // バックアップ作成
      `"cd ${installPath} && wp db export backup-$(date +%Y%m%d-%H%M%S).sql"`,
      
      // コア更新
      `"cd ${installPath} && wp core update"`,
      
      // プラグイン更新
      `"cd ${installPath} && wp plugin update --all"`,
      
      // テーマ更新
      `"cd ${installPath} && wp theme update --all"`,
      
      // キャッシュクリア
      `"cd ${installPath} && wp cache flush"`,
      
      // パーマリンク更新
      `"cd ${installPath} && wp rewrite flush"`
    ];
    
    const results = [];
    
    for (const command of commands) {
      try {
        const { stdout, stderr } = await execPromise(`${sshCommand} ${command}`, {
          timeout: this.config.timeout
        });
        
        results.push({
          command,
          success: true,
          output: stdout,
          error: stderr
        });
        
        console.log(`✓ SSH: ${command}`);
        
      } catch (error) {
        results.push({
          command,
          success: false,
          error: error.message
        });
        
        console.error(`✗ SSH: ${command}: ${error.message}`);
        
        // 重要なコマンドが失敗した場合は停止
        if (command.includes('core update') || command.includes('plugin update')) {
          throw error;
        }
      }
    }
    
    return {
      method: 'ssh',
      success: true,
      results
    };
  }

  /**
   * WordPress サイトの自動ロールバック
   */
  async rollbackWordPressSite(siteData, backupTimestamp) {
    const { url, updateMethod } = siteData;
    
    try {
      console.log(`Starting rollback for ${url}`);
      
      let result;
      switch (updateMethod) {
        case 'wp-cli':
          result = await this.rollbackViaWPCLI(siteData, backupTimestamp);
          break;
        case 'ssh':
          result = await this.rollbackViaSSH(siteData, backupTimestamp);
          break;
        default:
          throw new Error(`Rollback not supported for method: ${updateMethod}`);
      }
      
      console.log(`Rollback completed for ${url}`);
      return result;
      
    } catch (error) {
      console.error(`Rollback failed for ${url}:`, error.message);
      throw error;
    }
  }

  /**
   * WP-CLI によるロールバック
   */
  async rollbackViaWPCLI(siteData, backupTimestamp) {
    const { wpcliPath, installPath } = siteData;
    
    const commands = [
      // データベースリストア
      `${wpcliPath} db import backup-${backupTimestamp}.sql --path=${installPath}`,
      
      // キャッシュクリア
      `${wpcliPath} cache flush --path=${installPath}`,
      
      // パーマリンク更新
      `${wpcliPath} rewrite flush --path=${installPath}`
    ];
    
    const results = [];
    
    for (const command of commands) {
      try {
        const { stdout, stderr } = await execPromise(command, {
          timeout: this.config.timeout
        });
        
        results.push({
          command,
          success: true,
          output: stdout,
          error: stderr
        });
        
        console.log(`✓ Rollback: ${command}`);
        
      } catch (error) {
        results.push({
          command,
          success: false,
          error: error.message
        });
        
        console.error(`✗ Rollback: ${command}: ${error.message}`);
        throw error;
      }
    }
    
    return {
      method: 'wp-cli-rollback',
      success: true,
      results
    };
  }

  /**
   * 更新前のヘルスチェック
   */
  async performHealthCheck(siteData) {
    const { url } = siteData;
    
    try {
      // サイトの応答チェック
      const response = await axios.get(url, { timeout: 10000 });
      
      if (response.status !== 200) {
        throw new Error(`Site returned status ${response.status}`);
      }
      
      // WordPress管理画面の応答チェック
      const adminResponse = await axios.get(`${url}/wp-admin/`, { 
        timeout: 10000,
        validateStatus: (status) => status < 500 // 500未満は正常
      });
      
      return {
        healthy: true,
        siteStatus: response.status,
        adminStatus: adminResponse.status,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 更新可能なプラグイン・テーマの確認
   */
  async checkAvailableUpdates(siteData) {
    const { url, updateMethod, credentials } = siteData;
    
    try {
      if (updateMethod === 'rest-api') {
        const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
        const headers = {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        };
        
        const [pluginsResponse, themesResponse] = await Promise.all([
          axios.get(`${url}/wp-json/wp/v2/plugins`, { headers }),
          axios.get(`${url}/wp-json/wp/v2/themes`, { headers })
        ]);
        
        const updatablePlugins = pluginsResponse.data.filter(plugin => plugin.update_available);
        const updatableThemes = themesResponse.data.filter(theme => theme.update_available);
        
        return {
          plugins: updatablePlugins.map(p => ({
            name: p.name,
            currentVersion: p.version,
            newVersion: p.new_version
          })),
          themes: updatableThemes.map(t => ({
            name: t.name,
            currentVersion: t.version,
            newVersion: t.new_version
          })),
          hasUpdates: updatablePlugins.length > 0 || updatableThemes.length > 0
        };
      }
      
      // WP-CLI や SSH の場合は別の実装
      return { hasUpdates: false, plugins: [], themes: [] };
      
    } catch (error) {
      console.error('Failed to check available updates:', error.message);
      return { hasUpdates: false, plugins: [], themes: [], error: error.message };
    }
  }
}

module.exports = WordPressUpdater;