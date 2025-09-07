#!/usr/bin/env node

/**
 * 🧪 並列比較エンジンのテストスクリプト
 * 
 * 実際のスクリーンショットファイルを使用して
 * 逐次処理 vs 並列処理のベンチマークを実行
 */

const ParallelComparisonEngine = require('./parallel_comparison_engine');
const path = require('path');
const fs = require('fs-extra');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const DIFFS_DIR = path.join(__dirname, 'diffs');

async function runBenchmark() {
  console.log('🧪 並列比較ベンチマーク開始\n');

  // テスト対象サイトを探す
  const testSite = findTestSite();
  if (!testSite) {
    console.log('❌ テスト用のスクリーンショットが見つかりません');
    return;
  }

  console.log(`📸 テストサイト: ${testSite.siteId}`);
  console.log(`📊 比較対象: ${testSite.fileCount}ファイル\n`);

  const results = {};

  // 1. 逐次処理テスト
  console.log('🐌 逐次処理テスト（従来方式）');
  const sequentialEngine = new ParallelComparisonEngine({
    concurrency: 1,
    screenshotsDir: SCREENSHOTS_DIR,
    diffsDir: DIFFS_DIR
  });

  const sequentialStart = Date.now();
  try {
    const sequentialResult = await sequentialEngine.compareMultiplePages(
      testSite.siteId, 
      'desktop', 
      2.0
    );
    const sequentialTime = (Date.now() - sequentialStart) / 1000;
    results.sequential = {
      time: sequentialTime,
      summary: sequentialResult.summary,
      success: true
    };
    console.log(`✅ 逐次処理完了: ${sequentialTime.toFixed(1)}秒\n`);
  } catch (error) {
    results.sequential = { success: false, error: error.message };
    console.log(`❌ 逐次処理エラー: ${error.message}\n`);
  }

  // 2. 並列処理テスト（4並列）
  console.log('🚀 並列処理テスト（4並列）');
  const parallelEngine = new ParallelComparisonEngine({
    concurrency: 4,
    screenshotsDir: SCREENSHOTS_DIR,
    diffsDir: DIFFS_DIR
  });

  const parallelStart = Date.now();
  try {
    const parallelResult = await parallelEngine.compareMultiplePages(
      testSite.siteId, 
      'desktop', 
      2.0
    );
    const parallelTime = (Date.now() - parallelStart) / 1000;
    results.parallel = {
      time: parallelTime,
      summary: parallelResult.summary,
      success: true
    };
    console.log(`✅ 並列処理完了: ${parallelTime.toFixed(1)}秒\n`);
  } catch (error) {
    results.parallel = { success: false, error: error.message };
    console.log(`❌ 並列処理エラー: ${error.message}\n`);
  }

  // 3. 結果分析
  console.log('📊 ============ ベンチマーク結果 ============');
  
  if (results.sequential.success && results.parallel.success) {
    const improvement = (results.sequential.time / results.parallel.time);
    const timeSaved = results.sequential.time - results.parallel.time;
    
    console.log(`📈 パフォーマンス改善:`);
    console.log(`  - 逐次処理: ${results.sequential.time.toFixed(1)}秒`);
    console.log(`  - 並列処理: ${results.parallel.time.toFixed(1)}秒`);
    console.log(`  - 高速化: ${improvement.toFixed(2)}倍`);
    console.log(`  - 短縮時間: ${timeSaved.toFixed(1)}秒`);
    
    console.log(`\n🎯 実用効果予測 (20ページ):`);
    const estimated20Sequential = (results.sequential.time / testSite.fileCount) * 20;
    const estimated20Parallel = (results.parallel.time / testSite.fileCount) * 20;
    console.log(`  - 従来: ${estimated20Sequential.toFixed(1)}秒 (${(estimated20Sequential/60).toFixed(1)}分)`);
    console.log(`  - 並列: ${estimated20Parallel.toFixed(1)}秒 (${(estimated20Parallel/60).toFixed(1)}分)`);
    console.log(`  - 節約時間: ${((estimated20Sequential - estimated20Parallel)/60).toFixed(1)}分`);

    // 推奨事項
    if (improvement >= 3) {
      console.log(`\n✅ 推奨: 並列化実装を強く推奨（3倍以上の高速化）`);
    } else if (improvement >= 2) {
      console.log(`\n✅ 推奨: 並列化実装を推奨（2倍以上の高速化）`);
    } else if (improvement >= 1.5) {
      console.log(`\n⚠️  推奨: 並列化実装を検討（中程度の改善）`);
    } else {
      console.log(`\n❌ 推奨: 並列化の効果は限定的`);
    }
  } else {
    console.log(`❌ ベンチマーク失敗:`);
    if (!results.sequential.success) {
      console.log(`  - 逐次処理エラー: ${results.sequential.error}`);
    }
    if (!results.parallel.success) {
      console.log(`  - 並列処理エラー: ${results.parallel.error}`);
    }
  }
  
  console.log('\n🔚 ベンチマーク終了');
}

/**
 * テスト用のサイトを探す
 */
function findTestSite() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    return null;
  }

  const siteDirs = fs.readdirSync(SCREENSHOTS_DIR);
  
  for (const siteDir of siteDirs) {
    const sitePath = path.join(SCREENSHOTS_DIR, siteDir);
    if (!fs.statSync(sitePath).isDirectory()) continue;

    const baselineDir = path.join(sitePath, 'baseline', 'desktop');
    const afterDir = path.join(sitePath, 'after', 'desktop');

    if (fs.existsSync(baselineDir) && fs.existsSync(afterDir)) {
      const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));
      const afterFiles = fs.readdirSync(afterDir).filter(f => f.endsWith('.png'));

      if (baselineFiles.length > 0 && afterFiles.length > 0) {
        return {
          siteId: siteDir,
          fileCount: Math.min(baselineFiles.length, afterFiles.length)
        };
      }
    }
  }

  return null;
}

/**
 * コマンドライン引数での実行
 */
async function runWithArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    await runBenchmark();
    return;
  }

  const siteId = args[0];
  const concurrency = parseInt(args[1]) || 4;

  console.log(`🎯 指定サイトテスト: ${siteId} (${concurrency}並列)`);

  const engine = new ParallelComparisonEngine({
    concurrency,
    screenshotsDir: SCREENSHOTS_DIR,
    diffsDir: DIFFS_DIR
  });

  try {
    const result = await engine.compareMultiplePages(siteId, 'desktop', 2.0);
    console.log('✅ テスト完了:', result.summary);
  } catch (error) {
    console.error('❌ テストエラー:', error.message);
  }
}

// 実行
if (require.main === module) {
  runWithArgs().catch(console.error);
}

module.exports = { runBenchmark, findTestSite };