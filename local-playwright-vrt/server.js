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

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// グローバルブラウザインスタンス（再利用）
let globalBrowser = null;

// スクリーンショット保存ディレクトリ
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const DIFFS_DIR = path.join(__dirname, 'diffs');

// ディレクトリ作成
fs.ensureDirSync(SCREENSHOTS_DIR);
fs.ensureDirSync(DIFFS_DIR);

// 設定
const CONFIG = {
  VIEWPORT: { width: 1920, height: 1080 },
  MOBILE_VIEWPORT: { width: 375, height: 667 },
  DIFF_THRESHOLD: 0.1,
  TIMEOUT: 60000,
  SCREENSHOT_QUALITY: 90
};

console.log('🚀 Local WordPress VRT Server Starting...');
console.log(`📁 Screenshots: ${SCREENSHOTS_DIR}`);
console.log(`📁 Diffs: ${DIFFS_DIR}`);

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
    const { siteId, device = 'desktop' } = req.body;
    
    if (!siteId) {
      return res.status(400).json({ 
        success: false, 
        error: 'siteId is required' 
      });
    }
    
    console.log(`🔍 画像比較開始: ${siteId} (${device})`);
    
    const result = await compareHighPrecisionScreenshots(siteId, device);
    
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
async function takeHighPrecisionScreenshot(url, siteId, type, device) {
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}.png`;
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
    await context.close();
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
async function compareHighPrecisionScreenshots(siteId, device) {
  const baselineDir = path.join(SCREENSHOTS_DIR, siteId, 'baseline', device);
  const afterDir = path.join(SCREENSHOTS_DIR, siteId, 'after', device);
  
  if (!fs.existsSync(baselineDir) || !fs.existsSync(afterDir)) {
    throw new Error('Baseline または After スクリーンショットが見つかりません');
  }
  
  // 最新のファイルを取得
  const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));
  const afterFiles = fs.readdirSync(afterDir).filter(f => f.endsWith('.png'));
  
  if (baselineFiles.length === 0 || afterFiles.length === 0) {
    throw new Error('比較対象のスクリーンショットファイルが見つかりません');
  }
  
  const baselineFile = baselineFiles.sort().pop();
  const afterFile = afterFiles.sort().pop();
  
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
  
  // 差分画像保存
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const diffFilename = `${timestamp}_diff.png`;
  const diffDir = path.join(DIFFS_DIR, siteId, device);
  
  fs.ensureDirSync(diffDir);
  const diffPath = path.join(diffDir, diffFilename);
  
  const diffBuffer = PNG.sync.write(diffPng);
  fs.writeFileSync(diffPath, diffBuffer);
  
  // 結果判定
  const threshold = 2.0;
  const status = diffPercentage > threshold ? 'NG' : 'OK';
  
  console.log(`${status === 'NG' ? '⚠️' : '✅'} 比較結果: ${diffPercentage.toFixed(3)}% (${diffPixels}px)`);
  
  return {
    siteId,
    device,
    baselineFile,
    afterFile,
    diffFile: diffFilename,
    diffPath: `/diffs/${siteId}/${device}/${diffFilename}`,
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

module.exports = app;