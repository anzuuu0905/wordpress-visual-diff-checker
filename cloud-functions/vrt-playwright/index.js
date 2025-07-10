/**
 * WordPress VRT with Playwright - Cloud Functions
 * 高精度スクリーンショット比較システム
 */

const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const { Firestore } = require('@google-cloud/firestore');
const { chromium } = require('playwright');
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');
const sharp = require('sharp');
const axios = require('axios');

// 初期化
const storage = new Storage();
const firestore = new Firestore();
const bucket = storage.bucket(process.env.STORAGE_BUCKET || 'wordpress-vrt-screenshots');

// 設定
const CONFIG = {
  VIEWPORT: { width: 1920, height: 1080 },
  MOBILE_VIEWPORT: { width: 375, height: 667 },
  DIFF_THRESHOLD: 0.1, // 0.1% = かなり敏感
  TIMEOUT: 60000,
  MAX_CONCURRENT: 3,
  SCREENSHOT_QUALITY: 90
};

/**
 * 🎯 メインエントリーポイント
 */
functions.http('wordpressVRT', async (req, res) => {
  // CORS設定
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).send();
  }

  try {
    const { action, ...params } = req.body;
    
    console.log(`🚀 WordPress VRT 実行開始: ${action}`, params);
    
    let result;
    switch (action) {
      case 'screenshot':
        result = await takeScreenshot(params);
        break;
      case 'compare':
        result = await compareScreenshots(params);
        break;
      case 'full-vrt':
        result = await runFullVRT(params);
        break;
      case 'batch-vrt':
        result = await runBatchVRT(params);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    console.log(`✅ 処理完了: ${action}`);
    res.json({ success: true, result });
    
  } catch (error) {
    console.error('❌ VRT エラー:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * 🎯 高精度スクリーンショット撮影
 */
async function takeScreenshot({ url, siteId, type, device = 'desktop' }) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=TranslateUI'
    ]
  });

  try {
    const context = await browser.newContext({
      viewport: device === 'mobile' ? CONFIG.MOBILE_VIEWPORT : CONFIG.VIEWPORT,
      deviceScaleFactor: 1,
      hasTouch: device === 'mobile',
      isMobile: device === 'mobile',
      // WordPress最適化設定
      ignoreHTTPSErrors: true,
      reducedMotion: 'reduce',
      forcedColors: 'none',
      colorScheme: 'light'
    });

    const page = await context.newPage();
    
    // WordPress特化の設定
    await setupWordPressOptimization(page);
    
    console.log(`📸 スクリーンショット撮影開始: ${url} (${device})`);
    
    // ページ読み込み
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: CONFIG.TIMEOUT
    });
    
    // WordPress特化の待機処理
    await waitForWordPressReady(page);
    
    // 高精度スクリーンショット撮影
    const screenshot = await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      type: 'png',
      quality: CONFIG.SCREENSHOT_QUALITY
    });
    
    // Cloud Storageに保存
    const filename = `${siteId}/${type}/${device}/${Date.now()}.png`;
    const file = bucket.file(filename);
    await file.save(screenshot, {
      metadata: {
        contentType: 'image/png',
        metadata: {
          url,
          siteId,
          type,
          device,
          timestamp: new Date().toISOString(),
          viewport: JSON.stringify(device === 'mobile' ? CONFIG.MOBILE_VIEWPORT : CONFIG.VIEWPORT)
        }
      }
    });
    
    console.log(`✅ スクリーンショット保存完了: ${filename}`);
    
    return {
      filename,
      url,
      siteId,
      type,
      device,
      size: screenshot.length,
      timestamp: new Date().toISOString()
    };
    
  } finally {
    await browser.close();
  }
}

/**
 * 🎯 WordPress最適化設定
 */
async function setupWordPressOptimization(page) {
  // JavaScript実行前の初期化
  await page.addInitScript(() => {
    // アニメーション無効化
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
    
    // CSS変数でアニメーション制御
    document.documentElement.style.setProperty('--animation-duration', '0s');
    document.documentElement.style.setProperty('--transition-duration', '0s');
  });
  
  // ユーザーエージェント設定
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
}

/**
 * 🎯 WordPress読み込み完了待機
 */
async function waitForWordPressReady(page) {
  // 基本的な読み込み完了
  await page.waitForLoadState('networkidle');
  
  // jQuery & WordPress特化の待機
  await page.waitForFunction(() => {
    // jQuery読み込み完了
    if (window.jQuery) {
      // アクティブなAjaxリクエスト完了
      if (window.jQuery.active > 0) return false;
    }
    
    // フォント読み込み完了
    if (!document.fonts.ready) return false;
    
    // 画像読み込み完了チェック
    const images = Array.from(document.images);
    for (const img of images) {
      if (!img.complete) return false;
    }
    
    // WordPress固有の読み込み完了チェック
    if (window.wp && window.wp.domReady) {
      return document.readyState === 'complete';
    }
    
    return document.readyState === 'complete';
  }, {}, { timeout: 30000 });
  
  // 追加の安定化待機
  await page.waitForTimeout(2000);
  
  console.log('✅ WordPress読み込み完了確認');
}

/**
 * 🎯 高精度画像比較
 */
async function compareScreenshots({ siteId, baselineFile, afterFile, device = 'desktop' }) {
  try {
    console.log(`🔍 画像比較開始: ${siteId} (${device})`);
    
    // 画像ファイルを取得
    const [baselineBuffer] = await bucket.file(baselineFile).download();
    const [afterBuffer] = await bucket.file(afterFile).download();
    
    // PNGとして読み込み
    const baselinePng = PNG.sync.read(baselineBuffer);
    const afterPng = PNG.sync.read(afterBuffer);
    
    // サイズが異なる場合はリサイズ
    if (baselinePng.width !== afterPng.width || baselinePng.height !== afterPng.height) {
      console.log('📐 画像サイズ調整中...');
      
      const maxWidth = Math.max(baselinePng.width, afterPng.width);
      const maxHeight = Math.max(baselinePng.height, afterPng.height);
      
      const resizedBaseline = await resizeImage(baselineBuffer, maxWidth, maxHeight);
      const resizedAfter = await resizeImage(afterBuffer, maxWidth, maxHeight);
      
      baselinePng = PNG.sync.read(resizedBaseline);
      afterPng = PNG.sync.read(resizedAfter);
    }
    
    // 差分画像作成
    const { width, height } = baselinePng;
    const diffPng = new PNG({ width, height });
    
    // pixelmatchで高精度比較
    const diffPixels = pixelmatch(
      baselinePng.data,
      afterPng.data,
      diffPng.data,
      width,
      height,
      {
        threshold: CONFIG.DIFF_THRESHOLD,
        alpha: 0.1,
        antialiasing: true,
        diffColor: [255, 0, 0], // 赤色で差分表示
        diffColorAlt: [255, 255, 0] // 黄色で微差表示
      }
    );
    
    // 差分率計算
    const totalPixels = width * height;
    const diffPercentage = (diffPixels / totalPixels) * 100;
    
    // 差分画像を保存
    const diffFilename = `${siteId}/diff/${device}/${Date.now()}_diff.png`;
    const diffBuffer = PNG.sync.write(diffPng);
    await bucket.file(diffFilename).save(diffBuffer, {
      metadata: {
        contentType: 'image/png',
        metadata: {
          siteId,
          device,
          baselineFile,
          afterFile,
          diffPixels: diffPixels.toString(),
          diffPercentage: diffPercentage.toString(),
          timestamp: new Date().toISOString()
        }
      }
    });
    
    // 結果判定
    const threshold = 2.0; // 2%を閾値とする
    const status = diffPercentage > threshold ? 'NG' : 'OK';
    
    console.log(`${status === 'NG' ? '⚠️' : '✅'} 比較結果: ${diffPercentage.toFixed(3)}% (${diffPixels}px)`);
    
    return {
      siteId,
      device,
      baselineFile,
      afterFile,
      diffFile: diffFilename,
      diffPixels,
      diffPercentage: Math.round(diffPercentage * 1000) / 1000,
      status,
      threshold,
      timestamp: new Date().toISOString(),
      dimensions: { width, height }
    };
    
  } catch (error) {
    console.error('❌ 画像比較エラー:', error);
    throw error;
  }
}

/**
 * 🎯 画像リサイズユーティリティ
 */
async function resizeImage(buffer, width, height) {
  return await sharp(buffer)
    .resize(width, height, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toBuffer();
}

/**
 * 🎯 フルVRTチェック実行
 */
async function runFullVRT({ url, siteId, devices = ['desktop'] }) {
  const results = [];
  
  try {
    console.log(`🎯 フルVRTチェック開始: ${siteId}`);
    
    // 複数デバイスでの並列処理
    for (const device of devices) {
      console.log(`📱 ${device} での処理開始`);
      
      // Baseline撮影
      const baselineResult = await takeScreenshot({
        url,
        siteId,
        type: 'baseline',
        device
      });
      
      // After撮影（実際の運用では手動更新後に実行）
      const afterResult = await takeScreenshot({
        url,
        siteId,
        type: 'after',
        device
      });
      
      // 比較実行
      const compareResult = await compareScreenshots({
        siteId,
        baselineFile: baselineResult.filename,
        afterFile: afterResult.filename,
        device
      });
      
      results.push({
        device,
        baseline: baselineResult,
        after: afterResult,
        comparison: compareResult
      });
    }
    
    // 結果をFirestoreに保存
    await saveVRTResults(siteId, results);
    
    // 通知送信（NGの場合）
    const ngResults = results.filter(r => r.comparison.status === 'NG');
    if (ngResults.length > 0) {
      await sendNotification(siteId, url, ngResults);
    }
    
    console.log(`✅ フルVRTチェック完了: ${siteId}`);
    
    return {
      siteId,
      url,
      devices,
      results,
      summary: {
        total: results.length,
        ng: ngResults.length,
        ok: results.length - ngResults.length
      },
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ フルVRTエラー:', error);
    throw error;
  }
}

/**
 * 🎯 バッチVRT実行
 */
async function runBatchVRT({ sites }) {
  const results = [];
  
  console.log(`🔄 バッチVRT開始: ${sites.length} サイト`);
  
  // 並列実行制御
  for (let i = 0; i < sites.length; i += CONFIG.MAX_CONCURRENT) {
    const batch = sites.slice(i, i + CONFIG.MAX_CONCURRENT);
    const batchPromises = batch.map(site => 
      runFullVRT(site).catch(error => ({
        ...site,
        error: error.message,
        status: 'ERROR'
      }))
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    console.log(`📊 バッチ進捗: ${Math.min(i + CONFIG.MAX_CONCURRENT, sites.length)}/${sites.length}`);
  }
  
  console.log(`✅ バッチVRT完了: ${results.length} サイト`);
  
  return {
    totalSites: sites.length,
    results,
    summary: {
      success: results.filter(r => !r.error).length,
      error: results.filter(r => r.error).length,
      ng: results.filter(r => r.results && r.results.some(res => res.comparison.status === 'NG')).length
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * 🎯 結果保存
 */
async function saveVRTResults(siteId, results) {
  const doc = {
    siteId,
    results,
    timestamp: new Date(),
    summary: {
      total: results.length,
      ng: results.filter(r => r.comparison.status === 'NG').length
    }
  };
  
  await firestore.collection('vrt_results').add(doc);
  console.log('💾 結果をFirestoreに保存完了');
}

/**
 * 🎯 通知送信
 */
async function sendNotification(siteId, url, ngResults) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  
  const message = {
    text: `⚠️ WordPress VRT 差分検出`,
    attachments: [{
      color: 'warning',
      fields: [
        { title: 'サイト', value: siteId, short: true },
        { title: 'URL', value: url, short: true },
        { title: 'NG検出数', value: ngResults.length.toString(), short: true },
        { 
          title: '詳細', 
          value: ngResults.map(r => 
            `${r.device}: ${r.comparison.diffPercentage}%`
          ).join('\n'), 
          short: false 
        }
      ]
    }]
  };
  
  try {
    await axios.post(webhookUrl, message);
    console.log('📢 Slack通知送信完了');
  } catch (error) {
    console.error('❌ 通知送信エラー:', error.message);
  }
}

module.exports = { wordpressVRT: functions.http };