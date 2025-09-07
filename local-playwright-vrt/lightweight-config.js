/**
 * 🪶 軽量版設定 - PC負荷を最小限に
 * 
 * メモリ使用: 500MB以下
 * CPU使用: 10-20%
 * 他の作業しながら使える設定
 */

module.exports = {
  // 🔧 リソース最小化設定
  RESOURCE_MODE: 'lightweight',  // lightweight | balanced | performance
  
  // 並列処理（控えめ）
  PERFORMANCE: {
    // ブラウザは1つだけ（メモリ節約）
    BROWSER_POOL_SIZE: 1,
    
    // 同時処理は2-3ページ（CPU負荷軽減）
    MAX_CONCURRENT_PAGES: 2,
    
    // 処理間隔を開ける（CPU休憩）
    DELAY_BETWEEN_PAGES: 500,  // 0.5秒待機
    
    // バッチ処理（少しずつ処理）
    BATCH_SIZE: 5,  // 5ページごとに休憩
    BATCH_DELAY: 2000,  // バッチ間で2秒休憩
  },

  // ネットワーク設定（安定重視）
  NETWORK: {
    // 最速ではないが安定した待機
    WAIT_UNTIL: 'domcontentloaded',
    NAVIGATION_TIMEOUT: 15000,  // 15秒（余裕を持たせる）
    
    // リトライは最小限
    MAX_RETRIES: 1,
    RETRY_DELAY: 1000,
  },

  // メモリ最適化
  MEMORY: {
    // 画像は即座に圧縮
    COMPRESS_IMMEDIATELY: true,
    
    // 古いデータは即削除
    CLEAR_CACHE_AFTER_PAGES: 10,
    
    // スクリーンショット品質を下げる（メモリ節約）
    SCREENSHOT_QUALITY: 70,  // 90→70
    
    // フルページスクリーンショットは無効
    FULL_PAGE: false,
    
    // 画像フォーマット（JPEGが最軽量）
    IMAGE_FORMAT: 'jpeg',
  },

  // CPU最適化
  CPU: {
    // CPUプライオリティを下げる
    PROCESS_PRIORITY: 'low',
    
    // 重い処理を避ける
    DISABLE_ANIMATIONS: true,
    DISABLE_WEB_FONTS: true,
    DISABLE_IMAGES_PRELOAD: true,
    
    // JavaScriptの実行を制限
    LIMIT_JS_EXECUTION: true,
  },

  // ブラウザ起動オプション（メモリ・CPU節約）
  BROWSER_ARGS: [
    // メモリ節約
    '--memory-pressure-off',
    '--max_old_space_size=512',  // Node.jsヒープを512MBに制限
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--no-sandbox',
    
    // CPU節約
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    
    // 不要機能を無効化
    '--disable-extensions',
    '--disable-plugins',
    '--disable-images',  // 画像の事前読み込みを無効
    '--disable-javascript',  // 重いJSサイトでは無効化
    '--disable-web-security',
    '--disable-features=TranslateUI',
    '--disable-sync',
    '--disable-default-apps',
    
    // ネットワーク最適化
    '--aggressive-cache-discard',
    '--disable-background-networking',
  ],

  // 自動調整機能
  AUTO_ADJUST: {
    // メモリ使用量を監視
    MONITOR_MEMORY: true,
    MEMORY_THRESHOLD: 500,  // 500MB超えたら並列数を減らす
    
    // CPU使用率を監視
    MONITOR_CPU: true,
    CPU_THRESHOLD: 30,  // 30%超えたら処理を遅くする
    
    // 自動調整
    AUTO_THROTTLE: true,  // 負荷に応じて自動で調整
  },

  // プリセット選択
  PRESETS: {
    // 最小負荷（他の作業優先）
    minimal: {
      browsers: 1,
      parallel: 1,
      delay: 1000,
      quality: 60
    },
    
    // バランス（通常使用）
    balanced: {
      browsers: 1,
      parallel: 3,
      delay: 500,
      quality: 70
    },
    
    // 少し速く（短時間なら可）
    fast: {
      browsers: 2,
      parallel: 5,
      delay: 200,
      quality: 80
    }
  },

  // 推奨使用方法
  USAGE_TIPS: {
    '他の作業をしながら': 'minimal',
    'ちょっと確認したい': 'balanced',
    '急いでいる時': 'fast',
    '夜間・休憩中': 'performance'
  }
};