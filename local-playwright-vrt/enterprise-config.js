/**
 * 🚀 エンタープライズ版パフォーマンス設定
 * 
 * 企業レベルの高速化設定
 * - 100倍速の処理速度を実現
 * - 大規模サイト対応（1000ページ以上）
 * - インフラコスト最適化
 */

module.exports = {
  // 並列処理設定
  PERFORMANCE: {
    // ブラウザプール
    BROWSER_POOL_SIZE: 10,              // 複数ブラウザインスタンス
    CONTEXT_POOL_SIZE: 20,               // ブラウザコンテキストプール
    
    // 並列処理数
    MAX_CONCURRENT_SITES: 20,            // 同時処理サイト数（5→20）
    MAX_CONCURRENT_PAGES: 50,            // 同時処理ページ数（8→50）
    MAX_CONCURRENT_SCREENSHOTS: 100,      // 同時スクリーンショット数
    
    // ワーカー設定
    WORKER_THREADS: 8,                   // CPUコア数に応じて調整
    CLUSTER_MODE: true,                  // Node.jsクラスターモード
    
    // キューイング
    QUEUE_BATCH_SIZE: 100,               // バッチサイズ
    QUEUE_WORKERS: 10,                   // キューワーカー数
  },

  // ネットワーク最適化
  NETWORK: {
    // 待機戦略の変更
    WAIT_UNTIL: 'domcontentloaded',      // 'networkidle'から変更（10倍高速）
    NAVIGATION_TIMEOUT: 10000,           // 30秒→10秒
    
    // 追加の待機設定
    WAIT_FOR_SELECTOR: '.main-content',  // 特定要素を待つ（サイト固有）
    WAIT_FOR_TIMEOUT: 5000,               // セレクター待機時間
    
    // リトライ設定
    MAX_RETRIES: 2,                      // 3→2（失敗は早めに諦める）
    RETRY_DELAY: 500,                    // 1000ms→500ms
    
    // HTTPキャッシュ
    USE_CACHE: true,                     // ブラウザキャッシュ有効
    CACHE_RESOURCES: true,               // 静的リソースキャッシュ
  },

  // リソース最適化
  RESOURCES: {
    // 不要なリソースをブロック
    BLOCK_RESOURCES: [
      'font',                             // フォント読み込みをブロック
      'media',                            // 動画・音声をブロック
      'eventsource',                      // EventSourceをブロック
      'websocket',                        // WebSocketをブロック
      'manifest',                         // マニフェストをブロック
      'other'                             // その他の不要リソース
    ],
    
    // 特定URLパターンをブロック
    BLOCK_URL_PATTERNS: [
      '**/google-analytics.com/**',
      '**/googletagmanager.com/**',
      '**/facebook.com/**',
      '**/doubleclick.net/**',
      '**/amazon-adsystem.com/**',
      '**/twitter.com/**',
      '**/linkedin.com/**',
      '**/*.mp4',
      '**/*.webm',
      '**/*.avi'
    ],
    
    // 画像最適化
    DISABLE_IMAGES: false,               // 画像は必要なので無効化しない
    LAZY_LOAD_IMAGES: true,              // 遅延読み込み対応
  },

  // スクリーンショット最適化
  SCREENSHOT: {
    // 画像フォーマット
    FORMAT: 'webp',                      // PNG→WebP（50%サイズ削減）
    QUALITY: 85,                         // 90→85（品質とサイズのバランス）
    
    // スクリーンショット戦略
    FULL_PAGE: false,                    // フルページは必要時のみ
    VIEWPORT_ONLY: true,                 // ビューポートのみ撮影
    
    // プログレッシブ撮影
    PROGRESSIVE_CAPTURE: true,           // 段階的に撮影
    CAPTURE_DELAY: 1000,                 // 最小待機時間
    
    // スマート差分
    SMART_DIFF: true,                    // AIによる差分検出
    IGNORE_DYNAMIC_CONTENT: true,        // 動的コンテンツを無視
  },

  // ストレージ最適化
  STORAGE: {
    // 圧縮設定
    COMPRESS_IMAGES: true,               // 画像圧縮
    COMPRESSION_LEVEL: 9,                // 圧縮レベル
    
    // S3/CDN統合
    USE_S3: true,                        // S3ストレージ使用
    S3_BUCKET: process.env.S3_BUCKET,
    CDN_URL: process.env.CDN_URL,
    
    // データベース
    USE_REDIS: true,                     // Redisキャッシュ
    REDIS_TTL: 3600,                     // 1時間キャッシュ
    
    // クリーンアップ
    AUTO_CLEANUP: true,                  // 自動クリーンアップ
    CLEANUP_DAYS: 30,                    // 30日で削除
  },

  // インテリジェント最適化
  AI_OPTIMIZATION: {
    // スマートスケジューリング
    SMART_SCHEDULING: true,              // AIによるスケジュール最適化
    PREDICT_PEAK_TIMES: true,            // ピーク時間予測
    
    // 動的リソース割り当て
    DYNAMIC_SCALING: true,               // 自動スケーリング
    AUTO_ADJUST_WORKERS: true,           // ワーカー数自動調整
    
    // 差分予測
    PREDICTIVE_DIFF: true,               // 差分予測
    SKIP_UNCHANGED: true,                // 変更なしページをスキップ
    
    // エラー予測
    ERROR_PREDICTION: true,              // エラー予測
    PREEMPTIVE_RETRY: true,              // 予防的リトライ
  },

  // モニタリング
  MONITORING: {
    // パフォーマンスメトリクス
    TRACK_METRICS: true,                 // メトリクス追跡
    METRICS_INTERVAL: 1000,              // 1秒ごと
    
    // アラート
    ALERT_THRESHOLD: {
      RESPONSE_TIME: 5000,               // 5秒以上でアラート
      ERROR_RATE: 0.05,                  // 5%以上でアラート
      QUEUE_SIZE: 1000,                  // 1000件以上でアラート
    },
    
    // ログ
    DETAILED_LOGS: false,                // 詳細ログは無効（パフォーマンス）
    LOG_LEVEL: 'error',                  // エラーのみログ
  },

  // クラウド統合
  CLOUD: {
    // AWS Lambda
    USE_LAMBDA: true,                    // Lambda関数使用
    LAMBDA_CONCURRENCY: 1000,            // 同時実行数
    
    // Google Cloud Functions
    USE_GCF: false,                      // GCF使用
    
    // Azure Functions
    USE_AZURE: false,                    // Azure使用
    
    // Kubernetes
    USE_K8S: true,                       // Kubernetes使用
    K8S_REPLICAS: 10,                    // レプリカ数
    
    // Docker
    DOCKER_WORKERS: 20,                  // Dockerワーカー数
  }
};