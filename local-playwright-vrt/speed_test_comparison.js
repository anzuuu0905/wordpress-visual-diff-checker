#!/usr/bin/env node

/**
 * 🧪 JS/画像無効化の実際の効果を測定
 * 
 * 同じページで以下を比較:
 * 1. 通常モード (JS有効、画像有効)
 * 2. 最適化モード (JS無効、画像無効)
 */

const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');

async function speedTestComparison() {
  console.log('🧪 JS/画像無効化の効果測定開始\n');

  const testUrl = 'https://earthcampus.co.jp/works/';  // 重い画像の多いページ
  const results = {};

  let browser;
  try {
    browser = await chromium.launch({ headless: true });

    // 1. 通常モード (現在の設定)
    console.log('📸 通常モード測定中...');
    const normalResult = await testMode(browser, testUrl, {
      name: '通常モード',
      javaScriptEnabled: true,
      imagesEnabled: true,
      blockResources: false
    });
    results.normal = normalResult;

    // 2. JS無効モード
    console.log('🚫 JS無効モード測定中...');
    const jsDisabledResult = await testMode(browser, testUrl, {
      name: 'JS無効',
      javaScriptEnabled: false,
      imagesEnabled: true,
      blockResources: false
    });
    results.jsDisabled = jsDisabledResult;

    // 3. 画像無効モード
    console.log('🖼️ 画像無効モード測定中...');
    const imageDisabledResult = await testMode(browser, testUrl, {
      name: '画像無効',
      javaScriptEnabled: true,
      imagesEnabled: false,
      blockResources: true
    });
    results.imageDisabled = imageDisabledResult;

    // 4. 完全最適化モード
    console.log('⚡ 完全最適化モード測定中...');
    const optimizedResult = await testMode(browser, testUrl, {
      name: '完全最適化',
      javaScriptEnabled: false,
      imagesEnabled: false,
      blockResources: true
    });
    results.optimized = optimizedResult;

  } finally {
    if (browser) await browser.close();
  }

  // 結果分析
  console.log('\n📊 ============ 速度比較結果 ============');
  console.log(`テストURL: ${testUrl}\n`);

  Object.entries(results).forEach(([key, result]) => {
    if (result.success) {
      console.log(`${result.config.name}:`);
      console.log(`  - 読み込み時間: ${result.loadTime}ms`);
      console.log(`  - スクリーンショット: ${result.screenshotTime}ms`);
      console.log(`  - 合計時間: ${result.totalTime}ms`);
      console.log(`  - ファイルサイズ: ${(result.fileSize / 1024).toFixed(0)}KB`);
      console.log('');
    } else {
      console.log(`${result.config.name}: ❌ エラー - ${result.error}`);
      console.log('');
    }
  });

  // 改善効果の計算
  if (results.normal.success && results.optimized.success) {
    const improvement = results.normal.totalTime / results.optimized.totalTime;
    const timeSaved = results.normal.totalTime - results.optimized.totalTime;
    
    console.log('🚀 最適化効果:');
    console.log(`  - 高速化: ${improvement.toFixed(2)}倍`);
    console.log(`  - 短縮時間: ${timeSaved}ms (${(timeSaved/1000).toFixed(1)}秒)`);
    
    // 20ページでの予測
    const normal20Pages = (results.normal.totalTime * 20) / 1000;
    const optimized20Pages = (results.optimized.totalTime * 20) / 1000;
    console.log(`\n📈 20ページでの予測:`);
    console.log(`  - 通常: ${(normal20Pages/60).toFixed(1)}分`);
    console.log(`  - 最適化: ${(optimized20Pages/60).toFixed(1)}分`);
    console.log(`  - 節約時間: ${((normal20Pages - optimized20Pages)/60).toFixed(1)}分`);

    if (improvement >= 3) {
      console.log('\n✅ 結論: 劇的改善確認！(3倍以上)');
    } else if (improvement >= 2) {
      console.log('\n✅ 結論: 大幅改善確認！(2倍以上)');
    } else if (improvement >= 1.5) {
      console.log('\n⚠️  結論: 中程度の改善');
    } else {
      console.log('\n❌ 結論: 効果は限定的');
    }
  }
}

async function testMode(browser, url, config) {
  const startTime = Date.now();
  
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      javaScriptEnabled: config.javaScriptEnabled
    });

    const page = await context.newPage();

    // リソースブロック設定
    if (config.blockResources) {
      await page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        const url = route.request().url();
        
        const blockTypes = config.imagesEnabled ? [] : ['image'];
        const blockPatterns = [
          'google-analytics', 'googletagmanager', 'facebook',
          'doubleclick', 'amazon-adsystem', '.woff', '.woff2'
        ];
        
        if (blockTypes.includes(resourceType) || 
            blockPatterns.some(pattern => url.includes(pattern))) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    // ページ読み込み
    const loadStart = Date.now();
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // 最小待機
    await page.waitForTimeout(1000);
    
    const loadTime = Date.now() - loadStart;

    // スクリーンショット
    const screenshotStart = Date.now();
    const screenshot = await page.screenshot({
      fullPage: false,
      type: 'png'
    });
    const screenshotTime = Date.now() - screenshotStart;

    await context.close();

    const totalTime = Date.now() - startTime;

    return {
      success: true,
      config,
      loadTime,
      screenshotTime,
      totalTime,
      fileSize: screenshot.length
    };

  } catch (error) {
    return {
      success: false,
      config,
      error: error.message
    };
  }
}

// 実行
if (require.main === module) {
  speedTestComparison().catch(console.error);
}

module.exports = { speedTestComparison };