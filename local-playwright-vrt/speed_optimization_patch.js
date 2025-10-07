/**
 * 🚀 速度最適化パッチ
 * 
 * 現状: 4分30秒（20ページ）
 * 目標: 1分30秒（20ページ）
 * 改善: 3倍高速化
 */

// server.jsの設定を高速化用に変更
const SPEED_OPTIMIZED_CONFIG = {
  // 1. 基本設定の高速化
  VIEWPORT: { width: 1920, height: 1080 },
  MOBILE_VIEWPORT: { width: 375, height: 667 },
  TIMEOUT: 30000,  // 60秒 → 30秒に短縮
  SCREENSHOT_QUALITY: 80,  // 90 → 80（高速化）
  MAX_CONCURRENT_PAGES: 16,  // 12 → 16に増加
  
  // 2. WordPress特有の最適化
  WORDPRESS_LOAD_TIMEOUT: 5000,  // 15秒 → 5秒に短縮
  SCROLL_TIMEOUT: 1000,  // 大幅短縮
  IMAGE_LOAD_TIMEOUT: 2000,  // 画像待機を短縮
  
  // 3. 新しい高速化フラグ
  SKIP_FULL_SCROLL: true,  // フルスクロール省略
  MINIMAL_WAITING: true,   // 最小待機モード
  FAST_SCREENSHOT_MODE: true  // 高速撮影モード
};

/**
 * 高速化されたスクリーンショット撮影関数
 */
async function takeHighSpeedScreenshot(url, siteId, type, device, pageInfo = null, sessionTimestamp = null) {
  const browser = await getBrowser();
  let context = null;
  
  try {
    // 1. 高速ブラウザコンテキスト
    context = await browser.newContext({
      viewport: device === 'mobile' ? SPEED_OPTIMIZED_CONFIG.MOBILE_VIEWPORT : SPEED_OPTIMIZED_CONFIG.VIEWPORT,
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
      bypassCSP: true,
      // 高速化: 不要な機能を無効化
      javaScriptEnabled: false,  // JS無効で高速化
      imagesEnabled: false       // 画像読み込み無効
    });

    const page = await context.newPage();

    // 2. 不要リソースブロック（さらに強化）
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      const url = route.request().url();
      
      // 大幅にブロック対象を拡大
      const blockTypes = ['image', 'media', 'font', 'websocket', 'manifest', 'other'];
      const blockPatterns = [
        'google-analytics', 'googletagmanager', 'facebook', 'twitter',
        'doubleclick', 'amazon-adsystem', 'linkedin', '.jpg', '.jpeg', '.png', '.gif',
        '.woff', '.woff2', '.ttf', 'fonts.googleapis.com'
      ];
      
      if (blockTypes.includes(resourceType) || 
          blockPatterns.some(pattern => url.includes(pattern))) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // 3. 最速ページ読み込み
    await page.goto(url, {
      waitUntil: 'domcontentloaded',  // networkidleは使わない
      timeout: SPEED_OPTIMIZED_CONFIG.TIMEOUT
    });

    // 4. 最小待機のみ
    await page.waitForTimeout(500);  // 0.5秒のみ

    // 5. スクロール省略モード
    if (!SPEED_OPTIMIZED_CONFIG.SKIP_FULL_SCROLL) {
      // 簡易スクロール（3回のみ）
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(100);
      }
    }

    // 6. 高速スクリーンショット
    const startTime = Date.now();
    const screenshot = await page.screenshot({
      fullPage: false,  // ビューポートのみで高速化
      animations: 'disabled',
      type: 'png',
      quality: SPEED_OPTIMIZED_CONFIG.SCREENSHOT_QUALITY
    });
    const screenshotTime = Date.now() - startTime;

    // 7. ファイル保存
    const timestamp = sessionTimestamp || new Date().toISOString().replace(/[:.]/g, '-');
    const pageIdentifier = pageInfo ? pageInfo.pageIdentifier : 'single';
    const filename = `page-${String(pageInfo?.pageNumber || 1).padStart(3, '0')}_${pageIdentifier}_${timestamp}.png`;
    
    const screenshotDir = path.join(SCREENSHOTS_DIR, siteId, type, device);
    fs.ensureDirSync(screenshotDir);
    
    const screenshotPath = path.join(screenshotDir, filename);
    fs.writeFileSync(screenshotPath, screenshot);

    const totalTime = Date.now() - startTime;
    console.log(`⚡ 高速撮影 [${pageIdentifier}]: ${totalTime}ms (撮影: ${screenshotTime}ms)`);

    return {
      success: true,
      url,
      filename,
      path: screenshotPath,
      relativePath: `screenshots/${siteId}/${type}/${device}/${filename}`,
      size: screenshot.length,
      timestamp: new Date().toISOString(),
      device,
      processingTime: totalTime,
      pageIdentifier,
      pageUrl: pageInfo ? pageInfo.url : url
    };

  } finally {
    if (context) await context.close();
  }
}

/**
 * 並列処理の最適化
 */
async function processHighSpeedBatch(pages, processor, concurrency = 16) {
  const limit = pLimit(concurrency);
  const startTime = Date.now();
  
  console.log(`⚡ 高速並列処理開始: ${pages.length}ページ (${concurrency}並列)`);
  
  const promises = pages.map((page, index) =>
    limit(async () => {
      const pageStart = Date.now();
      try {
        const result = await processor(page, index);
        const pageTime = Date.now() - pageStart;
        console.log(`✅ [${index + 1}/${pages.length}] ${page.pageIdentifier || 'unknown'}: ${pageTime}ms`);
        return result;
      } catch (error) {
        console.error(`❌ [${index + 1}/${pages.length}] エラー: ${error.message}`);
        return { success: false, error: error.message, page };
      }
    })
  );

  const results = await Promise.all(promises);
  const totalTime = (Date.now() - startTime) / 1000;
  const avgTime = Math.round(totalTime / pages.length * 1000);

  console.log(`🚀 高速並列完了: ${totalTime.toFixed(1)}秒 (平均: ${avgTime}ms/ページ)`);
  
  return {
    results: results.filter(r => r.success),
    errors: results.filter(r => !r.success),
    totalTime,
    avgTime
  };
}

module.exports = {
  SPEED_OPTIMIZED_CONFIG,
  takeHighSpeedScreenshot,
  processHighSpeedBatch
};