/**
 * 🚀 Local WordPress VRT with Playwright
 * ローカル実行用の高精度スクリーンショット比較サーバー
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { chromium } = require('playwright');
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');
const sharp = require('sharp');
const SiteCrawler = require('./src/crawler');
const { sitesManager } = require('./src/sites-config');
const { ErrorHandler, VRTError } = require('../src/error-handler');
const { getDatabase } = require('../src/database');

const app = express();
const PORT = process.env.PORT || 3000;

// グローバルブラウザインスタンス（再利用）
let globalBrowser = null;

// エラーハンドラー初期化
const errorHandler = new ErrorHandler({
  logDir: path.join(__dirname, 'logs'),
  maxRetries: 3,
  retryDelay: 1000
});

// データベース初期化
const database = getDatabase({
  mode: 'local',
  dataDir: path.join(__dirname, 'data')
});

// スクリーンショット保存ディレクトリ
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const DIFFS_DIR = path.join(__dirname, 'diffs');
const RESULTS_DIR = path.join(__dirname, 'data', 'results');

// ディレクトリ作成
fs.ensureDirSync(SCREENSHOTS_DIR);
fs.ensureDirSync(DIFFS_DIR);
fs.ensureDirSync(RESULTS_DIR);

// ミドルウェア
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// スクリーンショットと差分画像を静的に提供
app.use('/screenshots', express.static(SCREENSHOTS_DIR));
app.use('/diffs', express.static(DIFFS_DIR));

// 設定
const CONFIG = {
  VIEWPORT: { width: 1920, height: 1080 },
  MOBILE_VIEWPORT: { width: 375, height: 667 },
  DIFF_THRESHOLD: 0.1,                    // 旧設定（間違って使用されていた）
  PIXELMATCH_THRESHOLD: 0.02,             // pixelmatch用色差許容度（正しい値）
  DIFF_JUDGMENT_THRESHOLD: 2.0,           // 差分率判定用閾値（2%超でNG）
  TIMEOUT: 60000,
  SCREENSHOT_QUALITY: 90,
  MAX_CONCURRENT_SITES: 5, // 同時処理サイト数（高速化）
  MAX_CONCURRENT_PAGES: 8, // 同時処理ページ数（最適化版：安定性重視）
  CLEANUP_OLD_FILES_DAYS: 90 // 3ヶ月以上古いファイルを削除
};

console.log('🚀 Local WordPress VRT Server Starting...');
console.log(`📁 Screenshots: ${SCREENSHOTS_DIR}`);

/**
 * 🗑️ 古いファイル自動削除
 */
async function cleanupOldFiles() {
  try {
    if (!fs.existsSync(SCREENSHOTS_DIR)) return;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CONFIG.CLEANUP_OLD_FILES_DAYS);
    
    let deletedCount = 0;
    const siteDirs = fs.readdirSync(SCREENSHOTS_DIR);
    
    for (const siteDir of siteDirs) {
      const sitePath = path.join(SCREENSHOTS_DIR, siteDir);
      if (!fs.statSync(sitePath).isDirectory()) continue;
      
      // baseline と after フォルダをチェック
      for (const type of ['baseline', 'after']) {
        const typePath = path.join(sitePath, type);
        if (!fs.existsSync(typePath)) continue;
        
        const deviceDirs = fs.readdirSync(typePath);
        for (const deviceDir of deviceDirs) {
          const devicePath = path.join(typePath, deviceDir);
          if (!fs.statSync(devicePath).isDirectory()) continue;
          
          const files = fs.readdirSync(devicePath);
          for (const file of files) {
            const filePath = path.join(devicePath, file);
            const stats = fs.statSync(filePath);
            
            if (stats.mtime < cutoffDate) {
              fs.unlinkSync(filePath);
              deletedCount++;
            }
          }
        }
      }
    }
    
    if (deletedCount > 0) {
      console.log(`🗑️ ${deletedCount}個の古いファイルを削除しました（${CONFIG.CLEANUP_OLD_FILES_DAYS}日以上前）`);
    }
  } catch (error) {
    console.error('⚠️ 古いファイル削除エラー:', error.message);
  }
}

// 起動時とその後定期的にクリーンアップ実行
cleanupOldFiles();
setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000); // 24時間ごと

/**
 * 💾 実行結果を保存
 */
function saveExecutionResult(type, siteId, result) {
  try {
    const timestamp = new Date().toISOString();
    const filename = `${siteId}_${type}_${timestamp.replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(RESULTS_DIR, filename);
    
    const resultData = {
      timestamp,
      type, // 'baseline', 'after', 'compare'
      siteId,
      siteName: result.siteName,
      ...result
    };
    
    fs.writeFileSync(filepath, JSON.stringify(resultData, null, 2));
    console.log(`💾 結果保存: ${filename}`);
    
    // 最新結果も別途保存（簡単アクセス用）
    const latestPath = path.join(RESULTS_DIR, `${siteId}_${type}_latest.json`);
    fs.writeFileSync(latestPath, JSON.stringify(resultData, null, 2));
    
  } catch (error) {
    console.error('⚠️ 結果保存エラー:', error.message);
  }
}
console.log(`📁 Diffs: ${DIFFS_DIR}`);

/**
 * 🚀 並列処理ヘルパー
 */
async function processConcurrent(items, processor, maxConcurrency) {
  const results = [];
  const errors = [];

  for (let i = 0; i < items.length; i += maxConcurrency) {
    const batch = items.slice(i, i + maxConcurrency);
    console.log(`⚡ 並列処理バッチ ${Math.floor(i/maxConcurrency) + 1}: ${batch.length}件処理`);

    const batchPromises = batch.map(async (item, index) => {
      try {
        const result = await processor(item, i + index);
        return { success: true, result, item };
      } catch (error) {
        console.error(`❌ 並列処理エラー [${i + index}]:`, error.message);
        return { success: false, error, item };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach(settled => {
      if (settled.status === 'fulfilled') {
        if (settled.value.success) {
          results.push(settled.value.result);
        } else {
          errors.push(settled.value);
        }
      } else {
        errors.push({ success: false, error: settled.reason, item: null });
      }
    });
  }

  return { results, errors };
}

/**
 * 🎯 ヘルスチェック
 */
app.get('/health', async (req, res) => {
  try {
    const dbStats = await database.getStats();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      playwright: 'ready',
      database: dbStats
    });
  } catch (error) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      playwright: 'ready',
      database: { error: error.message }
    });
  }
});

/**
 * 📊 データベース統計情報
 */
app.get('/stats', async (req, res) => {
  try {
    const stats = await database.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('❌ 統計情報取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 📈 サイト別統計情報
 */
app.get('/stats/:siteId', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { days = 30 } = req.query;
    
    const stats = await database.getComparisonStats(siteId, parseInt(days));
    const history = await database.getSiteVRTHistory(siteId, 10);
    
    res.json({ 
      success: true, 
      siteId,
      stats,
      recentHistory: history
    });
  } catch (error) {
    console.error('❌ サイト統計取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🧹 データベースクリーンアップ
 */
app.post('/cleanup', async (req, res) => {
  try {
    const { days = 90 } = req.body;
    const result = await database.cleanup(parseInt(days));
    
    res.json({ 
      success: true, 
      message: `${days}日より古いデータを削除しました`,
      result
    });
  } catch (error) {
    console.error('❌ クリーンアップエラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🔧 サイト管理API
 */
app.get('/sites', async (req, res) => {
  try {
    const sites = await database.getAllSiteConfigs();
    const managedSites = sitesManager.getAllSites();
    
    res.json({
      success: true,
      database: sites,
      managed: managedSites,
      total: managedSites.length
    });
  } catch (error) {
    console.error('❌ サイト一覧取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/sites', async (req, res) => {
  try {
    const { siteId, config } = req.body;
    if (!siteId || !config) {
      return res.status(400).json({
        success: false,
        error: 'siteId and config are required'
      });
    }

    // データベースに保存
    const savedConfig = await database.saveSiteConfig(siteId, config);
    
    res.json({
      success: true,
      site: savedConfig
    });
  } catch (error) {
    console.error('❌ サイト保存エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/sites/:siteId', async (req, res) => {
  try {
    const { siteId } = req.params;
    const site = await database.getSiteConfig(siteId);
    
    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'Site not found'
      });
    }
    
    res.json({
      success: true,
      site
    });
  } catch (error) {
    console.error('❌ サイト取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🎯 高精度スクリーンショット撮影
 */
app.post('/screenshot', async (req, res) => {
  try {
    const { url, siteId, type, device = 'desktop' } = req.body;

    if (!url || !siteId || !type) {
      return res.status(400).json({
        success: false,
        error: 'url, siteId, type are required'
      });
    }

    console.log(`📸 スクリーンショット撮影開始: ${url} (${device}, ${type})`);

    const result = await takeHighPrecisionScreenshot(url, siteId, type, device);

    res.json({ success: true, result });

  } catch (error) {
    console.error('❌ スクリーンショットエラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🎯 高精度画像比較
 */
app.post('/compare', async (req, res) => {
  try {
    const { siteId, device = 'desktop', threshold = 2.0 } = req.body;

    if (!siteId) {
      return res.status(400).json({
        success: false,
        error: 'siteId is required'
      });
    }

    console.log(`🔍 画像比較開始: ${siteId} (${device})`);

    const result = await compareHighPrecisionScreenshots(siteId, device, threshold);

    res.json({ success: true, result });

  } catch (error) {
    console.error('❌ 画像比較エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🎯 複数ページ画像比較
 */
app.post('/compare-multi', async (req, res) => {
  try {
    const { siteId, device = 'desktop', threshold = 2.0 } = req.body;

    if (!siteId) {
      return res.status(400).json({
        success: false,
        error: 'siteId is required'
      });
    }

    console.log(`🔍 複数ページ画像比較開始: ${siteId} (${device})`);

    const results = await compareMultiPageScreenshots(siteId, device, threshold);

    res.json({ success: true, results });

  } catch (error) {
    console.error('❌ 複数ページ比較エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🎯 フルVRTチェック
 */
app.post('/full-vrt', async (req, res) => {
  try {
    const { url, siteId, devices = ['desktop'] } = req.body;

    if (!url || !siteId) {
      return res.status(400).json({
        success: false,
        error: 'url and siteId are required'
      });
    }

    console.log(`🎯 フルVRTチェック開始: ${siteId}`);

    const result = await runFullVRTCheck(url, siteId, devices);

    res.json({ success: true, result });

  } catch (error) {
    console.error('❌ フルVRTエラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🕷️ サイトクロール
 */
app.post('/crawl', async (req, res) => {
  try {
    const { url, siteId, siteIds, maxPages = 30 } = req.body;

    if (!url && !siteId && !siteIds) {
      return res.status(400).json({
        success: false,
        error: 'url or siteId or siteIds are required'
      });
    }

    console.log(`🕷️ サイトクロール開始`);

    let targetSites = [];

    if (url) {
      // 単一URLクロール
      targetSites = [{ id: 'manual', name: 'Manual URL', baseUrl: url, maxPages }];
    } else {
      // 登録済みサイトクロール
      targetSites = siteIds ? sitesManager.getBatchProcessingSites(siteIds) :
                    siteId ? [{ id: siteId, ...sitesManager.getSite(siteId) }] : [];
    }

    if (targetSites.length === 0) {
      return res.status(400).json({
        success: false,
        error: '有効なサイトが見つかりません'
      });
    }

    const allResults = [];

    for (const site of targetSites) {
      console.log(`🕷️ ${site.id} をクロール中...`);

      const browser = await getBrowser();
      const context = await browser.newContext();
      const page = await context.newPage();

      const crawler = new SiteCrawler({
        maxPages: site.maxPages || maxPages,
        ...site.crawlSettings
      });
      const result = await crawler.crawl(page, site.baseUrl);

      await context.close();

      // ページ識別子を生成
      const pages = SiteCrawler.generatePageIdentifiers(result.urls, result.metadata);

      allResults.push({
        siteId: site.id,
        siteName: site.name,
        baseUrl: site.baseUrl,
        totalPages: pages.length,
        pages: pages,
        timestamp: new Date().toISOString()
      });
    }

    const summary = {
      totalSites: allResults.length,
      totalPages: allResults.reduce((sum, r) => sum + r.totalPages, 0)
    };

    console.log(`✅ クロール完了: ${summary.totalSites}サイト, ${summary.totalPages}ページ`);
    res.json({ success: true, summary, results: allResults });

  } catch (error) {
    console.error('❌ クロールエラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🎯 複数ページスクリーンショット撮影
 */
app.post('/screenshot-multi', async (req, res) => {
  try {
    const { pages, siteId, type, device = 'desktop' } = req.body;

    if (!pages || !siteId || !type) {
      return res.status(400).json({
        success: false,
        error: 'pages, siteId, type are required'
      });
    }

    console.log(`📸 複数ページスクリーンショット開始: ${siteId} (${pages.length}ページ)`);

    const results = [];
    for (const page of pages) {
      const result = await takeHighPrecisionScreenshot(
        page.url,
        siteId,
        type,
        device,
        page // ページ情報を渡す
      );
      results.push(result);
    }

    res.json({ success: true, results });

  } catch (error) {
    console.error('❌ 複数ページスクリーンショットエラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 📸 Step1: Baseline撮影機能
 */
app.post('/capture-baseline', async (req, res) => {
  try {
    const { url, pages, siteId, siteIds, device = 'desktop', crawlMode = 'auto', maxPages = 30 } = req.body;

    if (!siteId && !siteIds) {
      return res.status(400).json({
        success: false,
        error: 'siteId or siteIds are required'
      });
    }

    // 複数サイト対応
    const targetSites = siteIds ? sitesManager.getBatchProcessingSites(siteIds) :
                       siteId ? [{ id: siteId, ...sitesManager.getSite(siteId) }] : [];

    if (targetSites.length === 0) {
      return res.status(400).json({
        success: false,
        error: '有効なサイトが見つかりません'
      });
    }

    console.log(`📸 Step1: Baseline撮影開始: ${targetSites.map(s => s.id).join(', ')}`);

    const allResults = [];

    // 各サイトを並列処理
    const siteProcessor = async (site) => {
      console.log(`🎯 サイト処理中: ${site.id} (${site.name})`);

      let captureResults = [];
      let targetPages = pages;

      // ページが指定されていない場合はクロール (クロールモードが auto の場合)
      if (!targetPages && !url && crawlMode !== 'single') {
        console.log(`🕷️ ${site.id} のクロールを実行`);
        const browser = await getBrowser();
        const context = await browser.newContext();
        const page = await context.newPage();

        const crawler = new SiteCrawler({
          maxPages: maxPages || site.maxPages,
          ...site.crawlSettings
        });
        const crawlResult = await crawler.crawl(page, site.baseUrl);
        await context.close();

        targetPages = SiteCrawler.generatePageIdentifiers(crawlResult.urls, crawlResult.metadata);
        console.log(`🔍 ${targetPages.length}ページを発見`);
      }

      // Baseline撮影
      // セッションタイムスタンプを生成（サイト×デバイスごと）
      const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

      if (targetPages) {
        // 複数ページ並列撮影
        console.log(`📸 Baseline複数ページ撮影 (${targetPages.length}ページ) - セッション: ${sessionTimestamp}`);

        const pageProcessor = async (page) => {
          return await takeHighPrecisionScreenshot(
            page.url,
            site.id,
            'baseline',
            device,
            page,
            sessionTimestamp
          );
        };

        const { results: pageResults, errors: pageErrors } = await processConcurrent(
          targetPages,
          pageProcessor,
          CONFIG.MAX_CONCURRENT_PAGES
        );

        captureResults.push(...pageResults);

        if (pageErrors.length > 0) {
          console.log(`⚠️ ${pageErrors.length}ページでエラーが発生しました`);
        }
      } else {
        // 単一ページ撮影
        console.log(`📸 Baseline単一ページ撮影: ${url || site.baseUrl} - セッション: ${sessionTimestamp}`);
        const result = await takeHighPrecisionScreenshot(
          url || site.baseUrl,
          site.id,
          'baseline',
          device,
          undefined,
          sessionTimestamp
        );
        captureResults.push(result);
      }

      // サイト別結果を返す
      const siteResult = {
        siteId: site.id,
        siteName: site.name,
        device,
        captureCount: captureResults.length,
        captureResults: captureResults.map(r => ({
          url: r.url,
          filename: r.filename,
          timestamp: r.timestamp
        })),
        pages: targetPages, // ページ情報も保存
        timestamp: new Date().toISOString()
      };
      
      // 結果を保存
      saveExecutionResult('baseline', site.id, siteResult);
      
      return siteResult;
    };

    // サイトを並列処理
    const { results: siteResults, errors: siteErrors } = await processConcurrent(
      targetSites,
      siteProcessor,
      CONFIG.MAX_CONCURRENT_SITES
    );

    allResults.push(...siteResults);

    if (siteErrors.length > 0) {
      console.log(`⚠️ ${siteErrors.length}サイトでエラーが発生しました`);
    }

    // 全体的な統計
    const summary = {
      totalSites: allResults.length,
      totalPages: allResults.reduce((sum, r) => sum + r.captureCount, 0)
    };

    console.log(`✅ Step1: Baseline撮影完了: ${summary.totalSites}サイト, ${summary.totalPages}ページ`);
    res.json({ success: true, summary, results: allResults });

  } catch (error) {
    console.error('❌ Step1: Baseline撮影エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🚀 Step2+3統合実行（撮影→即座に比較）
 */
app.post('/capture-and-compare', async (req, res) => {
  try {
    const { url, pages, siteId, siteIds, device = 'desktop', threshold = 2.0, crawlMode = 'auto' } = req.body;

    if (!siteId && !siteIds) {
      return res.status(400).json({
        success: false,
        error: 'siteId or siteIds are required'
      });
    }

    // 複数サイト対応
    const targetSites = siteIds ? sitesManager.getBatchProcessingSites(siteIds) :
                       siteId ? [{ id: siteId, ...sitesManager.getSite(siteId) }] : [];

    if (targetSites.length === 0) {
      return res.status(400).json({
        success: false,
        error: '有効なサイトが見つかりません'
      });
    }

    console.log(`🚀 Step2+3統合実行開始: ${targetSites.map(s => s.id).join(', ')}`);

    const allResults = [];

    // 各サイトを処理
    for (const site of targetSites) {
      console.log(`🎯 サイト処理中: ${site.id} (${site.name})`);

      let captureResults = [];
      let targetPages = pages;

      // ページが指定されていない場合はクロール (クロールモードが auto の場合)
      if (!targetPages && !url && crawlMode !== 'single') {
        console.log(`🕷️ ${site.id} のクロールを実行`);
        const browser = await getBrowser();
        const context = await browser.newContext();
        const page = await context.newPage();

        const crawler = new SiteCrawler({
          maxPages: site.maxPages,
          ...site.crawlSettings
        });
        const crawlResult = await crawler.crawl(page, site.baseUrl);
        await context.close();

        targetPages = SiteCrawler.generatePageIdentifiers(crawlResult.urls, crawlResult.metadata);
        console.log(`🔍 ${targetPages.length}ページを発見`);
      }

      // Step2: 撮影
      // セッションタイムスタンプを生成（サイト×デバイスごと）
      const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

      if (targetPages) {
        // 複数ページ並列撮影
        console.log(`📸 複数ページ撮影 (${targetPages.length}ページ) - セッション: ${sessionTimestamp}`);

        const pageProcessor = async (page) => {
          return await takeHighPrecisionScreenshot(
            page.url,
            site.id,
            'after',
            device,
            page,
            sessionTimestamp
          );
        };

        const { results: pageResults, errors: pageErrors } = await processConcurrent(
          targetPages,
          pageProcessor,
          CONFIG.MAX_CONCURRENT_PAGES
        );

        captureResults.push(...pageResults);

        if (pageErrors.length > 0) {
          console.log(`⚠️ ${pageErrors.length}ページでエラーが発生しました`);
        }
      } else {
        // 単一ページ撮影
        console.log(`📸 単一ページ撮影: ${url || site.baseUrl} - セッション: ${sessionTimestamp}`);
        const result = await takeHighPrecisionScreenshot(
          url || site.baseUrl,
          site.id,
          'after',
          device,
          undefined,
          sessionTimestamp
        );
        captureResults.push(result);
      }

      // Step3: 比較（Baselineが存在する場合のみ）
      console.log(`🔍 比較処理開始 (閾値: ${threshold}%)`);
      let compareResults;

      try {
        if (targetPages && targetPages.length > 1) {
          // 複数ページ比較
          compareResults = await compareMultiPageScreenshots(site.id, device, threshold);
        } else {
          // 単一ページ比較
          compareResults = await compareHighPrecisionScreenshots(site.id, device, threshold);
        }
      } catch (error) {
        console.log(`⚠️ ${site.id} の比較をスキップ: ${error.message}`);
        compareResults = {
          status: 'SKIP',
          message: 'Baselineスクリーンショットが見つかりません。先にStep1でBaseline撮影を実行してください。',
          error: error.message
        };
      }

      // サイト別結果
      const siteResult = {
        siteId: site.id,
        siteName: site.name,
        device,
        threshold,
        captureCount: captureResults.length,
        captureResults: captureResults.map(r => ({
          url: r.url,
          filename: r.filename,
          timestamp: r.timestamp
        })),
        compareResults: compareResults,
        timestamp: new Date().toISOString()
      };
      
      // After結果とCompare結果を保存
      saveExecutionResult('after', site.id, siteResult);
      saveExecutionResult('compare', site.id, siteResult);
      
      allResults.push(siteResult);
    }

    // 全体的な統計
    const summary = {
      totalSites: allResults.length,
      totalPages: allResults.reduce((sum, r) => sum + r.captureCount, 0),
      ngSites: allResults.filter(r =>
        r.compareResults.summary ? r.compareResults.summary.ng > 0 :
        r.compareResults.status === 'NG'
      ).length
    };

    console.log(`✅ Step2+3統合実行完了: ${summary.totalSites}サイト, ${summary.totalPages}ページ`);
    
    // 完了通知音を鳴らす
    console.log('\x07'); // ベル音
    try {
      require('child_process').exec('afplay /System/Library/Sounds/Glass.aiff', () => {});
    } catch (err) {
      console.log('🔔 処理完了！');
    }
    
    res.json({ success: true, summary, results: allResults });

  } catch (error) {
    console.error('❌ Step2+3統合実行エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 📈 結果一覧取得
 */
app.get('/results', (req, res) => {
  try {
    const results = [];
    const siteDirs = fs.readdirSync(SCREENSHOTS_DIR).filter(dir =>
      fs.statSync(path.join(SCREENSHOTS_DIR, dir)).isDirectory()
    );

    siteDirs.forEach(siteId => {
      const siteDir = path.join(SCREENSHOTS_DIR, siteId);
      const site = sitesManager.getSite(siteId) || { name: siteId, baseUrl: 'Unknown' };

      const siteResult = {
        siteId,
        siteName: site.name,
        baseUrl: site.baseUrl,
        devices: []
      };

      const devices = ['desktop', 'mobile'];
      devices.forEach(device => {
        const baselineDir = path.join(siteDir, 'baseline', device);
        const afterDir = path.join(siteDir, 'after', device);

        const deviceResult = {
          device,
          baseline: { count: 0, latest: null },
          after: { count: 0, latest: null },
          hasBaseline: fs.existsSync(baselineDir),
          hasAfter: fs.existsSync(afterDir)
        };

        if (deviceResult.hasBaseline) {
          const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));
          deviceResult.baseline.count = baselineFiles.length;
          if (baselineFiles.length > 0) {
            const latestFile = baselineFiles.sort().pop();
            const stats = fs.statSync(path.join(baselineDir, latestFile));
            deviceResult.baseline.latest = {
              filename: latestFile,
              timestamp: stats.mtime,
              path: `/screenshots/${siteId}/baseline/${device}/${latestFile}`
            };
          }
        }

        if (deviceResult.hasAfter) {
          const afterFiles = fs.readdirSync(afterDir).filter(f => f.endsWith('.png'));
          deviceResult.after.count = afterFiles.length;
          if (afterFiles.length > 0) {
            const latestFile = afterFiles.sort().pop();
            const stats = fs.statSync(path.join(afterDir, latestFile));
            deviceResult.after.latest = {
              filename: latestFile,
              timestamp: stats.mtime,
              path: `/screenshots/${siteId}/after/${device}/${latestFile}`
            };
          }
        }

        siteResult.devices.push(deviceResult);
      });

      results.push(siteResult);
    });

    res.json({ success: true, results });

  } catch (error) {
    console.error('❌ 結果一覧取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🎯 スクリーンショット一覧取得
 */
app.get('/screenshots/:siteId', (req, res) => {
  try {
    const { siteId } = req.params;
    const siteDir = path.join(SCREENSHOTS_DIR, siteId);

    if (!fs.existsSync(siteDir)) {
      return res.json({ screenshots: [] });
    }

    const screenshots = [];
    const types = ['baseline', 'after'];
    const devices = ['desktop', 'mobile'];

    types.forEach(type => {
      devices.forEach(device => {
        const deviceDir = path.join(siteDir, type, device);
        if (fs.existsSync(deviceDir)) {
          const files = fs.readdirSync(deviceDir)
            .filter(file => file.endsWith('.png'))
            .map(file => ({
              filename: file,
              path: `/screenshots/${siteId}/${type}/${device}/${file}`,
              type,
              device,
              timestamp: fs.statSync(path.join(deviceDir, file)).mtime
            }));
          screenshots.push(...files);
        }
      });
    });

    screenshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ screenshots });

  } catch (error) {
    console.error('❌ スクリーンショット一覧取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🎯 差分画像一覧取得
 */
app.get('/diffs/:siteId', (req, res) => {
  try {
    const { siteId } = req.params;
    const siteDir = path.join(DIFFS_DIR, siteId);

    if (!fs.existsSync(siteDir)) {
      return res.json({ diffs: [] });
    }

    const diffs = [];
    const devices = ['desktop', 'mobile'];

    devices.forEach(device => {
      const deviceDir = path.join(siteDir, device);
      if (fs.existsSync(deviceDir)) {
        const files = fs.readdirSync(deviceDir)
          .filter(file => file.endsWith('.png'))
          .map(file => {
            const filePath = path.join(deviceDir, file);
            const stats = fs.statSync(filePath);
            return {
              filename: file,
              path: `/diffs/${siteId}/${device}/${file}`,
              device,
              timestamp: stats.mtime,
              size: stats.size
            };
          });
        diffs.push(...files);
      }
    });

    diffs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ diffs });

  } catch (error) {
    console.error('❌ 差分画像一覧取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🎯 ルートページ
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * 🌐 サイト一覧取得
 */
app.get('/sites', (req, res) => {
  try {
    const sites = sitesManager.getAllSites();
    res.json({
      success: true,
      sites: sites,
      total: sites.length,
      enabled: sites.filter(s => s.enabled).length
    });
  } catch (error) {
    console.error('❌ サイト一覧取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🌐 サイト追加
 */
app.post('/sites', (req, res) => {
  try {
    const { siteId, name, baseUrl, maxPages } = req.body;

    if (!siteId || !baseUrl) {
      return res.status(400).json({
        success: false,
        error: 'siteId and baseUrl are required'
      });
    }

    const site = sitesManager.addSite(siteId, { name, baseUrl, maxPages });
    res.json({ success: true, site });

  } catch (error) {
    console.error('❌ サイト追加エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🌐 サイト更新
 */
app.put('/sites/:siteId', (req, res) => {
  try {
    const { siteId } = req.params;
    const site = sitesManager.updateSite(siteId, req.body);
    res.json({ success: true, site });

  } catch (error) {
    console.error('❌ サイト更新エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 📊 実行結果一覧取得
 */
app.get('/results', (req, res) => {
  try {
    const results = [];

    // screenshots ディレクトリが存在しない場合は空の結果を返す
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      return res.json({
        success: true,
        results: [],
        message: 'まだ実行結果がありません'
      });
    }

    // サイトごとの結果を構築
    const siteDirs = fs.readdirSync(SCREENSHOTS_DIR).filter(dir => {
      const dirPath = path.join(SCREENSHOTS_DIR, dir);
      return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    });

    siteDirs.forEach(siteId => {
      const siteInfo = sitesManager.getSite(siteId) || { name: siteId, baseUrl: 'Unknown' };
      const siteResults = {
        siteId,
        siteName: siteInfo.name,
        baseUrl: siteInfo.baseUrl,
        devices: []
      };

      // baseline と after ディレクトリをチェック
      ['baseline', 'after'].forEach(type => {
        const typeDir = path.join(SCREENSHOTS_DIR, siteId, type);
        if (fs.existsSync(typeDir)) {
          // デバイスごとのディレクトリをチェック
          const deviceDirs = fs.readdirSync(typeDir).filter(dir =>
            fs.statSync(path.join(typeDir, dir)).isDirectory()
          );

          deviceDirs.forEach(device => {
            const deviceDir = path.join(typeDir, device);
            const files = fs.readdirSync(deviceDir)
              .filter(file => file.endsWith('.png'))
              .map(file => {
                const filePath = path.join(deviceDir, file);
                const stats = fs.statSync(filePath);

                // ファイル名からセッションタイムスタンプを抽出
                const timestampMatch = file.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
                const sessionTimestamp = timestampMatch ? timestampMatch[1] : null;

                return {
                  filename: file,
                  timestamp: stats.mtime,
                  sessionTimestamp: sessionTimestamp,
                  path: `/screenshots/${siteId}/${type}/${device}/${file}`
                };
              })
              .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // デバイス結果を追加または更新
            let deviceResult = siteResults.devices.find(d => d.device === device);
            if (!deviceResult) {
              deviceResult = {
                device,
                baseline: { count: 0, latest: null },
                after: { count: 0, latest: null },
                hasBaseline: false,
                hasAfter: false
              };
              siteResults.devices.push(deviceResult);
            }

            // セッションごとにグループ化
            const sessions = {};
            files.forEach(file => {
              const sessionKey = file.sessionTimestamp || 'unknown';
              if (!sessions[sessionKey]) {
                sessions[sessionKey] = [];
              }
              sessions[sessionKey].push(file);
            });

            deviceResult[type] = {
              count: files.length,
              latest: files[0] || null,
              sessions: Object.keys(sessions).map(sessionKey => ({
                sessionTimestamp: sessionKey,
                fileCount: sessions[sessionKey].length,
                files: sessions[sessionKey]
              })).sort((a, b) => {
                if (a.sessionTimestamp === 'unknown') return 1;
                if (b.sessionTimestamp === 'unknown') return -1;
                return b.sessionTimestamp.localeCompare(a.sessionTimestamp);
              })
            };
            deviceResult[`has${type.charAt(0).toUpperCase() + type.slice(1)}`] = files.length > 0;
          });
        }
      });

      if (siteResults.devices.length > 0) {
        results.push(siteResults);
      }
    });

    // サイトIDでソート（site-1, site-2, site-3...の順）
    results.sort((a, b) => {
      const extractSiteNumber = (siteId) => {
        const match = siteId.match(/site-(\d+)/);
        return match ? parseInt(match[1], 10) : 9999;
      };
      return extractSiteNumber(a.siteId) - extractSiteNumber(b.siteId);
    });

    res.json({
      success: true,
      results: results
    });

  } catch (error) {
    console.error('❌ 実行結果取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 📸 セッション画像一覧取得
 */
app.get('/session-images/:siteId/:device', async (req, res) => {
  try {
    const { siteId, device } = req.params;

    // Baselineの最新セッションを取得
    const baselineDir = path.join(SCREENSHOTS_DIR, siteId, 'baseline', device);
    const afterDir = path.join(SCREENSHOTS_DIR, siteId, 'after', device);

    if (!fs.existsSync(baselineDir)) {
      return res.status(404).json({
        success: false,
        error: 'Baselineスクリーンショットが見つかりません'
      });
    }

    // ファイル一覧を取得してセッションでグループ化
    const baselineFiles = fs.readdirSync(baselineDir)
      .filter(file => file.endsWith('.png'))
      .map(file => {
        const timestampMatch = file.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
        const sessionTimestamp = timestampMatch ? timestampMatch[1] : null;
        const pageIdentifierMatch = file.match(/page-\d+_([^_]+)_/);
        const pageIdentifier = pageIdentifierMatch ? pageIdentifierMatch[1] : null;

        // ページ識別子からURLを復元
        let pageUrl = null;
        if (pageIdentifier) {
          // 保存された設定からサイト情報を取得
          try {
            const configPath = path.join(__dirname, 'data', 'sites.json');
            if (fs.existsSync(configPath)) {
              const sites = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              const site = sites.find(s => s.id === siteId);
              if (site && site.baseUrl) {
                if (pageIdentifier === 'top') {
                  pageUrl = site.baseUrl;
                } else {
                  // 識別子をパスに変換
                  const path = pageIdentifier.replace(/-/g, '/');
                  pageUrl = `${site.baseUrl.replace(/\/$/, '')}/${path}`;
                }
              }
            }
          } catch (error) {
            console.warn(`サイト設定の読み込みエラー: ${error.message}`);
          }
        }

        return {
          filename: file,
          sessionTimestamp,
          pageIdentifier,
          pageUrl,
          path: `/screenshots/${siteId}/baseline/${device}/${file}`,
          fullPath: path.join(baselineDir, file)
        };
      });

    // セッションごとにグループ化
    const sessions = {};
    baselineFiles.forEach(file => {
      const key = file.sessionTimestamp || 'unknown';
      if (!sessions[key]) sessions[key] = [];
      sessions[key].push(file);
    });

    // 最新セッションを取得
    const latestSession = Object.keys(sessions)
      .filter(key => key !== 'unknown')
      .sort()
      .pop();

    if (!latestSession) {
      return res.status(404).json({
        success: false,
        error: '有効なセッションが見つかりません'
      });
    }

    const baselineSessionFiles = sessions[latestSession].sort((a, b) =>
      a.filename.localeCompare(b.filename)
    );

    // Afterファイルを探す（同じセッション優先、なければ最新のセッション）
    let afterFiles = [];
    if (fs.existsSync(afterDir)) {
      // 1. 同じセッションのファイルを探す
      afterFiles = fs.readdirSync(afterDir)
        .filter(file => file.endsWith('.png') && file.includes(latestSession))
        .map(file => {
          const pageIdentifierMatch = file.match(/page-\d+_([^_]+)_/);
          const pageIdentifier = pageIdentifierMatch ? pageIdentifierMatch[1] : null;

          // ページ識別子からURLを復元
          let pageUrl = null;
          if (pageIdentifier) {
            try {
              const configPath = path.join(__dirname, 'data', 'sites.json');
              if (fs.existsSync(configPath)) {
                const sites = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                const site = sites.find(s => s.id === siteId);
                if (site && site.baseUrl) {
                  if (pageIdentifier === 'top') {
                    pageUrl = site.baseUrl;
                  } else {
                    const path = pageIdentifier.replace(/-/g, '/');
                    pageUrl = `${site.baseUrl.replace(/\/$/, '')}/${path}`;
                  }
                }
              }
            } catch (error) {
              console.warn(`サイト設定の読み込みエラー: ${error.message}`);
            }
          }

          return {
            filename: file,
            sessionTimestamp: latestSession,
            pageIdentifier,
            pageUrl,
            path: `/screenshots/${siteId}/after/${device}/${file}`,
            fullPath: path.join(afterDir, file)
          };
        })
        .sort((a, b) => a.filename.localeCompare(b.filename));

      // 2. 同じセッションが見つからない場合、最新のAfterファイルセッションを使用
      if (afterFiles.length === 0) {
        console.log(`⚠️ 同じセッション(${latestSession})のAfterファイルが見つかりません。最新のAfterファイルを使用します。`);

        const allAfterFiles = fs.readdirSync(afterDir)
          .filter(file => file.endsWith('.png'))
          .map(file => {
            const timestampMatch = file.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
            const sessionTimestamp = timestampMatch ? timestampMatch[1] : null;
            const pageIdentifierMatch = file.match(/page-\d+_([^_]+)_/);
            const pageIdentifier = pageIdentifierMatch ? pageIdentifierMatch[1] : null;

            // ページ識別子からURLを復元
            let pageUrl = null;
            if (pageIdentifier) {
              try {
                const configPath = path.join(__dirname, 'data', 'sites.json');
                if (fs.existsSync(configPath)) {
                  const sites = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                  const site = sites.find(s => s.id === siteId);
                  if (site && site.baseUrl) {
                    if (pageIdentifier === 'top') {
                      pageUrl = site.baseUrl;
                    } else {
                      const path = pageIdentifier.replace(/-/g, '/');
                      pageUrl = `${site.baseUrl.replace(/\/$/, '')}/${path}`;
                    }
                  }
                }
              } catch (error) {
                console.warn(`サイト設定の読み込みエラー: ${error.message}`);
              }
            }

            return {
              filename: file,
              sessionTimestamp,
              pageIdentifier,
              pageUrl,
              path: `/screenshots/${siteId}/after/${device}/${file}`,
              fullPath: path.join(afterDir, file)
            };
          });

        // 最新セッションを取得
        const afterSessions = {};
        allAfterFiles.forEach(file => {
          const key = file.sessionTimestamp || 'unknown';
          if (!afterSessions[key]) afterSessions[key] = [];
          afterSessions[key].push(file);
        });

        const latestAfterSession = Object.keys(afterSessions)
          .filter(key => key !== 'unknown')
          .sort()
          .pop();

        if (latestAfterSession) {
          console.log(`📸 最新のAfterセッション ${latestAfterSession} を使用します`);
          afterFiles = afterSessions[latestAfterSession].sort((a, b) => a.filename.localeCompare(b.filename));
        }
      }
    }

    // 各ページの比較結果を生成（既存の差分ファイルがあれば利用、なければ新規作成）
    const comparisons = [];
    for (const baselineFile of baselineSessionFiles) {
      const afterFile = afterFiles.find(f =>
        f.pageIdentifier === baselineFile.pageIdentifier
      );

      if (afterFile) {
        try {
          // 既存の差分ファイルをチェック
          const existingDiff = await findExistingDiffFile(siteId, device, baselineFile.pageIdentifier);

          if (existingDiff) {
            // 既存の差分ファイルを利用
            comparisons.push({
              pageIdentifier: baselineFile.pageIdentifier,
              diffPath: existingDiff.relativePath,
              status: existingDiff.status,
              diffPercentage: existingDiff.diffPercentage || 0,
              isExistingResult: true,
              url: baselineFile.pageUrl // URL情報を追加
            });
            console.log(`♻️ 既存差分ファイルを利用: ${baselineFile.pageIdentifier}`);
          } else {
            // 新規比較実行
            const comparison = await compareSpecificFiles(
              baselineFile.fullPath,
              afterFile.fullPath,
              siteId,
              device,
              2.0
            );
            // pageIdentifierを確実に設定
            comparison.pageIdentifier = comparison.pageIdentifier || baselineFile.pageIdentifier;
            // URL情報を追加
            comparison.url = baselineFile.pageUrl;
            comparisons.push(comparison);
            console.log(`🆕 新規比較実行: ${baselineFile.pageIdentifier}`);
          }
        } catch (error) {
          console.error(`❌ ${baselineFile.pageIdentifier}の比較エラー:`, error);
          comparisons.push(null);
        }
      } else {
        comparisons.push(null);
      }
    }

    res.json({
      success: true,
      images: {
        baseline: {
          sessionTimestamp: latestSession,
          files: baselineSessionFiles
        },
        after: {
          sessionTimestamp: afterFiles.length > 0 ? afterFiles[0].sessionTimestamp : latestSession,
          files: afterFiles
        },
        comparisons
      }
    });

  } catch (error) {
    console.error('❌ セッション画像取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 特定ファイル間の比較
 */
async function compareSpecificFiles(baselinePath, afterPath, siteId, device, threshold) {
  const baselineBuffer = fs.readFileSync(baselinePath);
  const afterBuffer = fs.readFileSync(afterPath);

  const baselinePng = PNG.sync.read(baselineBuffer);
  const afterPng = PNG.sync.read(afterBuffer);

  // サイズ調整
  const maxWidth = Math.max(baselinePng.width, afterPng.width);
  const maxHeight = Math.max(baselinePng.height, afterPng.height);

  let resizedBaseline = baselinePng;
  let resizedAfter = afterPng;

  if (baselinePng.width !== maxWidth || baselinePng.height !== maxHeight) {
    const resizedBuffer = await sharp(baselineBuffer)
      .resize(maxWidth, maxHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    resizedBaseline = PNG.sync.read(resizedBuffer);
  }

  if (afterPng.width !== maxWidth || afterPng.height !== maxHeight) {
    const resizedBuffer = await sharp(afterBuffer)
      .resize(maxWidth, maxHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    resizedAfter = PNG.sync.read(resizedBuffer);
  }

  // 差分計算
  const diffPng = new PNG({ width: maxWidth, height: maxHeight });

  const diffPixels = pixelmatch(
    resizedBaseline.data,
    resizedAfter.data,
    diffPng.data,
    maxWidth,
    maxHeight,
    {
      threshold: CONFIG.PIXELMATCH_THRESHOLD,  // 正しい色差許容度を使用 (0.02)
      alpha: 0.1,
      antialiasing: false,                     // より正確な差分検出のため無効化
      diffColor: [255, 0, 0],
      diffColorAlt: [255, 255, 0]
    }
  );

  const totalPixels = maxWidth * maxHeight;
  const diffPercentage = (diffPixels / totalPixels) * 100;
  
  // 高精度な差分率（小数点6桁まで保持）
  const preciseDiffPercentage = Math.round(diffPercentage * 1000000) / 1000000;
  
  // ファイル名用の丸め（小数点4桁）
  const roundedForFilename = Math.round(diffPercentage * 10000) / 10000;

  // baselineのファイル名からpageInfoを抽出
  const baselineFilename = path.basename(baselinePath);
  const pageMatch = baselineFilename.match(/page-(\d{3})_([^_]+)_/);

  // 差分画像を保存
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let diffFilename;
  if (pageMatch) {
    const pageId = pageMatch[1];
    const pageIdentifier = pageMatch[2];
    diffFilename = `page-${pageId}_${pageIdentifier}_${timestamp}_diff-${roundedForFilename}%.png`;
  } else {
    // フォールバック：旧形式
    diffFilename = `${path.basename(baselinePath, '.png')}_diff-${roundedForFilename}%_${timestamp}.png`;
  }
  const diffDir = path.join(DIFFS_DIR, siteId, device, `threshold-${threshold}`);

  fs.ensureDirSync(diffDir);
  const diffPath = path.join(diffDir, diffFilename);

  const diffBuffer = PNG.sync.write(diffPng);
  fs.writeFileSync(diffPath, diffBuffer);

  return {
    status: preciseDiffPercentage > threshold ? 'NG' : 'OK',
    diffPercentage: preciseDiffPercentage,  // 高精度値を返す
    diffPixels,
    diffPath: `/diffs/${siteId}/${device}/threshold-${threshold}/${diffFilename}`,
    threshold,
    pageIdentifier: pageMatch ? pageMatch[2] : null
  };
}

/**
 * 📁 設定ファイルアップロード
 */
app.post('/upload-config', (req, res) => {
  try {
    const { sites } = req.body;

    if (!Array.isArray(sites)) {
      return res.status(400).json({
        success: false,
        error: 'sites must be an array'
      });
    }

    // サイト設定を変換して追加
    let addedCount = 0;
    sites.forEach((site, index) => {
      try {
        // URLを正規化
        let baseUrl = site.url;
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
          baseUrl = 'https://' + baseUrl;
        }

        // サイトIDを生成
        const siteId = site.siteName.replace(/[^\w\s]/g, '').replace(/\s+/g, '-').toLowerCase();

        // 既存のサイトかチェック
        if (!sitesManager.getSite(siteId)) {
          sitesManager.addSite(siteId, {
            name: site.siteName,
            baseUrl: baseUrl,
            maxPages: 30,
            enabled: true
          });
          addedCount++;
        }
      } catch (error) {
        console.log(`⚠️ サイト ${site.siteName} の追加をスキップ: ${error.message}`);
      }
    });

    res.json({
      success: true,
      count: addedCount,
      message: `${addedCount}サイトを追加しました`
    });

  } catch (error) {
    console.error('❌ 設定ファイルアップロードエラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🌐 サイト削除
 */
app.delete('/sites/:siteId', (req, res) => {
  try {
    const { siteId } = req.params;
    sitesManager.deleteSite(siteId);
    res.json({ success: true, message: `サイト ${siteId} を削除しました` });

  } catch (error) {
    console.error('❌ サイト削除エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🎯 静的ファイル配信
 */
app.use('/screenshots', express.static(SCREENSHOTS_DIR));
app.use('/diffs', express.static(DIFFS_DIR));

/**
 * ブラウザインスタンスを取得（再利用）
 */
async function getBrowser() {
  if (!globalBrowser || !globalBrowser.isConnected()) {
    console.log('🚀 新しいブラウザインスタンスを起動');
    globalBrowser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security'
      ]
    });
  }
  return globalBrowser;
}

/**
 * 高精度スクリーンショット撮影実装
 */
async function takeHighPrecisionScreenshot(url, siteId, type, device, pageInfo = null, sessionTimestamp = null) {
  const browser = await getBrowser();
  let context = null;
  let attempt = 1;
  
  return await errorHandler.executeWithRetry(async () => {
    try {
      // サイトごとのコンテキスト（キャッシュ・Cookie共有）
      const contextOptions = {
        viewport: device === 'mobile' ? CONFIG.MOBILE_VIEWPORT : CONFIG.VIEWPORT,
        deviceScaleFactor: 1,
        hasTouch: device === 'mobile',
        isMobile: device === 'mobile',
        ignoreHTTPSErrors: true,
        reducedMotion: 'reduce',
        forcedColors: 'none',
        colorScheme: 'light',
        // キャッシュとCookieを保持
        storageState: undefined // 同じサイトでは状態を保持
      };

      context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      // WordPress最適化設定
      await setupWordPressOptimization(page);

      // ページ読み込み（エラーハンドリング強化）
      try {
        await page.goto(url, {
          waitUntil: 'load',
          timeout: CONFIG.TIMEOUT
        });
      } catch (error) {
        const action = await errorHandler.handleScreenshotError(error, url, siteId, attempt);
        if (action === 'retry_with_fallback') {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.TIMEOUT
          });
        } else if (action === 'skip') {
          throw new VRTError(`ページアクセス不可: ${url}`, 'NAVIGATION_ERROR');
        } else if (action === 'fail') {
          throw error;
        } else if (action === 'retry') {
          throw error; // リトライ実行
        }
        attempt++;
      }

      // WordPress特化の待機処理
      await waitForWordPressReady(page);

      // スクリーンショット撮影
      const screenshot = await page.screenshot({
        fullPage: true,
        animations: 'disabled',
        type: 'png'
      });

      // ローカルファイルに保存
      // セッションタイムスタンプが指定されていれば使用、そうでなければ新規作成
      const timestamp = sessionTimestamp || new Date().toISOString().replace(/[:.]/g, '-');
      let filename;

      if (pageInfo) {
        // ページ識別子付きファイル名
        filename = `page-${pageInfo.pageId}_${pageInfo.identifier}_${timestamp}.png`;
      } else {
        // 従来のファイル名
        filename = `${timestamp}.png`;
      }

      const dir = path.join(SCREENSHOTS_DIR, siteId, type, device);

      fs.ensureDirSync(dir);
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, screenshot);

      console.log(`✅ スクリーンショット保存: ${filepath}`);

      return {
        filename,
        filepath,
        url,
        siteId,
        type,
        device,
        size: screenshot.length,
        timestamp: new Date().toISOString()
      };

    } finally {
      // コンテキストのみクローズ（ブラウザは再利用）
      if (context) {
        try {
          await context.close();
        } catch (error) {
          console.log('⚠️ コンテキストクローズエラー:', error.message);
        }
      }
    }
  }, `スクリーンショット撮影: ${url}`, 3);
}

/**
 * WordPress最適化設定
 */
async function setupWordPressOptimization(page) {
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      .wp-block-cover__video-background { display: none !important; }
    `;
    document.head.appendChild(style);

    document.documentElement.style.setProperty('--animation-duration', '0s');
    document.documentElement.style.setProperty('--transition-duration', '0s');
  });

  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
}

/**
 * WordPress読み込み完了待機（フェードイン・ローディング対応）
 */
async function waitForWordPressReady(page) {
  await page.waitForLoadState('networkidle');

  // 追加の待機時間（画像読み込み対応）
  await page.waitForTimeout(3000);

  // スクロールして遅延読み込み画像を表示
  await autoScroll(page);

  // 初期ローディング完了待機
  try {
    await page.waitForFunction(() => {
      // jQuery チェック（存在しない場合はスキップ）
      if (window.jQuery && window.jQuery.active > 0) return false;

      // フォント読み込みチェック（サポートされていない場合はスキップ）
      if (document.fonts && !document.fonts.ready) return false;

      // 画像読み込みチェック（重要な画像のみ）
      const images = Array.from(document.images);
      let pendingImages = 0;
      for (const img of images) {
        if (!img.complete && img.src && !img.src.includes('data:')) {
          pendingImages++;
        }
      }

      // 基本的な読み込み完了チェック
      return document.readyState === 'complete' && pendingImages < 3;
    }, {}, { timeout: 5000 });
  } catch (error) {
    console.log('⚠️ WordPress読み込み完了待機でタイムアウト - 処理を続行します');
  }

  // ローダー・スピナーの消失を待機
  try {
    await page.waitForFunction(() => {
      const loaders = document.querySelectorAll([
        '.loader', '.loading', '.spinner', '.preloader',
        '[class*="load"]', '[class*="spin"]', '[id*="load"]',
        '.elementor-loading', '.wp-block-loading'
      ].join(','));

      return Array.from(loaders).every(loader =>
        loader.style.display === 'none' ||
        loader.style.visibility === 'hidden' ||
        loader.style.opacity === '0' ||
        !document.body.contains(loader)
      );
    }, {}, { timeout: 3000 });
  } catch (error) {
    console.log('⚠️ ローダー要素の確認でタイムアウト - 処理を続行します');
  }

  // フェードイン効果の完了を待機
  await page.waitForTimeout(1000);

  // ページを最後までスクロール（遅延読み込み対応）
  await autoScrollToBottom(page);

  // スクロール後の追加読み込み待機
  await page.waitForTimeout(1000);
}

/**
 * 自動スクロール（遅延読み込み対応）
 */
async function autoScrollToBottom(page) {
  console.log('⚡ 高速スクロール + 確実な最終読み込み開始...');
  
  // 1. 基本読み込み完了
  await page.waitForLoadState('domcontentloaded');
  
  // 2. 高速スクロール（待機時間最小）
  let previousHeight = 0;
  let stableCount = 0;
  const maxAttempts = 15;
  
  for (let i = 0; i < maxAttempts; i++) {
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    
    // 高さ安定チェック
    if (currentHeight === previousHeight) {
      stableCount++;
      if (stableCount >= 2) {  // 2回で十分
        console.log('📏 ページ高さ安定');
        break;
      }
    } else {
      stableCount = 0;
    }
    
    // 大きなステップで高速スクロール
    const scrollStep = Math.min(1500, currentHeight / 8);  // 大きめ
    await page.evaluate((step) => {
      window.scrollBy(0, step);
    }, scrollStep);
    
    // 最小待機（高速化）
    await page.waitForTimeout(50);  // 0.05秒のみ
    
    previousHeight = currentHeight;
    
    console.log(`📏 高速スクロール ${i + 1}: ${previousHeight}px`);
  }
  
  // 3. 最下部まで移動
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  
  console.log('📍 最下部到達 - 最終読み込み待機開始');
  
  // 4. 最終的な長時間待機（確実性重視）
  await Promise.all([
    // 遅延読み込み要素の完了を待つ（長めのタイムアウト）
    page.waitForFunction(() => {
      const lazyImages = document.querySelectorAll('img[loading="lazy"], img[data-src], .lazy');
      const unloadedImages = Array.from(lazyImages).filter(img => 
        !img.complete || img.naturalWidth === 0
      );
      return unloadedImages.length === 0;
    }, {}, { timeout: 8000 }).catch(() => console.log('⚠️ 一部画像の読み込み未完了')),
    
    // フッター要素の表示確認（長めの待機）
    page.waitForSelector('footer, .footer, #footer', { 
      state: 'visible', 
      timeout: 8000 
    }).catch(() => console.log('フッター検出タイムアウト')),
    
    // 固定の短時間待機（最適化）
    page.waitForTimeout(1000)  // 1秒の確実な待機
  ]);
  
  // 5. 追加の安定化待機
  await page.waitForTimeout(500);  // 最小限の安定化待機
  
  // 最終的にトップに戻る
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  });

  await page.waitForTimeout(200);
  console.log('✅ 最適化スクロール完了');
}

/**
 * 高精度画像比較
 */
async function compareHighPrecisionScreenshots(siteId, device, threshold = 2.0) {
  return await errorHandler.executeWithRetry(async () => {
    const baselineDir = path.join(SCREENSHOTS_DIR, siteId, 'baseline', device);
    const afterDir = path.join(SCREENSHOTS_DIR, siteId, 'after', device);

    if (!fs.existsSync(baselineDir) || !fs.existsSync(afterDir)) {
      throw new VRTError('Baseline または After スクリーンショットが見つかりません', 'MISSING_BASELINE');
    }

    // ページペアでファイルを取得
    const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));
    const afterFiles = fs.readdirSync(afterDir).filter(f => f.endsWith('.png'));

    if (baselineFiles.length === 0 || afterFiles.length === 0) {
      throw new VRTError('比較対象のスクリーンショットファイルが見つかりません', 'MISSING_BASELINE');
    }

  // 同じページIDのファイルペアを見つける
  let baselineFile = null;
  let afterFile = null;

  for (const bFile of baselineFiles) {
    const pageMatch = bFile.match(/page-(\d{3})_([^_]+)_/);
    if (!pageMatch) continue;

    const pageId = pageMatch[1];
    const pageIdentifier = pageMatch[2];

    // 対応するafterファイルを検索
    const matchingAfterFile = afterFiles.find(f =>
      f.includes(`page-${pageId}_${pageIdentifier}_`)
    );

    if (matchingAfterFile) {
      baselineFile = bFile;
      afterFile = matchingAfterFile;
      console.log(`🔍 比較対象: ${pageId}_${pageIdentifier}`);
      break; // 最初に見つかったペアを使用
    }
  }

    if (!baselineFile || !afterFile) {
      throw new VRTError('対応するページペアが見つかりません', 'MISSING_BASELINE');
    }

    const baselinePath = path.join(baselineDir, baselineFile);
    const afterPath = path.join(afterDir, afterFile);

    // 画像読み込み（エラーハンドリング強化）
    let baselineBuffer, afterBuffer;
    try {
      baselineBuffer = fs.readFileSync(baselinePath);
      afterBuffer = fs.readFileSync(afterPath);
    } catch (error) {
      const errorResult = await errorHandler.handleComparisonError(error, siteId, device);
      if (errorResult.status === 'ERROR') {
        throw new VRTError(errorResult.message, 'CORRUPTED_IMAGE');
      }
      throw error;
    }

    let baselinePng, afterPng;
    try {
      baselinePng = PNG.sync.read(baselineBuffer);
      afterPng = PNG.sync.read(afterBuffer);
    } catch (error) {
      throw new VRTError(`画像形式が不正です: ${error.message}`, 'CORRUPTED_IMAGE');
    }

  // サイズ調整
  const maxWidth = Math.max(baselinePng.width, afterPng.width);
  const maxHeight = Math.max(baselinePng.height, afterPng.height);

  let resizedBaseline = baselinePng;
  let resizedAfter = afterPng;

  if (baselinePng.width !== maxWidth || baselinePng.height !== maxHeight) {
    const resizedBuffer = await sharp(baselineBuffer)
      .resize(maxWidth, maxHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    resizedBaseline = PNG.sync.read(resizedBuffer);
  }

  if (afterPng.width !== maxWidth || afterPng.height !== maxHeight) {
    const resizedBuffer = await sharp(afterBuffer)
      .resize(maxWidth, maxHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    resizedAfter = PNG.sync.read(resizedBuffer);
  }

  // 差分画像作成
  const diffPng = new PNG({ width: maxWidth, height: maxHeight });

  const diffPixels = pixelmatch(
    resizedBaseline.data,
    resizedAfter.data,
    diffPng.data,
    maxWidth,
    maxHeight,
    {
      threshold: CONFIG.PIXELMATCH_THRESHOLD,  // 正しい色差許容度を使用 (0.02)
      alpha: 0.1,
      antialiasing: false,                     // より正確な差分検出のため無効化
      diffColor: [255, 0, 0],
      diffColorAlt: [255, 255, 0]
    }
  );

  // 差分率計算（高精度）
  const totalPixels = maxWidth * maxHeight;
  const diffPercentage = (diffPixels / totalPixels) * 100;
  
  // 高精度な差分率（小数点6桁まで保持）
  const preciseDiffPercentage = Math.round(diffPercentage * 1000000) / 1000000;

  // 差分画像保存（闾値別ディレクトリ）
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const diffFilename = `${timestamp}_diff.png`;
  const diffDir = path.join(DIFFS_DIR, siteId, device, `threshold-${threshold}`);

  fs.ensureDirSync(diffDir);
  const diffPath = path.join(diffDir, diffFilename);

  const diffBuffer = PNG.sync.write(diffPng);
  fs.writeFileSync(diffPath, diffBuffer);

  // 結果判定（高精度値で判定）
  const status = preciseDiffPercentage > threshold ? 'NG' : 'OK';

  console.log(`${status === 'NG' ? '⚠️' : '✅'} 比較結果: ${preciseDiffPercentage.toFixed(6)}% (${diffPixels}px) [闾値: ${threshold}%]`);

    const result = {
      siteId,
      device,
      baselineFile,
      afterFile,
      diffFile: diffFilename,
      diffPath: `/diffs/${siteId}/${device}/threshold-${threshold}/${diffFilename}`,
      diffPixels,
      diffPercentage: preciseDiffPercentage,  // 高精度値を返す
      status,
      threshold,
      timestamp: new Date().toISOString(),
      dimensions: { width: maxWidth, height: maxHeight }
    };

    // データベースに結果を保存
    try {
      await database.saveComparisonResult({
        siteId,
        device,
        status,
        diffPercentage: preciseDiffPercentage,
        diffPixels,
        threshold,
        baselineFile,
        afterFile,
        diffFile: diffFilename,
        metadata: {
          dimensions: { width: maxWidth, height: maxHeight }
        }
      });
    } catch (dbError) {
      console.log('⚠️ DB保存エラー:', dbError.message);
    }

    return result;
  }, `画像比較: ${siteId}/${device}`, 2);
}

/**
 * フルVRTチェック
 */
async function runFullVRTCheck(url, siteId, devices) {
  const results = [];

  for (const device of devices) {
    console.log(`📱 ${device} での処理開始`);

    // Baseline撮影
    const baselineResult = await takeHighPrecisionScreenshot(url, siteId, 'baseline', device);

    // After撮影（即座に撮影 - 実際の運用では手動更新後）
    const afterResult = await takeHighPrecisionScreenshot(url, siteId, 'after', device);

    // 比較実行
    const compareResult = await compareHighPrecisionScreenshots(siteId, device);

    results.push({
      device,
      baseline: baselineResult,
      after: afterResult,
      comparison: compareResult
    });
  }

  return {
    siteId,
    url,
    devices,
    results,
    summary: {
      total: results.length,
      ng: results.filter(r => r.comparison.status === 'NG').length,
      ok: results.filter(r => r.comparison.status === 'OK').length
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * 自動スクロール機能（遅延読み込み画像対応）
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if(totalHeight >= scrollHeight){
          clearInterval(timer);
          // 最上部に戻る
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });

  // スクロール後の追加待機
  await page.waitForTimeout(2000);
}

/**
 * サーバー起動
 */
/**
 * 📊 全サイトの最新結果一覧を取得（ダッシュボード用）
 */
app.get('/dashboard-results', (req, res) => {
  try {
    const allSitesList = sitesManager.getAllSites();
    const dashboardData = [];
    
    for (const site of allSitesList) {
      const siteData = {
        siteId: site.id,
        siteName: site.name,
        baseUrl: site.baseUrl,
        baseline: null,
        after: null,
        compare: null,
        status: 'not_executed'
      };
      
      // JSONファイルから結果を取得（もしあれば）
      const baselinePath = path.join(RESULTS_DIR, `${site.id}_baseline_latest.json`);
      const afterPath = path.join(RESULTS_DIR, `${site.id}_after_latest.json`);
      const comparePath = path.join(RESULTS_DIR, `${site.id}_compare_latest.json`);
      
      // JSONファイルが存在しない場合は画像ファイルから推定
      if (!fs.existsSync(baselinePath)) {
        const baselineDir = path.join(SCREENSHOTS_DIR, site.id, 'baseline', 'desktop');
        if (fs.existsSync(baselineDir)) {
          const imageFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));
          if (imageFiles.length > 0) {
            // 最新セッションの画像を取得
            const sortedFiles = imageFiles.sort((a, b) => b.localeCompare(a));
            const latestTimestamp = sortedFiles[0].match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/)?.[1];
            const latestFiles = latestTimestamp ? 
              sortedFiles.filter(f => f.includes(latestTimestamp)) : [];
            
            if (latestFiles.length > 0) {
              // タイムスタンプを正しいISO形式に変換
              let isoTimestamp = new Date().toISOString();
              if (latestTimestamp) {
                try {
                  // 2025-09-02T05-02-15-078Z を 2025-09-02T05:02:15.078Z に変換
                  const parts = latestTimestamp.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
                  if (parts) {
                    isoTimestamp = `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}.${parts[7]}Z`;
                  }
                } catch (e) {
                  console.warn('タイムスタンプ変換エラー:', latestTimestamp, e);
                }
              }
              
              siteData.baseline = {
                timestamp: isoTimestamp,
                pageCount: latestFiles.length,
                pages: latestFiles.map(f => f.replace('.png', ''))
              };
            }
          }
        }
      } else {
        const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
        siteData.baseline = {
          timestamp: baselineData.timestamp,
          pageCount: baselineData.captureCount,
          pages: baselineData.pages
        };
      }
      
      // After結果の処理
      if (!fs.existsSync(afterPath)) {
        const afterDir = path.join(SCREENSHOTS_DIR, site.id, 'after', 'desktop');
        if (fs.existsSync(afterDir)) {
          const imageFiles = fs.readdirSync(afterDir).filter(f => f.endsWith('.png'));
          if (imageFiles.length > 0) {
            // 最新セッションの画像を取得
            const sortedFiles = imageFiles.sort((a, b) => b.localeCompare(a));
            const latestTimestamp = sortedFiles[0].match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/)?.[1];
            const latestFiles = latestTimestamp ? 
              sortedFiles.filter(f => f.includes(latestTimestamp)) : [];
              
            if (latestFiles.length > 0) {
              // タイムスタンプを正しいISO形式に変換
              let isoTimestamp = new Date().toISOString();
              if (latestTimestamp) {
                try {
                  // 2025-09-02T05-14-41-953Z を 2025-09-02T05:14:41.953Z に変換
                  const parts = latestTimestamp.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
                  if (parts) {
                    isoTimestamp = `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}.${parts[7]}Z`;
                  }
                } catch (e) {
                  console.warn('タイムスタンプ変換エラー:', latestTimestamp, e);
                }
              }
              
              siteData.after = {
                timestamp: isoTimestamp,
                pageCount: latestFiles.length
              };
            }
          }
        }
      } else {
        const afterData = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
        siteData.after = {
          timestamp: afterData.timestamp,
          pageCount: afterData.captureCount
        };
      }
      
      // Compare結果の処理（JSONファイルまたは差分画像から復元）
      if (fs.existsSync(comparePath)) {
        const compareData = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
        siteData.compare = {
          timestamp: compareData.timestamp,
          status: compareData.compareResults.status,
          okCount: compareData.compareResults.summary?.ok || 0,
          ngCount: compareData.compareResults.summary?.ng || 0,
          diffRate: compareData.compareResults.summary?.avgDiffRate || 0
        };
        
        // ステータス判定
        if (compareData.compareResults.status === 'OK') {
          siteData.status = 'ok';
        } else if (compareData.compareResults.status === 'NG') {
          siteData.status = 'ng';
        } else if (compareData.compareResults.status === 'ERROR') {
          siteData.status = 'error';
        }
      } else {
        // 差分画像から比較結果を復元
        const diffsDir = path.join(DIFFS_DIR, site.id, 'desktop', 'threshold-2');
        if (fs.existsSync(diffsDir)) {
          const diffFiles = fs.readdirSync(diffsDir).filter(f => f.endsWith('.png'));
          if (diffFiles.length > 0) {
            // 最新セッションの差分を取得
            const latestDiffFiles = diffFiles.sort((a, b) => b.localeCompare(a));
            let okCount = 0;
            let ngCount = 0;
            let totalDiffRate = 0;
            
            // 差分率を解析
            for (const diffFile of latestDiffFiles) {
              const diffMatch = diffFile.match(/diff-([0-9.]+)%\.png/);
              if (diffMatch) {
                const diffRate = parseFloat(diffMatch[1]);
                totalDiffRate += diffRate;
                if (diffRate <= 2.0) {
                  okCount++;
                } else {
                  ngCount++;
                }
              }
            }
            
            const avgDiffRate = latestDiffFiles.length > 0 ? totalDiffRate / latestDiffFiles.length : 0;
            const latestTimestamp = latestDiffFiles[0]?.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/)?.[1];
            
            if (latestTimestamp) {
              let isoTimestamp = new Date().toISOString();
              try {
                const parts = latestTimestamp.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
                if (parts) {
                  isoTimestamp = `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}.${parts[7]}Z`;
                }
              } catch (e) {
                console.warn('差分タイムスタンプ変換エラー:', latestTimestamp, e);
              }
              
              siteData.compare = {
                timestamp: isoTimestamp,
                status: avgDiffRate > 2.0 ? 'NG' : 'OK',
                okCount,
                ngCount,
                diffRate: avgDiffRate
              };
              
              // ステータス更新
              siteData.status = avgDiffRate > 2.0 ? 'ng' : 'ok';
            }
          }
        }
      }
      
      // ステータス判定（Compare結果がない場合）
      if (siteData.status === 'not_executed') {
        if (siteData.baseline && siteData.after) {
          siteData.status = 'pending_compare';
        } else if (siteData.baseline) {
          siteData.status = 'baseline_only';
        }
      }
      
      dashboardData.push(siteData);
    }
    
    // サマリー統計
    const summary = {
      totalSites: dashboardData.length,
      executedSites: dashboardData.filter(s => s.baseline !== null).length,
      okSites: dashboardData.filter(s => s.status === 'ok').length,
      ngSites: dashboardData.filter(s => s.status === 'ng').length,
      errorSites: dashboardData.filter(s => s.status === 'error').length,
      pendingSites: dashboardData.filter(s => s.status === 'not_executed').length
    };
    
    res.json({
      success: true,
      summary,
      sites: dashboardData,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ ダッシュボード結果取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 📊 エクスポート機能
 */
const { google } = require('googleapis');
const csv = require('csv-writer').createObjectCsvWriter;
const puppeteer = require('puppeteer');

// Google Sheets API設定
let sheetsService = null;

// CSV用の書き込みオブジェクト
function getCsvWriter(filename) {
  return csv({
    path: filename,
    header: [
      { id: 'siteId', title: 'Site ID' },
      { id: 'siteName', title: 'サイト名' },
      { id: 'baseUrl', title: 'URL' },
      { id: 'status', title: 'ステータス' },
      { id: 'baselinePages', title: 'Baseline ページ数' },
      { id: 'baselineDate', title: 'Baseline 実行日' },
      { id: 'afterPages', title: 'After ページ数' },
      { id: 'afterDate', title: 'After 実行日' },
      { id: 'okCount', title: 'OK ページ数' },
      { id: 'ngCount', title: 'NG ページ数' },
      { id: 'diffRate', title: '差分率 (%)' },
      { id: 'compareDate', title: '比較実行日' }
    ]
  });
}

/**
 * VRT結果をCSV形式に変換
 */
function convertToCSVData(dashboardData) {
  return dashboardData.map(site => ({
    siteId: site.siteId,
    siteName: site.siteName,
    baseUrl: site.baseUrl,
    status: site.status,
    baselinePages: site.baseline ? site.baseline.pageCount : 0,
    baselineDate: site.baseline ? new Date(site.baseline.timestamp).toLocaleString('ja-JP') : '',
    afterPages: site.after ? site.after.pageCount : 0,
    afterDate: site.after ? new Date(site.after.timestamp).toLocaleString('ja-JP') : '',
    okCount: site.compare ? site.compare.okCount : 0,
    ngCount: site.compare ? site.compare.ngCount : 0,
    diffRate: site.compare ? site.compare.diffRate.toFixed(2) : 0,
    compareDate: site.compare ? new Date(site.compare.timestamp).toLocaleString('ja-JP') : ''
  }));
}

/**
 * CSV エクスポート API
 */
app.get('/export-csv', async (req, res) => {
  try {
    // ダッシュボードデータを取得
    const allSitesList = sitesManager.getAllSites();
    const dashboardData = [];
    
    for (const site of allSitesList) {
      const siteData = {
        siteId: site.id,
        siteName: site.name,
        baseUrl: site.baseUrl,
        baseline: null,
        after: null,
        compare: null,
        status: 'not_executed'
      };
      
      // 最新の結果を読み込み
      const baselineFile = path.join(RESULTS_DIR, `${site.id}_baseline_latest.json`);
      if (fs.existsSync(baselineFile)) {
        siteData.baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
        siteData.status = 'baseline_only';
      }
      
      const afterFile = path.join(RESULTS_DIR, `${site.id}_after_latest.json`);
      if (fs.existsSync(afterFile)) {
        siteData.after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));
        siteData.status = 'pending_compare';
      }
      
      const compareFile = path.join(RESULTS_DIR, `${site.id}_compare_latest.json`);
      if (fs.existsSync(compareFile)) {
        siteData.compare = JSON.parse(fs.readFileSync(compareFile, 'utf8'));
        
        if (siteData.compare.diffRate < 0.1) {
          siteData.status = 'ok';
        } else {
          siteData.status = 'ng';
        }
      }
      
      dashboardData.push(siteData);
    }
    
    // CSV形式に変換
    const csvData = convertToCSVData(dashboardData);
    
    // CSV ファイル生成
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(__dirname, 'temp', `vrt_results_${timestamp}.csv`);
    
    // tempディレクトリ作成
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const csvWriter = getCsvWriter(filename);
    await csvWriter.writeRecords(csvData);
    
    // ファイルをダウンロード
    res.download(filename, `VRT実行結果_${new Date().toLocaleDateString('ja-JP')}.csv`, (err) => {
      if (err) {
        console.error('CSV ダウンロードエラー:', err);
        res.status(500).json({ success: false, error: 'ファイルダウンロードに失敗しました' });
      } else {
        // ダウンロード後にファイルを削除
        setTimeout(() => {
          try {
            fs.unlinkSync(filename);
          } catch (deleteError) {
            console.error('一時ファイル削除エラー:', deleteError);
          }
        }, 60000); // 60秒後に削除
      }
    });
    
  } catch (error) {
    console.error('❌ CSV エクスポートエラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Google Sheets エクスポート API
 */
app.post('/export-google-sheets', async (req, res) => {
  try {
    const { spreadsheetId, sheetName = 'VRT結果' } = req.body;
    
    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        error: 'スプレッドシートIDが必要です'
      });
    }
    
    // 認証設定（サービスアカウントキーファイルが必要）
    // const auth = new google.auth.GoogleAuth({
    //   keyFile: 'path/to/service-account-key.json',
    //   scopes: ['https://www.googleapis.com/auth/spreadsheets']
    // });
    
    // sheetsService = google.sheets({ version: 'v4', auth });
    
    // 現在はCSVエクスポートのみサポート
    return res.status(501).json({
      success: false,
      error: 'Google Sheets エクスポートは現在準備中です。CSVエクスポートをご利用ください。',
      csvUrl: '/export-csv'
    });
    
  } catch (error) {
    console.error('❌ Google Sheets エクスポートエラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 📷 画像一覧PDF レポート生成
 */
app.get('/export-image-pdf/:siteId', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { type = 'baseline' } = req.query; // baseline, after, compare
    
    const siteInfo = sitesManager.getSite(siteId);
    if (!siteInfo) {
      return res.status(404).json({ success: false, error: 'サイトが見つかりません' });
    }
    
    // 画像ファイルのパスを取得
    const imageDir = path.join(SCREENSHOTS_DIR, siteId, type, 'desktop');
    
    if (!fs.existsSync(imageDir)) {
      return res.status(404).json({ success: false, error: '画像フォルダが見つかりません' });
    }
    
    // 最新セッションの画像のみを取得
    const allImageFiles = fs.readdirSync(imageDir)
      .filter(f => f.endsWith('.png'))
      .sort((a, b) => b.localeCompare(a)); // 降順ソート（最新が先頭）
    
    // 最新のタイムスタンプを取得
    const latestTimestamp = allImageFiles.length > 0 ? 
      allImageFiles[0].match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/)?.[1] : null;
    
    const imageFiles = latestTimestamp ? 
      allImageFiles.filter(f => f.includes(latestTimestamp)).slice(0, 20) : 
      allImageFiles.slice(0, 20); // 最新セッションの最大20枚
    
    if (imageFiles.length === 0) {
      return res.status(404).json({ success: false, error: '画像ファイルが見つかりません' });
    }
    
    // HTMLテンプレート作成
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <title>${siteInfo.name} - ${type.toUpperCase()}画像一覧</title>
        <style>
            body {
                font-family: 'Noto Sans JP', Arial, sans-serif;
                margin: 20px;
                background: #f5f5f5;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                padding: 20px;
                background: white;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header h1 {
                color: #333;
                margin: 0 0 10px 0;
                font-size: 28px;
            }
            .header p {
                color: #666;
                margin: 5px 0;
                font-size: 14px;
            }
            .image-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                gap: 20px;
                margin-top: 20px;
            }
            .image-item {
                background: white;
                border-radius: 10px;
                padding: 15px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                break-inside: avoid;
                page-break-inside: avoid;
            }
            .image-item h3 {
                margin: 0 0 10px 0;
                color: #333;
                font-size: 16px;
                border-bottom: 2px solid #667eea;
                padding-bottom: 5px;
            }
            .image-item img {
                width: 100%;
                max-width: 400px;
                height: auto;
                border: 1px solid #ddd;
                border-radius: 5px;
            }
            .image-info {
                margin-top: 10px;
                font-size: 12px;
                color: #666;
            }
            @media print {
                .image-grid {
                    grid-template-columns: 1fr;
                }
                .image-item {
                    margin-bottom: 20px;
                    page-break-inside: avoid;
                }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📷 ${siteInfo.name}</h1>
            <p><strong>URL:</strong> ${siteInfo.baseUrl}</p>
            <p><strong>タイプ:</strong> ${type.toUpperCase()}</p>
            <p><strong>生成日:</strong> ${new Date().toLocaleString('ja-JP')}</p>
            <p><strong>画像数:</strong> ${imageFiles.length}枚</p>
        </div>
        
        <div class="image-grid">
            ${imageFiles.map(filename => {
              const imagePath = path.join(imageDir, filename);
              const stats = fs.statSync(imagePath);
              const base64Image = fs.readFileSync(imagePath, 'base64');
              
              // ファイル名からページ情報を抽出
              const pageMatch = filename.match(/page-(\d+)_([^_]+)/);
              const pageNum = pageMatch ? pageMatch[1] : '?';
              const pageName = pageMatch ? pageMatch[2] : filename.replace('.png', '');
              
              return `
                <div class="image-item">
                    <h3>📄 Page ${pageNum}: ${pageName}</h3>
                    <img src="data:image/png;base64,${base64Image}" alt="${filename}" />
                    <div class="image-info">
                        <div><strong>ファイル名:</strong> ${filename}</div>
                        <div><strong>サイズ:</strong> ${(stats.size / 1024).toFixed(1)} KB</div>
                        <div><strong>更新日:</strong> ${stats.mtime.toLocaleString('ja-JP')}</div>
                    </div>
                </div>
              `;
            }).join('')}
        </div>
    </body>
    </html>
    `;
    
    // PuppeteerでPDF生成
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      });
      
      await browser.close();
      
      // PDFをダウンロード
      const filename = `${siteInfo.name}_${type}_画像一覧_${new Date().toLocaleDateString('ja-JP').replace(/\//g, '-')}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(pdfBuffer);
      
    } catch (error) {
      await browser.close();
      throw error;
    }
    
  } catch (error) {
    console.error('❌ 画像 PDF エクスポートエラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 📋 全サイト画像一覧レポート生成
 */
app.get('/export-all-images-pdf', async (req, res) => {
  try {
    const { type = 'baseline', maxSites = 10 } = req.query;
    
    const allSites = sitesManager.getAllSites().slice(0, parseInt(maxSites));
    const siteImageData = [];
    
    // 各サイトの画像情報を収集
    for (const site of allSites) {
      const imageDir = path.join(SCREENSHOTS_DIR, site.id, type, 'desktop');
      
      if (fs.existsSync(imageDir)) {
        // 最新セッションの画像のみを取得
        const allImageFiles = fs.readdirSync(imageDir)
          .filter(f => f.endsWith('.png'))
          .sort((a, b) => b.localeCompare(a)); // 降順ソート（最新が先頭）
        
        // 最新のタイムスタンプを取得
        const latestTimestamp = allImageFiles.length > 0 ? 
          allImageFiles[0].match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/)?.[1] : null;
        
        const imageFiles = latestTimestamp ? 
          allImageFiles.filter(f => f.includes(latestTimestamp)).slice(0, 3) : 
          allImageFiles.slice(0, 3); // サイトあたり最新3枚まで
        
        if (imageFiles.length > 0) {
          siteImageData.push({
            site,
            imageFiles,
            imageDir
          });
        }
      }
    }
    
    if (siteImageData.length === 0) {
      return res.status(404).json({ success: false, error: '表示する画像が見つかりません' });
    }
    
    // HTMLテンプレート作成
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <title>全サイト ${type.toUpperCase()} 画像一覧</title>
        <style>
            body {
                font-family: 'Noto Sans JP', Arial, sans-serif;
                margin: 20px;
                background: #f5f5f5;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                padding: 20px;
                background: white;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .site-section {
                background: white;
                margin-bottom: 30px;
                border-radius: 10px;
                padding: 20px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                page-break-inside: avoid;
            }
            .site-header {
                border-bottom: 3px solid #667eea;
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            .site-header h2 {
                color: #333;
                margin: 0 0 5px 0;
                font-size: 24px;
            }
            .site-header p {
                color: #666;
                margin: 0;
                font-size: 14px;
            }
            .image-row {
                display: flex;
                gap: 15px;
                flex-wrap: wrap;
                justify-content: flex-start;
            }
            .image-thumb {
                flex: 0 0 180px;
                text-align: center;
            }
            .image-thumb img {
                width: 180px;
                height: auto;
                max-height: 120px;
                object-fit: cover;
                border: 1px solid #ddd;
                border-radius: 5px;
            }
            .image-thumb p {
                margin: 5px 0 0 0;
                font-size: 10px;
                color: #666;
                word-break: break-all;
            }
            @media print {
                .site-section {
                    page-break-inside: avoid;
                    margin-bottom: 40px;
                }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📋 全サイト ${type.toUpperCase()} 画像一覧レポート</h1>
            <p><strong>生成日:</strong> ${new Date().toLocaleString('ja-JP')}</p>
            <p><strong>対象サイト:</strong> ${siteImageData.length}サイト</p>
        </div>
        
        ${siteImageData.map(({ site, imageFiles, imageDir }) => `
          <div class="site-section">
              <div class="site-header">
                  <h2>🌐 ${site.name}</h2>
                  <p><strong>URL:</strong> ${site.baseUrl}</p>
                  <p><strong>画像数:</strong> ${imageFiles.length}枚</p>
              </div>
              
              <div class="image-row">
                  ${imageFiles.map(filename => {
                    const imagePath = path.join(imageDir, filename);
                    const base64Image = fs.readFileSync(imagePath, 'base64');
                    
                    const pageMatch = filename.match(/page-(\d+)_([^_]+)/);
                    const pageNum = pageMatch ? pageMatch[1] : '?';
                    const pageName = pageMatch ? pageMatch[2] : filename.replace('.png', '').substring(0, 10);
                    
                    return `
                      <div class="image-thumb">
                          <img src="data:image/png;base64,${base64Image}" alt="${filename}" />
                          <p>Page ${pageNum}: ${pageName}</p>
                      </div>
                    `;
                  }).join('')}
              </div>
          </div>
        `).join('')}
    </body>
    </html>
    `;
    
    // PuppeteerでPDF生成
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      });
      
      await browser.close();
      
      // PDFをダウンロード
      const filename = `全サイト_${type}_画像一覧_${new Date().toLocaleDateString('ja-JP').replace(/\//g, '-')}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(pdfBuffer);
      
    } catch (error) {
      await browser.close();
      throw error;
    }
    
  } catch (error) {
    console.error('❌ 全サイト画像 PDF エクスポートエラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🗑️ 手動ファイルクリーンアップ
 */
app.post('/cleanup-old-files', (req, res) => {
  try {
    cleanupOldFiles();
    res.json({
      success: true,
      message: `${CONFIG.CLEANUP_OLD_FILES_DAYS}日以上古いファイルのクリーンアップを実行しました`
    });
  } catch (error) {
    console.error('❌ 手動クリーンアップエラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 📖 ページ名からURLを生成
 */
function getPageUrlFromSite(site, pageName) {
  if (!site || !site.url) return null;
  
  const baseUrl = site.url.replace(/\/$/, ''); // 末尾のスラッシュを除去
  
  // ページ名のマッピング
  const pageNameMappings = {
    'top': '/',
    'home': '/',
    'index': '/',
    'tool': '/tool',
    'tool-privacy-policy': '/tool/privacy-policy',
    'tool-clp-url-search-regular': '/tool/clp-url-search-regular',
    'about': '/about',
    'works': '/works',
    'member': '/member',
    'category-news': '/category/news',
    'category-journal': '/category/journal',
    'recruit': '/recruit',
    'contact': '/contact'
  };
  
  // マッピングがある場合はそれを使用
  if (pageNameMappings[pageName]) {
    return baseUrl + pageNameMappings[pageName];
  }
  
  // URLエンコードされている場合のデコード処理
  const decodedPageName = decodeURIComponent(pageName);
  
  // works- で始まる場合は /works/xxx 形式
  if (pageName.startsWith('works-')) {
    const workName = pageName.replace('works-', '').replace(/-/g, '/');
    return `${baseUrl}/works/${workName}`;
  }
  
  // 一般的なケース：ハイフンをスラッシュに変換
  const urlPath = pageName.replace(/-/g, '/');
  return `${baseUrl}/${urlPath}`;
}

/**
 * 🔍 比較画像データを取得 (compare.html用)
 */
app.get('/compare-images/:siteId', async (req, res) => {
  try {
    const siteId = req.params.siteId;
    const site = sitesManager.getSite(siteId);
    
    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'サイトが見つかりません'
      });
    }

    const comparisons = [];
    const stats = { okCount: 0, ngCount: 0, avgDiffRate: 0, totalDiffRate: 0 };

    // Screenshots directories
    const baselineDir = path.join(SCREENSHOTS_DIR, siteId, 'baseline', 'desktop');
    const afterDir = path.join(SCREENSHOTS_DIR, siteId, 'after', 'desktop');
    
    // Diff images directory
    const diffsDir = path.join(DIFFS_DIR, siteId, 'desktop', 'threshold-2');
    
    if (!fs.existsSync(diffsDir)) {
      return res.json({
        success: true,
        comparisons: [],
        stats: stats
      });
    }

    // Get all diff files and find the latest timestamp from them
    const allDiffFiles = fs.readdirSync(diffsDir).filter(f => f.endsWith('.png'));
    
    const diffTimestamps = [...new Set(allDiffFiles.map(f => {
      const match = f.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
      return match ? match[1] : null;
    }).filter(Boolean))];
    
    if (diffTimestamps.length === 0) {
      return res.json({
        success: true,
        comparisons: [],
        stats: stats
      });
    }

    // Use timestamp with most diff files (complete session)
    const timestampCounts = {};
    allDiffFiles.forEach(f => {
      const match = f.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
      if (match) {
        timestampCounts[match[1]] = (timestampCounts[match[1]] || 0) + 1;
      }
    });
    
    const sortedTimestamps = Object.entries(timestampCounts)
      .sort(([timeA, countA], [timeB, countB]) => {
        // First sort by count desc, then by time desc
        if (countA !== countB) return countB - countA;
        return timeB.localeCompare(timeA);
      });
    
    const latestTimestamp = sortedTimestamps[0][0];
    
    // Get diff files for latest session
    const diffFiles = allDiffFiles
      .filter(f => f.includes(latestTimestamp))
      .sort();

    // Process each diff file
    for (const diffFile of diffFiles) {
      // Match both formats: new format with diff-X.X% and old format without percentage
      let pageMatch = diffFile.match(/page-(\d+)_([^_]+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_diff-([0-9.]+)%\.png$/);
      if (!pageMatch) {
        // Try old format
        pageMatch = diffFile.match(/page-(\d+)_([^_]+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_diff\.png$/);
        if (pageMatch) {
          pageMatch = [...pageMatch, '0']; // Add default 0% diff for old format
        }
      }
      if (!pageMatch) continue;
      
      const [, pageNum, pageName, timestamp, diffRateStr] = pageMatch;
      const diffRate = parseFloat(diffRateStr);
      
      // Find corresponding baseline and after images (any timestamp for same page)
      let baselineFile = null;
      let afterFile = null;
      
      if (fs.existsSync(baselineDir)) {
        const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));
        baselineFile = baselineFiles
          .filter(f => f.includes(`page-${pageNum}_${pageName}`))
          .sort().reverse()[0]; // Get latest baseline for this page
      }
      
      if (fs.existsSync(afterDir)) {
        const afterFiles = fs.readdirSync(afterDir).filter(f => f.endsWith('.png'));
        afterFile = afterFiles
          .filter(f => f.includes(`page-${pageNum}_${pageName}`))
          .sort().reverse()[0]; // Get latest after for this page
      }

      // ページURLを生成
      const pageUrl = getPageUrlFromSite(site, pageName);
      
      comparisons.push({
        pageName: pageName,
        pageNum: parseInt(pageNum),
        diffRate: diffRate,
        url: pageUrl,
        baseline: baselineFile ? `${siteId}/baseline/desktop/${baselineFile}` : null,
        after: afterFile ? `${siteId}/after/desktop/${afterFile}` : null,
        diff: `${siteId}/desktop/threshold-2/${diffFile}`
      });

      // Update stats
      if (diffRate <= 2.0) {
        stats.okCount++;
      } else {
        stats.ngCount++;
      }
      stats.totalDiffRate += diffRate;
    }

    // Calculate average diff rate
    if (comparisons.length > 0) {
      stats.avgDiffRate = stats.totalDiffRate / comparisons.length;
    }

    // Sort by page number
    comparisons.sort((a, b) => a.pageNum - b.pageNum);

    res.json({
      success: true,
      comparisons: comparisons,
      stats: stats
    });

  } catch (error) {
    console.error('❌ 比較画像データ取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🔍 全サイトの比較画像データを取得
 */
app.get('/compare-images-all', async (req, res) => {
  try {
    const allSites = sitesManager.getEnabledSites();
    const allResults = [];
    
    for (const site of allSites) {
      const siteId = site.id;
      const comparisons = [];
      const stats = { okCount: 0, ngCount: 0, avgDiffRate: 0, totalDiffRate: 0 };

      // Screenshots directories
      const baselineDir = path.join(SCREENSHOTS_DIR, siteId, 'baseline', 'desktop');
      const afterDir = path.join(SCREENSHOTS_DIR, siteId, 'after', 'desktop');
      
      // Diff images directory
      const diffsDir = path.join(DIFFS_DIR, siteId, 'desktop', 'threshold-2');
      
      if (!fs.existsSync(diffsDir)) {
        allResults.push({
          siteId: siteId,
          siteName: site.name,
          comparisons: [],
          stats: stats
        });
        continue;
      }

      // Get all diff files and find the latest timestamp from them
      const allDiffFiles = fs.readdirSync(diffsDir).filter(f => f.endsWith('.png'));
      
      const diffTimestamps = [...new Set(allDiffFiles.map(f => {
        const match = f.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
        return match ? match[1] : null;
      }).filter(Boolean))];
      
      if (diffTimestamps.length === 0) {
        allResults.push({
          siteId: siteId,
          siteName: site.name,
          comparisons: [],
          stats: stats
        });
        continue;
      }

      // Use timestamp with most diff files (complete session)
      const timestampCounts = {};
      allDiffFiles.forEach(f => {
        const match = f.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
        if (match) {
          timestampCounts[match[1]] = (timestampCounts[match[1]] || 0) + 1;
        }
      });
      
      const sortedTimestamps = Object.entries(timestampCounts)
        .sort(([timeA, countA], [timeB, countB]) => {
          // First sort by count desc, then by time desc
          if (countA !== countB) return countB - countA;
          return timeB.localeCompare(timeA);
        });
      
      const latestTimestamp = sortedTimestamps[0][0];
      
      // Get diff files for latest session
      const diffFiles = allDiffFiles
        .filter(f => f.includes(latestTimestamp))
        .sort();

      // Process each diff file
      for (const diffFile of diffFiles) {
        // Match both formats: new format with diff-X.X% and old format without percentage
        let pageMatch = diffFile.match(/page-(\d+)_([^_]+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_diff-([0-9.]+)%\.png$/);
        if (!pageMatch) {
          // Try old format
          pageMatch = diffFile.match(/page-(\d+)_([^_]+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_diff\.png$/);
          if (pageMatch) {
            pageMatch = [...pageMatch, '0']; // Add default 0% diff for old format
          }
        }
        if (!pageMatch) continue;
        
        const [, pageNum, pageName, timestamp, diffRateStr] = pageMatch;
        const diffRate = parseFloat(diffRateStr);
        
        // Find corresponding baseline and after images (any timestamp for same page)
        let baselineFile = null;
        let afterFile = null;
        
        if (fs.existsSync(baselineDir)) {
          const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));
          baselineFile = baselineFiles
            .filter(f => f.includes(`page-${pageNum}_${pageName}`))
            .sort().reverse()[0]; // Get latest baseline for this page
        }
        
        if (fs.existsSync(afterDir)) {
          const afterFiles = fs.readdirSync(afterDir).filter(f => f.endsWith('.png'));
          afterFile = afterFiles
            .filter(f => f.includes(`page-${pageNum}_${pageName}`))
            .sort().reverse()[0]; // Get latest after for this page
        }

        // ページURLを生成
        const pageUrl = getPageUrlFromSite(site, pageName);
        
        comparisons.push({
          pageName: pageName,
          pageNum: parseInt(pageNum),
          diffRate: diffRate,
          url: pageUrl,
          baseline: baselineFile ? `${siteId}/baseline/desktop/${baselineFile}` : null,
          after: afterFile ? `${siteId}/after/desktop/${afterFile}` : null,
          diff: `${siteId}/desktop/threshold-2/${diffFile}`
        });

        // Update stats
        if (diffRate <= 2.0) {
          stats.okCount++;
        } else {
          stats.ngCount++;
        }
        stats.totalDiffRate += diffRate;
      }

      // Calculate average diff rate
      if (comparisons.length > 0) {
        stats.avgDiffRate = stats.totalDiffRate / comparisons.length;
      }

      // Sort by page number
      comparisons.sort((a, b) => a.pageNum - b.pageNum);

      allResults.push({
        siteId: siteId,
        siteName: site.name,
        comparisons: comparisons,
        stats: stats
      });
    }

    res.json({
      success: true,
      sites: allResults
    });

  } catch (error) {
    console.error('❌ 全サイト比較画像データ取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 📦 比較画像ZIP ダウンロード
 */
app.get('/download-comparison-zip/:siteId', async (req, res) => {
  try {
    const siteId = req.params.siteId;
    const site = sitesManager.getSite(siteId);
    
    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'サイトが見つかりません'
      });
    }

    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 }});
    
    const filename = `${siteId}_comparison_images_${new Date().toISOString().split('T')[0]}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    archive.pipe(res);

    // Screenshots directories
    const baselineDir = path.join(SCREENSHOTS_DIR, siteId, 'baseline', 'desktop');
    const afterDir = path.join(SCREENSHOTS_DIR, siteId, 'after', 'desktop');
    
    // Diff images directory  
    const diffsDir = path.join(DIFFS_DIR, siteId, 'desktop', 'threshold-2');

    // Get latest timestamp from all screenshot files
    let allScreenshotFiles = [];
    if (fs.existsSync(baselineDir)) {
      const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));
      allScreenshotFiles = allScreenshotFiles.concat(baselineFiles.map(f => ({ file: f, type: 'baseline', dir: baselineDir })));
    }
    if (fs.existsSync(afterDir)) {
      const afterFiles = fs.readdirSync(afterDir).filter(f => f.endsWith('.png'));
      allScreenshotFiles = allScreenshotFiles.concat(afterFiles.map(f => ({ file: f, type: 'after', dir: afterDir })));
    }
    
    if (allScreenshotFiles.length > 0) {
      const timestamps = [...new Set(allScreenshotFiles.map(item => {
        const match = item.file.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
        return match ? match[1] : null;
      }).filter(Boolean))];
      
      if (timestamps.length > 0) {
        const latestTimestamp = timestamps.sort().reverse()[0];
        const latestFiles = allScreenshotFiles.filter(item => item.file.includes(latestTimestamp));
        
        for (const item of latestFiles) {
          const filePath = path.join(item.dir, item.file);
          if (fs.existsSync(filePath)) {
            archive.file(filePath, { name: `${item.type}/${item.file}` });
          }
        }
      }
    }

    if (fs.existsSync(diffsDir)) {
      // Get latest session diff files
      const diffFiles = fs.readdirSync(diffsDir).filter(f => f.endsWith('.png'));
      const timestamps = [...new Set(diffFiles.map(f => {
        const match = f.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
        return match ? match[1] : null;
      }).filter(Boolean))];
      
      if (timestamps.length > 0) {
        const latestTimestamp = timestamps.sort().reverse()[0];
        const latestDiffFiles = diffFiles.filter(f => f.includes(latestTimestamp));
        
        for (const file of latestDiffFiles) {
          const filePath = path.join(diffsDir, file);
          if (fs.existsSync(filePath)) {
            archive.file(filePath, { name: `diff/${file}` });
          }
        }
      }
    }

    await archive.finalize();

  } catch (error) {
    console.error('❌ 比較画像ZIP ダウンロードエラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🎉 Local WordPress VRT Server running on port ${PORT}`);
  console.log(`🌐 API URL: http://localhost:${PORT}`);
  console.log('🚀 Ready for high-precision WordPress VRT!');
});

/**
 * 複数ページ画像比較
 */
async function compareMultiPageScreenshots(siteId, device, threshold = 2.0) {
  const baselineDir = path.join(SCREENSHOTS_DIR, siteId, 'baseline', device);
  const afterDir = path.join(SCREENSHOTS_DIR, siteId, 'after', device);

  if (!fs.existsSync(baselineDir) || !fs.existsSync(afterDir)) {
    throw new Error('Baseline または After スクリーンショットが見つかりません');
  }

  const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));
  const afterFiles = fs.readdirSync(afterDir).filter(f => f.endsWith('.png'));

  console.log(`🔍 複数ページ比較: baseline ${baselineFiles.length}ファイル, after ${afterFiles.length}ファイル`);

  const results = [];
  const processedPairs = new Map();

  // 最新セッション同士でページIDペアリング
  const baselineSessionMap = new Map();
  const afterSessionMap = new Map();

  // baselineファイルをページごとに分類し、最新のものを取得
  // ページ識別子のみでペアリング（pageIdは無視）
  baselineFiles.forEach(f => {
    const pageMatch = f.match(/page-(\d{3})_([^_]+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
    if (pageMatch) {
      const pageKey = pageMatch[2]; // 識別子のみを使用
      const timestamp = pageMatch[3];

      if (!baselineSessionMap.has(pageKey) || timestamp > baselineSessionMap.get(pageKey).timestamp) {
        baselineSessionMap.set(pageKey, { file: f, timestamp, pageId: pageMatch[1], pageIdentifier: pageMatch[2] });
      }
    }
  });

  // afterファイルをページごとに分類し、最新のものを取得
  // ページ識別子のみでペアリング（pageIdは無視）
  afterFiles.forEach(f => {
    const pageMatch = f.match(/page-(\d{3})_([^_]+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
    if (pageMatch) {
      const pageKey = pageMatch[2]; // 識別子のみを使用
      const timestamp = pageMatch[3];

      if (!afterSessionMap.has(pageKey) || timestamp > afterSessionMap.get(pageKey).timestamp) {
        afterSessionMap.set(pageKey, { file: f, timestamp, pageId: pageMatch[1], pageIdentifier: pageMatch[2] });
      }
    }
  });

  console.log(`🔄 最新ペアリング: baseline ${baselineSessionMap.size}ページ, after ${afterSessionMap.size}ページ`);

  // 最新セッション同士でペアを作成
  for (const [pageKey, baselineInfo] of baselineSessionMap) {
    const afterInfo = afterSessionMap.get(pageKey);

    if (afterInfo) {
      console.log(`📊 ページ${baselineInfo.pageId} (${baselineInfo.pageIdentifier}) を比較中...`);

      try {
        // 重複差分ファイルを削除
        await cleanupOldDiffFiles(siteId, device, baselineInfo.pageId, baselineInfo.pageIdentifier);

        const result = await compareFiles(
          path.join(baselineDir, baselineInfo.file),
          path.join(afterDir, afterInfo.file),
          siteId,
          device,
          threshold,
          { pageId: baselineInfo.pageId, pageIdentifier: baselineInfo.pageIdentifier }
        );

        results.push({
          pageId: baselineInfo.pageId,
          pageIdentifier: baselineInfo.pageIdentifier,
          baselineFile: baselineInfo.file,
          afterFile: afterInfo.file,
          baselineTimestamp: baselineInfo.timestamp,
          afterTimestamp: afterInfo.timestamp,
          ...result
        });

        processedPairs.set(baselineInfo.pageId, true);
      } catch (error) {
        console.error(`❌ ページ${baselineInfo.pageId} の比較エラー:`, error.message);
        results.push({
          pageId: baselineInfo.pageId,
          pageIdentifier: baselineInfo.pageIdentifier,
          error: error.message,
          status: 'ERROR'
        });
      }
    } else {
      console.log(`⚠️ ページ${baselineInfo.pageId} (${baselineInfo.pageIdentifier}) のafterファイルが見つかりません`);
    }
  }

  // 統計情報
  const summary = {
    totalPages: results.length,
    ok: results.filter(r => r.status === 'OK').length,
    ng: results.filter(r => r.status === 'NG').length,
    error: results.filter(r => r.status === 'ERROR').length,
    threshold: threshold
  };

  console.log(`✅ 複数ページ比較完了: ${summary.totalPages}ページ (OK: ${summary.ok}, NG: ${summary.ng})`);

  return {
    siteId,
    device,
    summary,
    results: results.sort((a, b) => a.pageId.localeCompare(b.pageId))
  };
}

/**
 * 古い差分ファイルをクリーンアップ
 */
async function cleanupOldDiffFiles(siteId, device, pageId, pageIdentifier) {
  const diffDir = path.join(DIFFS_DIR, siteId, device);

  if (!fs.existsSync(diffDir)) {
    return;
  }

  try {
    const files = fs.readdirSync(diffDir, { recursive: true });
    const targetFiles = files.filter(file =>
      file.includes(`page-${pageId}_${pageIdentifier}_`) &&
      file.endsWith('_diff.png')
    );

    for (const file of targetFiles) {
      const filePath = path.join(diffDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ 古い差分ファイルを削除: ${file}`);
      }
    }

    console.log(`✅ ページ${pageId}_${pageIdentifier}の古い差分ファイルをクリーンアップ完了`);
  } catch (error) {
    console.error('❌ 差分ファイルクリーンアップエラー:', error);
  }
}

/**
 * 既存の差分ファイルを検索
 */
async function findExistingDiffFile(siteId, device, pageIdentifier) {
  const diffDir = path.join(DIFFS_DIR, siteId, device);

  if (!fs.existsSync(diffDir)) {
    return null;
  }

  try {
    const files = fs.readdirSync(diffDir, { recursive: true });

    // より厳密なパターンマッチング：page-XXX_pageIdentifier_*_diff.png
    const diffFiles = files.filter(file => {
      const pageMatch = file.match(/page-\d{3}_([^_]+)_.*_diff\.png$/);
      return pageMatch && pageMatch[1] === pageIdentifier;
    }).sort().reverse(); // 最新ファイルを優先

    if (diffFiles.length > 0) {
      const latestDiffFile = diffFiles[0];
      const fullPath = path.join(diffDir, latestDiffFile);

      // 相対パス作成（WebUIで表示可能にする）
      const relativePath = `/diffs/${siteId}/${device}/${latestDiffFile}`;

      // 差分ファイル名から差分率を抽出（ファイル名に含まれている場合）
      let diffPercentage = 0;
      let status = 'OK';

      // 差分ファイル名から差分率を抽出する試行（より包括的なパターンマッチング）
      let diffRateMatch = latestDiffFile.match(/diff-(\d+(?:\.\d+)?)%/);
      
      // 代替パターン: 小数点が任意の位置にある場合も対応
      if (!diffRateMatch) {
        diffRateMatch = latestDiffFile.match(/diff[_-](\d+(?:\.\d+)?)%/);
      }
      
      // さらに代替パターン: アンダースコアやハイフンの組み合わせ
      if (!diffRateMatch) {
        diffRateMatch = latestDiffFile.match(/(\d+(?:\.\d+)?)%/);
      }
      
      if (diffRateMatch) {
        diffPercentage = parseFloat(diffRateMatch[1]);
        status = diffPercentage > 2.0 ? 'NG' : 'OK';
        console.log(`✅ 既存差分ファイルから差分率抽出成功: ${diffPercentage}% (${latestDiffFile})`);
      } else {
        // ファイル名から抽出できない場合は、デフォルト値を設定（古いファイル形式対応）
        console.log(`⚠️ ファイル名から差分率を抽出できません: ${latestDiffFile}`)
        console.log(`🔄 古いファイル形式として処理します (差分率: 不明)`);
        diffPercentage = -1; // 不明を示す値
        status = 'Unknown'; // 不明ステータス
      }

      return {
        fullPath,
        relativePath,
        fileName: latestDiffFile,
        status,
        diffPercentage
      };
    }

    return null;
  } catch (error) {
    console.error('❌ 既存差分ファイル検索エラー:', error);
    return null;
  }
}

/**
 * ファイルペア比較
 */
async function compareFiles(baselinePath, afterPath, siteId, device, threshold, pageInfo) {
  // 画像読み込み
  const baselineBuffer = fs.readFileSync(baselinePath);
  const afterBuffer = fs.readFileSync(afterPath);

  const baselinePng = PNG.sync.read(baselineBuffer);
  const afterPng = PNG.sync.read(afterBuffer);

  // サイズ調整
  const maxWidth = Math.max(baselinePng.width, afterPng.width);
  const maxHeight = Math.max(baselinePng.height, afterPng.height);

  let resizedBaseline = baselinePng;
  let resizedAfter = afterPng;

  if (baselinePng.width !== maxWidth || baselinePng.height !== maxHeight) {
    const resizedBuffer = await sharp(baselineBuffer)
      .resize(maxWidth, maxHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    resizedBaseline = PNG.sync.read(resizedBuffer);
  }

  if (afterPng.width !== maxWidth || afterPng.height !== maxHeight) {
    const resizedBuffer = await sharp(afterBuffer)
      .resize(maxWidth, maxHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    resizedAfter = PNG.sync.read(resizedBuffer);
  }

  // 差分画像作成
  const diffPng = new PNG({ width: maxWidth, height: maxHeight });

  const diffPixels = pixelmatch(
    resizedBaseline.data,
    resizedAfter.data,
    diffPng.data,
    maxWidth,
    maxHeight,
    {
      threshold: CONFIG.PIXELMATCH_THRESHOLD,  // 正しい色差許容度を使用 (0.02)
      alpha: 0.1,
      antialiasing: false,                     // より正確な差分検出のため無効化
      diffColor: [255, 0, 0],
      diffColorAlt: [255, 255, 0]
    }
  );

  // 差分率計算（高精度）
  const totalPixels = maxWidth * maxHeight;
  const diffPercentage = (diffPixels / totalPixels) * 100;
  
  // 高精度な差分率（小数点6桁まで保持）
  const preciseDiffPercentage = Math.round(diffPercentage * 1000000) / 1000000;
  
  // ファイル名用の丸め（小数点4桁）
  const roundedForFilename = Math.round(diffPercentage * 10000) / 10000;

  // 差分画像保存
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const diffFilename = pageInfo
    ? `page-${pageInfo.pageId}_${pageInfo.pageIdentifier}_${timestamp}_diff-${roundedForFilename}%.png`
    : `${timestamp}_diff-${roundedForFilename}%.png`;
  const diffDir = path.join(DIFFS_DIR, siteId, device, `threshold-${threshold}`);

  fs.ensureDirSync(diffDir);
  const diffPath = path.join(diffDir, diffFilename);

  const diffBuffer = PNG.sync.write(diffPng);
  fs.writeFileSync(diffPath, diffBuffer);

  // 結果判定（高精度値で判定）
  const status = preciseDiffPercentage > threshold ? 'NG' : 'OK';

  return {
    diffPath: diffPath.replace(__dirname, ''),
    diffPixels,
    diffPercentage: preciseDiffPercentage,  // 高精度値を返す
    status,
    threshold,
    dimensions: { width: maxWidth, height: maxHeight }
  };
}

module.exports = app;
