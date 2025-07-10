const crawler = require('./crawler');
const screenshotTaker = require('./screenshot');
const diffChecker = require('./diff');
const WordPressUpdater = require('./wordpress-updater');
const { initializeFirestore } = require('./firestore');
const { notifySlack, notifyDiscord } = require('./notifications');

class BatchProcessor {
  constructor() {
    this.db = initializeFirestore();
    this.updater = new WordPressUpdater();
    this.maxConcurrentSites = parseInt(process.env.MAX_CONCURRENT_SITES) || 5;
    this.diffThreshold = parseFloat(process.env.DIFF_THRESHOLD) || 2.0;
    this.criticalThreshold = parseFloat(process.env.CRITICAL_THRESHOLD) || 10.0;
  }

  /**
   * バッチ処理のメインエントリーポイント
   */
  async processBatch(options = {}) {
    const {
      sites = 'all',
      mode = 'full',
      autoUpdate = false,
      rollbackOnCritical = false,
      notifyOnSuccess = false
    } = options;

    try {
      console.log('Starting batch VRT process...', options);

      // サイト一覧の取得
      const siteList = await this.getSiteList(sites);
      console.log(`Processing ${siteList.length} sites`);

      // 並列処理でサイトを処理
      const results = await this.processMultipleSites(siteList, {
        mode,
        autoUpdate,
        rollbackOnCritical
      });

      // 結果の集計
      const summary = this.summarizeResults(results);
      
      // 通知の送信
      if (summary.hasNGResults || notifyOnSuccess) {
        await this.sendBatchNotification(summary, results);
      }

      // 結果の保存
      await this.saveBatchResults(results, summary);

      console.log('Batch VRT process completed', summary);
      return { success: true, summary, results };

    } catch (error) {
      console.error('Batch VRT process failed:', error);
      await this.handleBatchError(error, options);
      throw error;
    }
  }

  /**
   * 複数サイトの並列処理
   */
  async processMultipleSites(siteList, options) {
    const results = [];
    const chunks = this.chunkArray(siteList, this.maxConcurrentSites);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(site => 
        this.processSingleSite(site, options)
          .catch(error => ({
            siteId: site.id,
            siteUrl: site.url,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          }))
      );

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      // 次のチャンクを処理する前に少し待機
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    return results;
  }

  /**
   * 単一サイトの処理
   */
  async processSingleSite(site, options) {
    const { mode, autoUpdate, rollbackOnCritical } = options;
    const startTime = Date.now();

    try {
      console.log(`Processing site: ${site.url}`);

      const result = {
        siteId: site.id,
        siteUrl: site.url,
        mode,
        timestamp: new Date().toISOString(),
        processingTime: 0
      };

      // 更新前のヘルスチェック
      const healthCheck = await this.updater.performHealthCheck(site);
      if (!healthCheck.healthy) {
        throw new Error(`Site health check failed: ${healthCheck.error}`);
      }

      if (mode === 'full' || mode === 'baseline') {
        // 1. Baseline撮影
        console.log(`Taking baseline screenshots for ${site.url}`);
        const baselineResult = await this.takeScreenshots(site, 'baseline');
        result.baseline = baselineResult;
      }

      if (autoUpdate && (mode === 'full' || mode === 'update')) {
        // 2. WordPress更新
        console.log(`Updating WordPress for ${site.url}`);
        const updateResult = await this.updater.updateWordPressSite(site);
        result.update = updateResult;

        // 更新後のヘルスチェック
        const postUpdateHealthCheck = await this.updater.performHealthCheck(site);
        if (!postUpdateHealthCheck.healthy) {
          throw new Error(`Post-update health check failed: ${postUpdateHealthCheck.error}`);
        }
      }

      if (mode === 'full' || mode === 'after') {
        // 3. After撮影
        console.log(`Taking after screenshots for ${site.url}`);
        const afterResult = await this.takeScreenshots(site, 'after');
        result.after = afterResult;
      }

      if (mode === 'full' || mode === 'compare') {
        // 4. 差分比較
        console.log(`Comparing screenshots for ${site.url}`);
        const diffResult = await this.performDiffCheck(site);
        result.diff = diffResult;

        // 重大な差分がある場合の自動ロールバック
        if (rollbackOnCritical && diffResult.status === 'NG' && diffResult.criticalPagesCount > 0) {
          console.log(`Performing automatic rollback for ${site.url}`);
          const rollbackResult = await this.performAutoRollback(site);
          result.rollback = rollbackResult;
        }
      }

      result.processingTime = Date.now() - startTime;
      result.success = true;

      console.log(`Successfully processed site: ${site.url}`);
      return result;

    } catch (error) {
      console.error(`Failed to process site ${site.url}:`, error);
      
      return {
        siteId: site.id,
        siteUrl: site.url,
        mode,
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * スクリーンショット撮影
   */
  async takeScreenshots(site, type) {
    const browser = await screenshotTaker.launchBrowser();
    
    try {
      // サイトクロール
      const urls = await crawler.crawl(browser, site.url, {
        maxUrls: site.maxUrls || 300,
        maxDepth: site.maxDepth || 3
      });

      // スクリーンショット撮影
      const screenshots = [];
      for (const url of urls) {
        const screenshot = await screenshotTaker.takeScreenshot(browser, url, type);
        screenshots.push(screenshot);
      }

      return {
        type,
        urlCount: urls.length,
        screenshots: screenshots.length,
        timestamp: new Date().toISOString()
      };

    } finally {
      await browser.close();
    }
  }

  /**
   * 差分チェック
   */
  async performDiffCheck(site) {
    const diffResults = await diffChecker.compareAllScreenshots(site.id);
    
    const ngResults = diffResults.filter(r => r.status === 'NG');
    const criticalResults = diffResults.filter(r => r.diffPercent > this.criticalThreshold);

    return {
      status: ngResults.length > 0 ? 'NG' : 'OK',
      totalPages: diffResults.length,
      ngPagesCount: ngResults.length,
      criticalPagesCount: criticalResults.length,
      avgDiffPercent: diffResults.reduce((sum, r) => sum + r.diffPercent, 0) / diffResults.length,
      results: diffResults
    };
  }

  /**
   * 自動ロールバック
   */
  async performAutoRollback(site) {
    try {
      const backupTimestamp = await this.findLatestBackup(site.id);
      if (!backupTimestamp) {
        throw new Error('No backup found for rollback');
      }

      const rollbackResult = await this.updater.rollbackWordPressSite(site, backupTimestamp);
      
      // ロールバック後のヘルスチェック
      const healthCheck = await this.updater.performHealthCheck(site);
      
      return {
        success: true,
        backupTimestamp,
        rollbackResult,
        healthCheck
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * サイト一覧の取得
   */
  async getSiteList(sites) {
    if (sites === 'all') {
      const snapshot = await this.db.collection('sites').get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    if (Array.isArray(sites)) {
      const siteList = [];
      for (const siteId of sites) {
        const doc = await this.db.collection('sites').doc(siteId).get();
        if (doc.exists) {
          siteList.push({ id: doc.id, ...doc.data() });
        }
      }
      return siteList;
    }
    
    throw new Error('Invalid sites parameter');
  }

  /**
   * 結果の集計
   */
  summarizeResults(results) {
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const ngCount = results.filter(r => r.success && r.diff?.status === 'NG').length;
    const criticalCount = results.filter(r => r.success && r.diff?.criticalPagesCount > 0).length;

    return {
      totalSites: results.length,
      successCount,
      failureCount,
      ngCount,
      criticalCount,
      hasNGResults: ngCount > 0,
      hasCriticalResults: criticalCount > 0,
      avgProcessingTime: results.reduce((sum, r) => sum + (r.processingTime || 0), 0) / results.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * バッチ通知の送信
   */
  async sendBatchNotification(summary, results) {
    const message = this.createBatchNotificationMessage(summary, results);

    const notifications = [];
    
    if (process.env.SLACK_WEBHOOK_URL) {
      notifications.push(notifySlack(message));
    }
    
    if (process.env.DISCORD_WEBHOOK_URL) {
      notifications.push(notifyDiscord(message));
    }

    await Promise.allSettled(notifications);
  }

  /**
   * バッチ通知メッセージの作成
   */
  createBatchNotificationMessage(summary, results) {
    const emoji = summary.hasCriticalResults ? '🚨' : summary.hasNGResults ? '⚠️' : '✅';
    const status = summary.hasCriticalResults ? 'Critical' : summary.hasNGResults ? 'Warning' : 'OK';

    return {
      text: `${emoji} WordPress VRT Batch Check - ${status}`,
      attachments: [{
        color: summary.hasCriticalResults ? 'danger' : summary.hasNGResults ? 'warning' : 'good',
        fields: [
          { title: 'Total Sites', value: summary.totalSites.toString(), short: true },
          { title: 'Success', value: summary.successCount.toString(), short: true },
          { title: 'Failures', value: summary.failureCount.toString(), short: true },
          { title: 'NG Results', value: summary.ngCount.toString(), short: true },
          { title: 'Critical Results', value: summary.criticalCount.toString(), short: true },
          { title: 'Avg Processing Time', value: `${Math.round(summary.avgProcessingTime / 1000)}s`, short: true }
        ]
      }]
    };
  }

  /**
   * バッチ結果の保存
   */
  async saveBatchResults(results, summary) {
    const batchId = `batch_${Date.now()}`;
    
    await this.db.collection('batch_results').doc(batchId).set({
      summary,
      results,
      timestamp: new Date().toISOString()
    });

    console.log(`Batch results saved with ID: ${batchId}`);
  }

  /**
   * バッチエラーの処理
   */
  async handleBatchError(error, options) {
    console.error('Batch processing error:', error);

    // エラー通知
    if (process.env.SLACK_WEBHOOK_URL) {
      await notifySlack({
        text: '🚨 WordPress VRT Batch Check Failed',
        attachments: [{
          color: 'danger',
          fields: [
            { title: 'Error', value: error.message, short: false },
            { title: 'Options', value: JSON.stringify(options, null, 2), short: false }
          ]
        }]
      });
    }
  }

  /**
   * 配列をチャンクに分割
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 最新のバックアップを探す
   */
  async findLatestBackup(siteId) {
    const snapshot = await this.db
      .collection('backups')
      .where('siteId', '==', siteId)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data().timestamp;
  }
}

module.exports = BatchProcessor;