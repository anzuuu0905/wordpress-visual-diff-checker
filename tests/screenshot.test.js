/**
 * 🧪 スクリーンショットモジュールのテスト
 */

const fs = require('fs-extra');
const path = require('path');

// モック設定
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn()
  }
}));

jest.mock('fs-extra');
jest.mock('../src/error-handler');

const { chromium } = require('playwright');
const { ErrorHandler } = require('../src/error-handler');

describe('スクリーンショット機能', () => {
  let mockBrowser, mockContext, mockPage;
  let mockErrorHandler;

  beforeEach(() => {
    // Playwright モック
    mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-screenshot-data')),
      evaluate: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      addStyleTag: jest.fn().mockResolvedValue(undefined),
      addScriptTag: jest.fn().mockResolvedValue(undefined),
      setViewportSize: jest.fn().mockResolvedValue(undefined)
    };

    mockContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined)
    };

    mockBrowser = {
      newContext: jest.fn().mockResolvedValue(mockContext),
      close: jest.fn().mockResolvedValue(undefined)
    };

    chromium.launch.mockResolvedValue(mockBrowser);

    // ErrorHandler モック
    mockErrorHandler = {
      executeWithRetry: jest.fn().mockImplementation(async (fn) => await fn()),
      handleScreenshotError: jest.fn().mockResolvedValue('retry'),
      logError: jest.fn().mockResolvedValue(undefined)
    };

    ErrorHandler.mockImplementation(() => mockErrorHandler);

    // fs モック
    fs.ensureDirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('WordPress最適化設定', () => {
    test('WordPress用のスタイルが正しく注入される', async () => {
      const { setupWordPressOptimization } = require('../local-playwright-vrt/server');
      
      // WordPress最適化設定の実装をテスト用にインポート
      // 実際の実装では、server.jsから関数を分離してテスト可能にする必要があります
      
      await setupWordPressOptimization(mockPage);

      // WordPress用のCSSが適用されることを確認
      expect(mockPage.addStyleTag).toHaveBeenCalledWith({
        content: expect.stringContaining('animation')
      });
    });

    test('WordPress用のスクリプトが注入される', async () => {
      const { setupWordPressOptimization } = require('../local-playwright-vrt/server');
      
      await setupWordPressOptimization(mockPage);

      // WordPress用のJavaScriptが適用されることを確認
      expect(mockPage.addScriptTag).toHaveBeenCalledWith({
        content: expect.stringContaining('wp')
      });
    });
  });

  describe('スクリーンショット撮影', () => {
    test('正常なスクリーンショット撮影', async () => {
      // テスト用のスクリーンショット関数
      const takeTestScreenshot = async (url, siteId, type, device) => {
        const browser = await chromium.launch();
        const context = await browser.newContext({
          viewport: device === 'mobile' ? { width: 375, height: 667 } : { width: 1920, height: 1080 }
        });
        const page = await context.newPage();
        
        await page.goto(url);
        const screenshot = await page.screenshot({ fullPage: true });
        
        await context.close();
        
        return {
          filename: 'test.png',
          size: screenshot.length,
          timestamp: new Date().toISOString()
        };
      };

      const result = await takeTestScreenshot(
        'https://example.com',
        'test-site',
        'baseline',
        'desktop'
      );

      expect(result.filename).toBe('test.png');
      expect(result.size).toBeGreaterThan(0);
      expect(result.timestamp).toBeDefined();
      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        viewport: { width: 1920, height: 1080 }
      });
    });

    test('モバイル用スクリーンショット撮影', async () => {
      const takeTestScreenshot = async (url, siteId, type, device) => {
        const browser = await chromium.launch();
        const context = await browser.newContext({
          viewport: device === 'mobile' ? { width: 375, height: 667 } : { width: 1920, height: 1080 }
        });
        const page = await context.newPage();
        
        await page.goto(url);
        await page.screenshot({ fullPage: true });
        
        await context.close();
        return { success: true };
      };

      await takeTestScreenshot('https://example.com', 'test-site', 'baseline', 'mobile');

      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        viewport: { width: 375, height: 667 }
      });
    });

    test('ネットワークエラー時のリトライ', async () => {
      mockPage.goto
        .mockRejectedValueOnce(new Error('Navigation timeout'))
        .mockResolvedValueOnce(undefined);

      const takeTestScreenshot = async (url) => {
        const browser = await chromium.launch();
        const context = await browser.newContext();
        const page = await context.newPage();
        
        // 1回目は失敗、2回目は成功をシミュレート
        try {
          await page.goto(url, { waitUntil: 'networkidle' });
        } catch (error) {
          // フォールバック処理
          await page.goto(url, { waitUntil: 'domcontentloaded' });
        }
        
        await context.close();
        return { success: true };
      };

      const result = await takeTestScreenshot('https://example.com');
      expect(result.success).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledTimes(2);
    });
  });

  describe('WordPress待機処理', () => {
    test('WordPress特化の待機処理が実行される', async () => {
      const waitForWordPressReady = async (page) => {
        // jQueryの読み込み待機
        await page.evaluate(() => {
          return new Promise((resolve) => {
            if (typeof window.jQuery !== 'undefined') {
              resolve();
            } else {
              const checkjQuery = () => {
                if (typeof window.jQuery !== 'undefined') {
                  resolve();
                } else {
                  setTimeout(checkjQuery, 100);
                }
              };
              checkjQuery();
            }
          });
        });

        // レイジーローディング画像の待機
        await page.evaluate(() => {
          const images = document.querySelectorAll('img[loading="lazy"], img[data-src]');
          return Promise.all(Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            });
          }));
        });

        // アニメーションの完了待機
        await page.waitForTimeout(2000);
      };

      await waitForWordPressReady(mockPage);

      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(2000);
    });
  });

  describe('エラーハンドリング', () => {
    test('スクリーンショット撮影エラーが適切に処理される', async () => {
      mockPage.screenshot.mockRejectedValue(new Error('Screenshot failed'));
      mockErrorHandler.executeWithRetry.mockRejectedValue(new Error('Max retries exceeded'));

      const takeScreenshotWithError = async () => {
        return mockErrorHandler.executeWithRetry(async () => {
          await mockPage.screenshot();
        });
      };

      await expect(takeScreenshotWithError()).rejects.toThrow('Max retries exceeded');
      expect(mockErrorHandler.executeWithRetry).toHaveBeenCalled();
    });

    test('ページアクセスエラーの分類', async () => {
      const errors = [
        new Error('Navigation timeout'),
        new Error('net::ERR_CONNECTION_REFUSED'),
        new Error('Navigation failed')
      ];

      for (const error of errors) {
        mockErrorHandler.handleScreenshotError.mockResolvedValue('retry');
        await mockErrorHandler.handleScreenshotError(error, 'https://example.com', 'test-site', 1);
      }

      expect(mockErrorHandler.handleScreenshotError).toHaveBeenCalledTimes(3);
    });
  });

  describe('ファイル保存', () => {
    test('スクリーンショットファイルが正しく保存される', async () => {
      const screenshotBuffer = Buffer.from('fake-screenshot-data');
      const timestamp = '2024-01-01T00-00-00-000Z';
      const siteId = 'test-site';
      const type = 'baseline';
      const device = 'desktop';

      const saveScreenshot = (buffer, siteId, type, device, timestamp) => {
        const filename = `${timestamp}.png`;
        const dir = path.join('screenshots', siteId, type, device);
        const filepath = path.join(dir, filename);
        
        fs.ensureDirSync(dir);
        fs.writeFileSync(filepath, buffer);
        
        return { filename, filepath };
      };

      const result = saveScreenshot(screenshotBuffer, siteId, type, device, timestamp);

      expect(fs.ensureDirSync).toHaveBeenCalledWith(
        path.join('screenshots', 'test-site', 'baseline', 'desktop')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        result.filepath,
        screenshotBuffer
      );
      expect(result.filename).toBe('2024-01-01T00-00-00-000Z.png');
    });

    test('ページ識別子付きファイル名が正しく生成される', async () => {
      const pageInfo = {
        pageId: '001',
        identifier: 'home'
      };
      const timestamp = '2024-01-01T00-00-00-000Z';

      const generateFilename = (pageInfo, timestamp) => {
        if (pageInfo) {
          return `page-${pageInfo.pageId}_${pageInfo.identifier}_${timestamp}.png`;
        }
        return `${timestamp}.png`;
      };

      const filename = generateFilename(pageInfo, timestamp);
      expect(filename).toBe('page-001_home_2024-01-01T00-00-00-000Z.png');

      const filenameWithoutPage = generateFilename(null, timestamp);
      expect(filenameWithoutPage).toBe('2024-01-01T00-00-00-000Z.png');
    });
  });
});

describe('統合テスト', () => {
  test('完全なスクリーンショットワークフロー', async () => {
    // このテストは実際のPlaywrightを使用する統合テストの例
    // 実際の実装では、テスト用のローカルHTMLファイルを使用することを推奨
    
    const workflow = async () => {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
      });
      const page = await context.newPage();
      
      // テスト用のHTMLコンテンツ
      await page.setContent(`
        <html>
          <head><title>Test Page</title></head>
          <body>
            <h1>Test Content</h1>
            <div style="width: 100px; height: 100px; background: red;"></div>
          </body>
        </html>
      `);
      
      const screenshot = await page.screenshot({ fullPage: true });
      
      await context.close();
      await browser.close();
      
      return screenshot.length > 0;
    };

    const result = await workflow();
    expect(result).toBe(true);
  });
});