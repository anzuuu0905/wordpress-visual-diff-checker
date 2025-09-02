/**
 * 🧪 クローラーモジュールのテスト
 */

const SiteCrawler = require('../local-playwright-vrt/src/crawler');

describe('SiteCrawler', () => {
  let crawler;

  beforeEach(() => {
    crawler = new SiteCrawler({
      maxPages: 5,
      maxDepth: 2,
      timeout: 10000
    });
  });

  describe('normalizeUrl', () => {
    test('正常なURLを正しく正規化する', () => {
      expect(crawler.normalizeUrl('https://example.com/')).toBe('https://example.com');
      expect(crawler.normalizeUrl('https://example.com/page/')).toBe('https://example.com/page');
    });

    test('クエリパラメータをソートする', () => {
      const result = crawler.normalizeUrl('https://example.com?b=2&a=1');
      expect(result).toBe('https://example.com?a=1&b=2');
    });

    test('ハッシュフラグメントを除去する', () => {
      expect(crawler.normalizeUrl('https://example.com#section')).toBe('https://example.com');
    });

    test('不正なURLでエラーを投げない（安全に処理）', () => {
      expect(() => crawler.normalizeUrl('invalid-url')).not.toThrow();
      expect(crawler.normalizeUrl('invalid-url')).toBe('invalid-url');
    });
  });

  describe('shouldExclude', () => {
    test('wp-adminURLを除外する', () => {
      expect(crawler.shouldExclude('https://example.com/wp-admin/admin.php')).toBe(true);
    });

    test('PDFファイルを除外する', () => {
      expect(crawler.shouldExclude('https://example.com/file.pdf')).toBe(true);
    });

    test('通常のページは除外しない', () => {
      expect(crawler.shouldExclude('https://example.com/about')).toBe(false);
    });

    test('mailto:リンクを除外する', () => {
      expect(crawler.shouldExclude('mailto:test@example.com')).toBe(true);
    });
  });

  describe('isSameDomain', () => {
    test('同一ドメインを正しく判定する', () => {
      expect(crawler.isSameDomain('https://example.com/page', 'example.com')).toBe(true);
      expect(crawler.isSameDomain('https://sub.example.com/page', 'example.com')).toBe(false);
      expect(crawler.isSameDomain('https://other.com/page', 'example.com')).toBe(false);
    });
  });
});

// モックを使用した統合テスト
describe('SiteCrawler Integration', () => {
  test('クロール設定が正しく適用される', () => {
    const options = {
      maxPages: 10,
      maxDepth: 3,
      timeout: 30000,
      excludePatterns: [/test/]
    };
    
    const crawler = new SiteCrawler(options);
    
    expect(crawler.maxPages).toBe(10);
    expect(crawler.maxDepth).toBe(3);
    expect(crawler.timeout).toBe(30000);
    expect(crawler.excludePatterns).toContain(options.excludePatterns[0]);
  });
});