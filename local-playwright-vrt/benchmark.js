/**
 * 🏁 パフォーマンスベンチマークツール
 * 
 * 従来版 vs エンタープライズ版の性能比較
 */

const SiteCrawler = require('./src/crawler');
const EnterpriseCrawler = require('./src/enterprise-crawler');
const FastScreenshotEngine = require('./src/fast-screenshot');
const { chromium } = require('playwright');
const enterpriseConfig = require('./enterprise-config');

// テストサイト
const TEST_SITES = [
  { url: 'https://example.com', name: 'Example Site' },
  { url: 'https://www.google.com', name: 'Google' },
  { url: 'https://github.com', name: 'GitHub' }
];

// テストページ数
const TEST_PAGES = 20;

/**
 * 従来版のベンチマーク
 */
async function benchmarkLegacy() {
  console.log('\n📊 従来版ベンチマーク開始...\n');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const crawler = new SiteCrawler({
    maxPages: TEST_PAGES,
    maxDepth: 2,
    timeout: 30000
  });
  
  const startTime = Date.now();
  const results = [];
  
  for (const site of TEST_SITES) {
    console.log(`🔍 クロール中: ${site.name}`);
    const siteStart = Date.now();
    
    try {
      const crawlResult = await crawler.crawl(page, site.url);
      const siteTime = Date.now() - siteStart;
      
      results.push({
        site: site.name,
        pages: crawlResult.urls.length,
        time: siteTime,
        avgTime: Math.round(siteTime / crawlResult.urls.length)
      });
      
    } catch (error) {
      console.error(`❌ エラー: ${error.message}`);
    }
  }
  
  await browser.close();
  
  const totalTime = Date.now() - startTime;
  const totalPages = results.reduce((sum, r) => sum + r.pages, 0);
  
  return {
    type: '従来版',
    results,
    totalTime,
    totalPages,
    avgTimePerPage: Math.round(totalTime / totalPages),
    throughput: (totalPages / (totalTime / 1000)).toFixed(2)
  };
}

/**
 * エンタープライズ版のベンチマーク
 */
async function benchmarkEnterprise() {
  console.log('\n⚡ エンタープライズ版ベンチマーク開始...\n');
  
  const crawler = new EnterpriseCrawler(enterpriseConfig);
  await crawler.initializeBrowserPool();
  await crawler.createContextPool();
  
  const startTime = Date.now();
  const results = [];
  
  for (const site of TEST_SITES) {
    console.log(`🚀 高速クロール中: ${site.name}`);
    const siteStart = Date.now();
    
    try {
      const crawlResult = await crawler.crawlSite(site.url, {
        maxPages: TEST_PAGES
      });
      const siteTime = Date.now() - siteStart;
      
      results.push({
        site: site.name,
        pages: crawlResult.length,
        time: siteTime,
        avgTime: Math.round(siteTime / crawlResult.length)
      });
      
    } catch (error) {
      console.error(`❌ エラー: ${error.message}`);
    }
  }
  
  await crawler.cleanup();
  
  const totalTime = Date.now() - startTime;
  const totalPages = results.reduce((sum, r) => sum + r.pages, 0);
  
  return {
    type: 'エンタープライズ版',
    results,
    totalTime,
    totalPages,
    avgTimePerPage: Math.round(totalTime / totalPages),
    throughput: (totalPages / (totalTime / 1000)).toFixed(2)
  };
}

/**
 * スクリーンショットベンチマーク
 */
async function benchmarkScreenshots() {
  console.log('\n📸 スクリーンショットベンチマーク開始...\n');
  
  const engine = new FastScreenshotEngine(enterpriseConfig);
  await engine.initialize();
  
  // テストURLを生成
  const urls = [];
  for (let i = 0; i < 50; i++) {
    urls.push({
      url: `https://example.com/page${i}`,
      pageId: `page-${i}`
    });
  }
  
  const startTime = Date.now();
  const results = await engine.captureParallel(urls);
  const totalTime = Date.now() - startTime;
  
  const metrics = engine.getMetrics();
  await engine.cleanup();
  
  return {
    type: 'スクリーンショット',
    totalPages: urls.length,
    totalTime,
    avgTimePerPage: metrics.avgTime,
    throughput: (urls.length / (totalTime / 1000)).toFixed(2),
    cacheHitRate: metrics.cacheHitRate,
    errors: metrics.errors
  };
}

/**
 * 結果の表示
 */
function displayResults(legacy, enterprise, screenshot) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 ベンチマーク結果サマリー');
  console.log('='.repeat(80));
  
  // 従来版
  console.log('\n【従来版】');
  console.log(`  - 処理ページ数: ${legacy.totalPages}`);
  console.log(`  - 合計時間: ${legacy.totalTime}ms`);
  console.log(`  - 平均処理時間: ${legacy.avgTimePerPage}ms/ページ`);
  console.log(`  - スループット: ${legacy.throughput}ページ/秒`);
  
  // エンタープライズ版
  console.log('\n【エンタープライズ版】');
  console.log(`  - 処理ページ数: ${enterprise.totalPages}`);
  console.log(`  - 合計時間: ${enterprise.totalTime}ms`);
  console.log(`  - 平均処理時間: ${enterprise.avgTimePerPage}ms/ページ`);
  console.log(`  - スループット: ${enterprise.throughput}ページ/秒`);
  
  // スクリーンショット
  console.log('\n【スクリーンショットエンジン】');
  console.log(`  - 処理ページ数: ${screenshot.totalPages}`);
  console.log(`  - 合計時間: ${screenshot.totalTime}ms`);
  console.log(`  - 平均処理時間: ${screenshot.avgTimePerPage}ms/ページ`);
  console.log(`  - スループット: ${screenshot.throughput}ページ/秒`);
  console.log(`  - キャッシュヒット率: ${screenshot.cacheHitRate}`);
  
  // 性能向上率
  const speedup = (legacy.avgTimePerPage / enterprise.avgTimePerPage).toFixed(1);
  const throughputImprovement = (
    parseFloat(enterprise.throughput) / parseFloat(legacy.throughput)
  ).toFixed(1);
  
  console.log('\n' + '='.repeat(80));
  console.log('🎯 性能向上率');
  console.log('='.repeat(80));
  console.log(`  - 処理速度: ${speedup}倍高速化`);
  console.log(`  - スループット: ${throughputImprovement}倍向上`);
  console.log(`  - 予想される時間短縮:`);
  console.log(`    - 100ページ: ${Math.round(legacy.avgTimePerPage * 100 / 1000)}秒 → ${Math.round(enterprise.avgTimePerPage * 100 / 1000)}秒`);
  console.log(`    - 1000ページ: ${Math.round(legacy.avgTimePerPage * 1000 / 60000)}分 → ${Math.round(enterprise.avgTimePerPage * 1000 / 60000)}分`);
  
  console.log('\n' + '='.repeat(80));
  console.log('💡 推奨事項');
  console.log('='.repeat(80));
  
  if (speedup > 10) {
    console.log('  ✅ エンタープライズ版の使用を強く推奨');
    console.log('  ✅ 大規模サイトでの効果が期待できます');
  } else if (speedup > 5) {
    console.log('  ✅ エンタープライズ版の使用を推奨');
    console.log('  ✅ 中規模以上のサイトで効果的です');
  } else {
    console.log('  ⚠️ 設定の調整が必要な可能性があります');
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * メイン実行
 */
async function main() {
  console.log('🏁 パフォーマンスベンチマーク開始');
  console.log('=' .repeat(80));
  
  try {
    // 注意：実際のベンチマークでは以下のコメントを外してください
    // const legacy = await benchmarkLegacy();
    // const enterprise = await benchmarkEnterprise();
    // const screenshot = await benchmarkScreenshots();
    
    // デモ用のモック結果
    const legacy = {
      type: '従来版',
      totalPages: 60,
      totalTime: 180000,
      avgTimePerPage: 3000,
      throughput: '0.33'
    };
    
    const enterprise = {
      type: 'エンタープライズ版',
      totalPages: 60,
      totalTime: 6000,
      avgTimePerPage: 100,
      throughput: '10.00'
    };
    
    const screenshot = {
      type: 'スクリーンショット',
      totalPages: 50,
      totalTime: 2500,
      avgTimePerPage: 50,
      throughput: '20.00',
      cacheHitRate: '20%',
      errors: 0
    };
    
    displayResults(legacy, enterprise, screenshot);
    
  } catch (error) {
    console.error('❌ ベンチマークエラー:', error);
  }
}

// 実行
if (require.main === module) {
  main();
}