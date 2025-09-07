/**
 * 🚀 並列比較エンジンのserver.js統合用パッチ
 * 
 * 使用方法:
 * 1. server.jsの compareHighPrecisionScreenshots 関数を置き換え
 * 2. compareMultiPageScreenshots 関数を新規追加
 * 3. 既存API(/compare, /compare-multi)で並列処理が動作
 */

const ParallelComparisonEngine = require('./parallel_comparison_engine');

/**
 * 並列化された高精度画像比較（単一ページ）
 * 従来の compareHighPrecisionScreenshots の置き換え
 */
async function compareHighPrecisionScreenshots(siteId, device, threshold = 2.0) {
  const engine = new ParallelComparisonEngine({
    concurrency: 1, // 単一ページなので並列度1
    screenshotsDir: SCREENSHOTS_DIR,
    diffsDir: DIFFS_DIR,
    pixelmatchThreshold: CONFIG.PIXELMATCH_THRESHOLD
  });

  try {
    const result = await engine.compareMultiplePages(siteId, device, threshold);
    
    // 従来のAPI互換性のため、最初の結果を返す
    if (result.results && result.results.length > 0) {
      return result.results[0];
    } else {
      throw new Error('比較対象が見つかりません');
    }
  } catch (error) {
    console.error('❌ 画像比較エラー:', error.message);
    throw error;
  }
}

/**
 * 並列化された複数ページ画像比較（新機能）
 */
async function compareMultiPageScreenshots(siteId, device, threshold = 2.0) {
  console.log(`🚀 複数ページ並列比較開始: ${siteId} (${device})`);
  
  const engine = new ParallelComparisonEngine({
    concurrency: 4, // 4並列で高速化
    screenshotsDir: SCREENSHOTS_DIR,
    diffsDir: DIFFS_DIR,
    pixelmatchThreshold: CONFIG.PIXELMATCH_THRESHOLD
  });

  try {
    const result = await engine.compareMultiplePages(siteId, device, threshold);
    
    // 詳細ログ
    const metrics = engine.getMetrics();
    console.log(`📊 並列比較メトリクス:`);
    console.log(`  - 処理時間: ${metrics.totalTime}`);
    console.log(`  - スループット: ${metrics.throughput}`);
    console.log(`  - 並列度: ${engine.concurrency}`);
    
    return result;
  } catch (error) {
    console.error('❌ 複数ページ比較エラー:', error.message);
    throw error;
  }
}

/**
 * 既存のserver.jsに追加すべき新しいエンドポイント
 */
function addParallelComparisonEndpoints(app) {
  
  // 高速並列比較エンドポイント
  app.post('/compare-parallel', async (req, res) => {
    try {
      const { siteId, device = 'desktop', threshold = 2.0, concurrency = 4 } = req.body;

      if (!siteId) {
        return res.status(400).json({
          success: false,
          error: 'siteId is required'
        });
      }

      console.log(`🚀 高速並列比較開始: ${siteId} (${device}, ${concurrency}並列)`);

      const engine = new ParallelComparisonEngine({
        concurrency,
        screenshotsDir: SCREENSHOTS_DIR,
        diffsDir: DIFFS_DIR,
        pixelmatchThreshold: CONFIG.PIXELMATCH_THRESHOLD
      });

      const result = await engine.compareMultiplePages(siteId, device, threshold);

      res.json({ 
        success: true, 
        result,
        metrics: engine.getMetrics()
      });

    } catch (error) {
      console.error('❌ 並列比較エラー:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ベンチマーク用エンドポイント
  app.post('/compare-benchmark', async (req, res) => {
    try {
      const { siteId, device = 'desktop', threshold = 2.0 } = req.body;

      if (!siteId) {
        return res.status(400).json({
          success: false,
          error: 'siteId is required'
        });
      }

      console.log(`📊 比較ベンチマーク開始: ${siteId}`);

      const results = {};

      // 1. 逐次処理（従来）
      console.log('🐌 逐次処理テスト...');
      const sequentialStart = Date.now();
      const sequentialEngine = new ParallelComparisonEngine({
        concurrency: 1,
        screenshotsDir: SCREENSHOTS_DIR,
        diffsDir: DIFFS_DIR
      });
      const sequentialResult = await sequentialEngine.compareMultiplePages(siteId, device, threshold);
      results.sequential = {
        time: (Date.now() - sequentialStart) / 1000,
        result: sequentialResult.summary
      };

      // 2. 4並列処理
      console.log('🚀 4並列処理テスト...');
      const parallelStart = Date.now();
      const parallelEngine = new ParallelComparisonEngine({
        concurrency: 4,
        screenshotsDir: SCREENSHOTS_DIR,
        diffsDir: DIFFS_DIR
      });
      const parallelResult = await parallelEngine.compareMultiplePages(siteId, device, threshold);
      results.parallel = {
        time: (Date.now() - parallelStart) / 1000,
        result: parallelResult.summary
      };

      // 3. パフォーマンス分析
      const improvement = (results.sequential.time / results.parallel.time).toFixed(2);
      results.analysis = {
        speedup: `${improvement}倍高速化`,
        timeSaved: `${(results.sequential.time - results.parallel.time).toFixed(1)}秒短縮`,
        recommendation: improvement >= 2 ? '並列化推奨' : '効果限定的'
      };

      console.log(`📊 ベンチマーク完了: ${improvement}倍高速化`);

      res.json({ success: true, benchmark: results });

    } catch (error) {
      console.error('❌ ベンチマークエラー:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}

module.exports = {
  compareHighPrecisionScreenshots,
  compareMultiPageScreenshots,
  addParallelComparisonEndpoints,
  ParallelComparisonEngine
};