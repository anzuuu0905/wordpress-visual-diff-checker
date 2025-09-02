/**
 * Jest テストセットアップ
 */

// テスト用のタイムアウト設定
jest.setTimeout(30000);

// コンソールの警告を抑制（必要に応じて）
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  // 特定の警告を無視
  if (args[0] && typeof args[0] === 'string' && args[0].includes('deprecated')) {
    return;
  }
  originalConsoleWarn(...args);
};

// グローバルなテスト用の設定
global.testConfig = {
  timeout: 10000,
  retries: 3
};

// テスト終了時のクリーンアップ
afterAll(async () => {
  // 必要に応じてクリーンアップ処理を追加
  console.log('🧪 テスト完了');
});