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

const app = express();
const PORT = process.env.PORT || 3000;

// グローバルブラウザインスタンス（再利用）
let globalBrowser = null;

// スクリーンショット保存ディレクトリ
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const DIFFS_DIR = path.join(__dirname, 'diffs');

// ディレクトリ作成
fs.ensureDirSync(SCREENSHOTS_DIR);
fs.ensureDirSync(DIFFS_DIR);

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
  DIFF_THRESHOLD: 0.1,
  TIMEOUT: 60000,
  SCREENSHOT_QUALITY: 90,
  MAX_CONCURRENT_SITES: 3, // 同時処理サイト数
  MAX_CONCURRENT_PAGES: 5  // 同時処理ページ数
};

console.log('🚀 Local WordPress VRT Server Starting...');
console.log(`📁 Screenshots: ${SCREENSHOTS_DIR}`);
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
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    playwright: 'ready'
  });
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
      return {
        siteId: site.id,
        siteName: site.name,
        device,
        captureCount: captureResults.length,
        captureResults: captureResults.map(r => ({
          url: r.url,
          filename: r.filename,
          timestamp: r.timestamp
        })),
        timestamp: new Date().toISOString()
      };
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
      allResults.push({
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
      });
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
    
    // 最新の更新日時でソート
    results.sort((a, b) => {
      const getLatestTime = (site) => {
        let latest = 0;
        site.devices.forEach(device => {
          if (device.baseline.latest) {
            latest = Math.max(latest, new Date(device.baseline.latest.timestamp).getTime());
          }
          if (device.after.latest) {
            latest = Math.max(latest, new Date(device.after.latest.timestamp).getTime());
          }
        });
        return latest;
      };
      return getLatestTime(b) - getLatestTime(a);
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
        
        return {
          filename: file,
          sessionTimestamp,
          pageIdentifier,
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
          
          return {
            filename: file,
            sessionTimestamp: latestSession,
            pageIdentifier,
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
            
            return {
              filename: file,
              sessionTimestamp,
              pageIdentifier,
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
              isExistingResult: true
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
      threshold: CONFIG.DIFF_THRESHOLD,
      alpha: 0.1,
      antialiasing: true,
      diffColor: [255, 0, 0],
      diffColorAlt: [255, 255, 0]
    }
  );
  
  const totalPixels = maxWidth * maxHeight;
  const diffPercentage = (diffPixels / totalPixels) * 100;
  
  // baselineのファイル名からpageInfoを抽出
  const baselineFilename = path.basename(baselinePath);
  const pageMatch = baselineFilename.match(/page-(\d{3})_([^_]+)_/);
  
  // 差分画像を保存
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let diffFilename;
  if (pageMatch) {
    const pageId = pageMatch[1];
    const pageIdentifier = pageMatch[2];
    diffFilename = `page-${pageId}_${pageIdentifier}_${timestamp}_diff.png`;
  } else {
    // フォールバック：旧形式
    diffFilename = `${path.basename(baselinePath, '.png')}_diff_${timestamp}.png`;
  }
  const diffDir = path.join(DIFFS_DIR, siteId, device, `threshold-${threshold}`);
  
  fs.ensureDirSync(diffDir);
  const diffPath = path.join(diffDir, diffFilename);
  
  const diffBuffer = PNG.sync.write(diffPng);
  fs.writeFileSync(diffPath, diffBuffer);
  
  return {
    status: diffPercentage > threshold ? 'NG' : 'OK',
    diffPercentage: Math.round(diffPercentage * 1000) / 1000,
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
    
    const context = await browser.newContext(contextOptions);

    const page = await context.newPage();
    
    // WordPress最適化設定
    await setupWordPressOptimization(page);
    
    // ページ読み込み
    try {
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: CONFIG.TIMEOUT
      });
    } catch (error) {
      console.log('⚠️ ページ読み込みでタイムアウト - DOMContentLoadedで再試行');
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.TIMEOUT
      });
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
    try {
      await context.close();
    } catch (error) {
      console.log('⚠️ コンテキストクローズエラー:', error.message);
    }
  }
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
    }, {}, { timeout: 15000 });
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
    }, {}, { timeout: 10000 });
  } catch (error) {
    console.log('⚠️ ローダー要素の確認でタイムアウト - 処理を続行します');
  }
  
  // フェードイン効果の完了を待機
  await page.waitForTimeout(2000);
  
  // ページを最後までスクロール（遅延読み込み対応）
  await autoScrollToBottom(page);
  
  // スクロール後の追加読み込み待機
  await page.waitForTimeout(1000);
}

/**
 * 自動スクロール（遅延読み込み対応）
 */
async function autoScrollToBottom(page) {
  console.log('📜 ページを最後までスクロール中...');
  
  let previousHeight = 0;
  let currentHeight = await page.evaluate(() => document.body.scrollHeight);
  let scrollAttempts = 0;
  const maxScrollAttempts = 10;
  
  while (previousHeight !== currentHeight && scrollAttempts < maxScrollAttempts) {
    previousHeight = currentHeight;
    
    // スムーズスクロール実行
    await page.evaluate(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
    });
    
    // スクロール完了まで待機
    await page.waitForTimeout(1500);
    
    // 遅延読み込み要素の読み込み待機
    try {
      await page.waitForFunction(() => {
        const lazyImages = document.querySelectorAll('img[loading="lazy"], img[data-src], .lazy');
        const loadingImages = Array.from(lazyImages).filter(img => 
          !img.complete || !img.src || img.src.includes('data:')
        );
        return loadingImages.length < 3;
      }, {}, { timeout: 3000 });
    } catch (error) {
      console.log('⚠️ 遅延読み込み画像の確認でタイムアウト');
    }
    
    currentHeight = await page.evaluate(() => document.body.scrollHeight);
    scrollAttempts++;
    
    console.log(`📏 スクロール ${scrollAttempts}: ${previousHeight} → ${currentHeight}`);
  }
  
  // 最終的にトップに戻る
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  await page.waitForTimeout(1000);
  console.log('✅ スクロール完了');
}

/**
 * 高精度画像比較
 */
async function compareHighPrecisionScreenshots(siteId, device, threshold = 2.0) {
  const baselineDir = path.join(SCREENSHOTS_DIR, siteId, 'baseline', device);
  const afterDir = path.join(SCREENSHOTS_DIR, siteId, 'after', device);
  
  if (!fs.existsSync(baselineDir) || !fs.existsSync(afterDir)) {
    throw new Error('Baseline または After スクリーンショットが見つかりません');
  }
  
  // ページペアでファイルを取得
  const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));
  const afterFiles = fs.readdirSync(afterDir).filter(f => f.endsWith('.png'));
  
  if (baselineFiles.length === 0 || afterFiles.length === 0) {
    throw new Error('比較対象のスクリーンショットファイルが見つかりません');
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
    throw new Error('対応するページペアが見つかりません');
  }
  
  const baselinePath = path.join(baselineDir, baselineFile);
  const afterPath = path.join(afterDir, afterFile);
  
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
      threshold: CONFIG.DIFF_THRESHOLD,
      alpha: 0.1,
      antialiasing: true,
      diffColor: [255, 0, 0],
      diffColorAlt: [255, 255, 0]
    }
  );
  
  // 差分率計算
  const totalPixels = maxWidth * maxHeight;
  const diffPercentage = (diffPixels / totalPixels) * 100;
  
  // 差分画像保存（闾値別ディレクトリ）
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const diffFilename = `${timestamp}_diff.png`;
  const diffDir = path.join(DIFFS_DIR, siteId, device, `threshold-${threshold}`);
  
  fs.ensureDirSync(diffDir);
  const diffPath = path.join(diffDir, diffFilename);
  
  const diffBuffer = PNG.sync.write(diffPng);
  fs.writeFileSync(diffPath, diffBuffer);
  
  // 結果判定
  const status = diffPercentage > threshold ? 'NG' : 'OK';
  
  console.log(`${status === 'NG' ? '⚠️' : '✅'} 比較結果: ${diffPercentage.toFixed(3)}% (${diffPixels}px) [闾値: ${threshold}%]`);
  
  return {
    siteId,
    device,
    baselineFile,
    afterFile,
    diffFile: diffFilename,
    diffPath: `/diffs/${siteId}/${device}/threshold-${threshold}/${diffFilename}`,
    diffPixels,
    diffPercentage: Math.round(diffPercentage * 1000) / 1000,
    status,
    threshold,
    timestamp: new Date().toISOString(),
    dimensions: { width: maxWidth, height: maxHeight }
  };
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
  baselineFiles.forEach(f => {
    const pageMatch = f.match(/page-(\d{3})_([^_]+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
    if (pageMatch) {
      const pageKey = `${pageMatch[1]}_${pageMatch[2]}`;
      const timestamp = pageMatch[3];
      
      if (!baselineSessionMap.has(pageKey) || timestamp > baselineSessionMap.get(pageKey).timestamp) {
        baselineSessionMap.set(pageKey, { file: f, timestamp, pageId: pageMatch[1], pageIdentifier: pageMatch[2] });
      }
    }
  });
  
  // afterファイルをページごとに分類し、最新のものを取得
  afterFiles.forEach(f => {
    const pageMatch = f.match(/page-(\d{3})_([^_]+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
    if (pageMatch) {
      const pageKey = `${pageMatch[1]}_${pageMatch[2]}`;
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
      
      return {
        fullPath,
        relativePath,
        fileName: latestDiffFile,
        status: 'OK', // 簡易判定（実際は差分率から判定すべき）
        diffPercentage: 0 // 実際の値は不明だが、既存ファイルなので0とする
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
      threshold: CONFIG.DIFF_THRESHOLD,
      alpha: 0.1,
      antialiasing: true,
      diffColor: [255, 0, 0],
      diffColorAlt: [255, 255, 0]
    }
  );
  
  // 差分率計算
  const totalPixels = maxWidth * maxHeight;
  const diffPercentage = (diffPixels / totalPixels) * 100;
  
  // 差分画像保存
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const diffFilename = pageInfo 
    ? `page-${pageInfo.pageId}_${pageInfo.pageIdentifier}_${timestamp}_diff.png`
    : `${timestamp}_diff.png`;
  const diffDir = path.join(DIFFS_DIR, siteId, device, `threshold-${threshold}`);
  
  fs.ensureDirSync(diffDir);
  const diffPath = path.join(diffDir, diffFilename);
  
  const diffBuffer = PNG.sync.write(diffPng);
  fs.writeFileSync(diffPath, diffBuffer);
  
  // 結果判定
  const status = diffPercentage > threshold ? 'NG' : 'OK';
  
  return {
    diffPath: diffPath.replace(__dirname, ''),
    diffPixels,
    diffPercentage: Math.round(diffPercentage * 1000) / 1000,
    status,
    threshold,
    dimensions: { width: maxWidth, height: maxHeight }
  };
}

module.exports = app;