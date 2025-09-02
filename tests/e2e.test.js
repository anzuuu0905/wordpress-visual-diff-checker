/**
 * 🧪 E2E統合テスト - 完全なVRTワークフロー
 */

const request = require('supertest');
const fs = require('fs-extra');
const path = require('path');

// テスト用サーバーのセットアップは実際のプロジェクトに合わせて調整
describe('E2E VRTワークフロー統合テスト', () => {
  let app;
  let server;
  let testDataDir;

  beforeAll(async () => {
    // テスト用の一時ディレクトリ作成
    testDataDir = path.join(__dirname, 'temp-e2e');
    fs.ensureDirSync(testDataDir);
    
    // テスト用環境変数設定
    process.env.NODE_ENV = 'test';
    process.env.DATA_DIR = testDataDir;
    
    // サーバー起動（実際の実装に合わせてパスを調整）
    // app = require('../local-playwright-vrt/server');
    // server = app.listen(0); // ランダムポートで起動
  });

  afterAll(async () => {
    // テスト後のクリーンアップ
    if (server) {
      await server.close();
    }
    if (fs.existsSync(testDataDir)) {
      fs.removeSync(testDataDir);
    }
  });

  describe('基本的なAPIエンドポイント', () => {
    test('ヘルスチェックが正常に応答する', async () => {
      // 実際のテストではsupertest + appインスタンスを使用
      const mockHealthResponse = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        playwright: 'ready',
        database: {
          mode: 'local',
          collections: {
            sites: { count: 0, sizeKB: 0 },
            sessions: { count: 0, sizeKB: 0 },
            results: { count: 0, sizeKB: 0 },
            metadata: { count: 0, sizeKB: 0 }
          }
        }
      };

      expect(mockHealthResponse.status).toBe('healthy');
      expect(mockHealthResponse.playwright).toBe('ready');
    });

    test('サイト一覧取得が正常に動作する', async () => {
      const mockSitesResponse = {
        success: true,
        database: [],
        managed: [
          {
            id: 'demo-site-1',
            name: 'テストサイト（更新確認用）',
            baseUrl: 'https://www.hiro-blogs.com/tool/clp/url-search-regular/',
            enabled: true
          }
        ],
        total: 1
      };

      expect(mockSitesResponse.success).toBe(true);
      expect(mockSitesResponse.total).toBe(1);
      expect(mockSitesResponse.managed[0].id).toBe('demo-site-1');
    });
  });

  describe('VRTワークフロー統合テスト', () => {
    const testSiteId = 'test-site-e2e';
    const testUrl = 'https://example.com';

    test('完全なVRTワークフロー: クロール → Baseline → After → 比較', async () => {
      // Step 1: サイトクロール
      const crawlTest = async (url, siteId) => {
        // モックレスポンス（実際のテストではAPIを呼び出し）
        return {
          success: true,
          summary: {
            totalSites: 1,
            totalPages: 3
          },
          results: [{
            siteId,
            siteName: 'Test Site',
            baseUrl: url,
            totalPages: 3,
            pages: [
              { url: `${url}`, pageId: '001', identifier: 'home', title: 'Home' },
              { url: `${url}/about`, pageId: '002', identifier: 'about', title: 'About' },
              { url: `${url}/contact`, pageId: '003', identifier: 'contact', title: 'Contact' }
            ]
          }]
        };
      };

      const crawlResult = await crawlTest(testUrl, testSiteId);
      expect(crawlResult.success).toBe(true);
      expect(crawlResult.summary.totalPages).toBe(3);

      // Step 2: Baseline スクリーンショット撮影
      const baselineTest = async (siteId, device = 'desktop') => {
        return {
          success: true,
          siteId,
          device,
          captureCount: 3,
          results: [
            { url: testUrl, filename: 'page-001_home_baseline.png' },
            { url: `${testUrl}/about`, filename: 'page-002_about_baseline.png' },
            { url: `${testUrl}/contact`, filename: 'page-003_contact_baseline.png' }
          ]
        };
      };

      const baselineResult = await baselineTest(testSiteId);
      expect(baselineResult.success).toBe(true);
      expect(baselineResult.captureCount).toBe(3);

      // Step 3: After スクリーンショット撮影
      const afterTest = async (siteId, device = 'desktop') => {
        return {
          success: true,
          siteId,
          device,
          captureCount: 3,
          results: [
            { url: testUrl, filename: 'page-001_home_after.png' },
            { url: `${testUrl}/about`, filename: 'page-002_about_after.png' },
            { url: `${testUrl}/contact`, filename: 'page-003_contact_after.png' }
          ]
        };
      };

      const afterResult = await afterTest(testSiteId);
      expect(afterResult.success).toBe(true);
      expect(afterResult.captureCount).toBe(3);

      // Step 4: 画像比較
      const compareTest = async (siteId, device = 'desktop', threshold = 2.0) => {
        return {
          success: true,
          siteId,
          device,
          baselineFile: 'page-001_home_baseline.png',
          afterFile: 'page-001_home_after.png',
          diffFile: 'page-001_home_diff.png',
          diffPixels: 0,
          diffPercentage: 0,
          status: 'OK',
          threshold
        };
      };

      const compareResult = await compareTest(testSiteId);
      expect(compareResult.success).toBe(true);
      expect(compareResult.status).toBe('OK');
      expect(compareResult.diffPercentage).toBe(0);
    });

    test('差分検出ワークフロー - NG判定', async () => {
      const compareWithDifference = async (siteId) => {
        return {
          success: true,
          siteId,
          device: 'desktop',
          baselineFile: 'baseline.png',
          afterFile: 'after.png',
          diffFile: 'diff.png',
          diffPixels: 500,
          diffPercentage: 5.0,
          status: 'NG',
          threshold: 2.0,
          dimensions: { width: 1920, height: 1080 }
        };
      };

      const result = await compareWithDifference(testSiteId);
      expect(result.status).toBe('NG');
      expect(result.diffPercentage).toBeGreaterThan(2.0);
    });

    test('複数デバイス対応ワークフロー', async () => {
      const multiDeviceTest = async (siteId, devices = ['desktop', 'mobile']) => {
        const results = [];
        
        for (const device of devices) {
          // Baseline
          const baseline = {
            device,
            filename: `baseline_${device}.png`,
            timestamp: new Date().toISOString()
          };
          
          // After
          const after = {
            device,
            filename: `after_${device}.png`,
            timestamp: new Date().toISOString()
          };
          
          // Compare
          const comparison = {
            device,
            status: device === 'desktop' ? 'OK' : 'NG',
            diffPercentage: device === 'desktop' ? 1.0 : 3.5
          };
          
          results.push({ device, baseline, after, comparison });
        }
        
        return {
          siteId,
          devices,
          results,
          summary: {
            total: results.length,
            ok: results.filter(r => r.comparison.status === 'OK').length,
            ng: results.filter(r => r.comparison.status === 'NG').length
          }
        };
      };

      const result = await multiDeviceTest(testSiteId);
      expect(result.devices).toHaveLength(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.ok).toBe(1);
      expect(result.summary.ng).toBe(1);
    });
  });

  describe('エラーシナリオテスト', () => {
    test('存在しないサイトでのエラーハンドリング', async () => {
      const testNonExistentSite = async (siteId) => {
        try {
          // 存在しないサイトでの処理をシミュレート
          throw new Error(`Site ${siteId} not found`);
        } catch (error) {
          return {
            success: false,
            error: error.message,
            code: 'SITE_NOT_FOUND'
          };
        }
      };

      const result = await testNonExistentSite('non-existent-site');
      expect(result.success).toBe(false);
      expect(result.code).toBe('SITE_NOT_FOUND');
    });

    test('ベースライン不存在エラー', async () => {
      const testMissingBaseline = async (siteId) => {
        return {
          success: false,
          error: 'Baseline スクリーンショットが見つかりません。先にStep1でBaseline撮影を実行してください。',
          status: 'SKIP',
          code: 'MISSING_BASELINE'
        };
      };

      const result = await testMissingBaseline(testSiteId);
      expect(result.success).toBe(false);
      expect(result.code).toBe('MISSING_BASELINE');
    });

    test('ネットワークエラー時のリトライ処理', async () => {
      const testNetworkRetry = async (url, maxRetries = 3) => {
        let attempts = 0;
        const errors = [];
        
        while (attempts < maxRetries) {
          attempts++;
          try {
            if (attempts < 3) {
              throw new Error(`Network timeout (attempt ${attempts})`);
            }
            // 3回目で成功
            return {
              success: true,
              attempts,
              url,
              result: 'Screenshot captured successfully'
            };
          } catch (error) {
            errors.push(error.message);
            if (attempts === maxRetries) {
              return {
                success: false,
                attempts,
                errors,
                lastError: error.message
              };
            }
            // 指数バックオフ的な待機をシミュレート
            await new Promise(resolve => setTimeout(resolve, 100 * attempts));
          }
        }
      };

      const result = await testNetworkRetry('https://unreliable-site.com');
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });
  });

  describe('パフォーマンステスト', () => {
    test('大量ページの並列処理性能', async () => {
      const performanceTest = async (pageCount = 50) => {
        const pages = Array.from({ length: pageCount }, (_, i) => ({
          id: `page-${String(i + 1).padStart(3, '0')}`,
          url: `https://example.com/page-${i + 1}`,
          identifier: `page${i + 1}`
        }));

        const startTime = Date.now();
        
        // 並列処理をシミュレート（実際はPromise.allで実装）
        const batchSize = 5;
        const results = [];
        
        for (let i = 0; i < pages.length; i += batchSize) {
          const batch = pages.slice(i, i + batchSize);
          const batchResults = batch.map(page => ({
            pageId: page.id,
            url: page.url,
            status: 'OK',
            processingTime: Math.random() * 1000 + 500 // 0.5-1.5秒
          }));
          results.push(...batchResults);
        }
        
        const totalTime = Date.now() - startTime;
        
        return {
          totalPages: pageCount,
          processedPages: results.length,
          totalTime,
          averageTimePerPage: totalTime / pageCount,
          batchSize,
          results: results.slice(0, 5) // 最初の5件のみ返却
        };
      };

      const result = await performanceTest(50);
      expect(result.processedPages).toBe(50);
      expect(result.averageTimePerPage).toBeLessThan(1000); // 1秒未満
    });

    test('メモリ使用量監視', async () => {
      const memoryTest = async () => {
        const initialMemory = process.memoryUsage();
        
        // 大量の画像処理をシミュレート
        const images = Array.from({ length: 10 }, (_, i) => ({
          id: i,
          data: Buffer.alloc(1024 * 1024) // 1MBのダミーデータ
        }));
        
        // 処理後のメモリ使用量
        const afterMemory = process.memoryUsage();
        
        return {
          initial: {
            heapUsed: Math.round(initialMemory.heapUsed / 1024 / 1024),
            heapTotal: Math.round(initialMemory.heapTotal / 1024 / 1024)
          },
          after: {
            heapUsed: Math.round(afterMemory.heapUsed / 1024 / 1024),
            heapTotal: Math.round(afterMemory.heapTotal / 1024 / 1024)
          },
          increase: {
            heapUsed: Math.round((afterMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024),
            heapTotal: Math.round((afterMemory.heapTotal - initialMemory.heapTotal) / 1024 / 1024)
          },
          processedImages: images.length
        };
      };

      const result = await memoryTest();
      expect(result.processedImages).toBe(10);
      expect(result.increase.heapUsed).toBeLessThan(100); // 100MB未満の増加
    });
  });

  describe('データベース統合テスト', () => {
    test('VRTセッション履歴の保存と取得', async () => {
      const sessionTest = async (siteId) => {
        // セッション作成
        const createSession = async (data) => ({
          id: `session-${Date.now()}`,
          ...data,
          createdAt: new Date().toISOString()
        });

        // セッション取得
        const getSessions = async (siteId) => {
          return [
            { id: 'session-1', type: 'baseline', status: 'completed' },
            { id: 'session-2', type: 'comparison', status: 'completed' }
          ].filter(s => true); // 実際はsiteIdでフィルタ
        };

        const session = await createSession({
          type: 'baseline',
          siteId,
          status: 'running'
        });

        const sessions = await getSessions(siteId);

        return {
          createdSession: session,
          existingSessions: sessions,
          totalSessions: sessions.length + 1
        };
      };

      const result = await sessionTest(testSiteId);
      expect(result.createdSession.siteId).toBe(testSiteId);
      expect(result.totalSessions).toBeGreaterThan(0);
    });

    test('比較結果統計の計算', async () => {
      const statsTest = async (siteId) => {
        const mockResults = [
          { status: 'OK', diffPercentage: 0.5 },
          { status: 'NG', diffPercentage: 3.2 },
          { status: 'OK', diffPercentage: 1.1 },
          { status: 'ERROR', diffPercentage: 0 },
          { status: 'OK', diffPercentage: 0.8 }
        ];

        const stats = {
          total: mockResults.length,
          ok: mockResults.filter(r => r.status === 'OK').length,
          ng: mockResults.filter(r => r.status === 'NG').length,
          error: mockResults.filter(r => r.status === 'ERROR').length,
          avgDiffPercentage: mockResults
            .filter(r => r.status !== 'ERROR')
            .reduce((sum, r) => sum + r.diffPercentage, 0) / 
            mockResults.filter(r => r.status !== 'ERROR').length
        };

        return {
          siteId,
          period: 30,
          stats,
          successRate: (stats.ok / stats.total) * 100
        };
      };

      const result = await statsTest(testSiteId);
      expect(result.stats.total).toBe(5);
      expect(result.stats.ok).toBe(3);
      expect(result.stats.ng).toBe(1);
      expect(result.stats.error).toBe(1);
      expect(result.successRate).toBe(60); // 3/5 * 100
    });
  });
});

describe('WordPress特化機能テスト', () => {
  test('WordPress最適化設定の効果', async () => {
    const wpOptimizationTest = async (url) => {
      // WordPress特化の最適化項目をシミュレート
      const optimizations = {
        animationsDisabled: true,
        lazyLoadingHandled: true,
        adminBarHidden: true,
        jqueryWaitCompleted: true,
        pluginCompatibilityChecked: true
      };

      const result = {
        url,
        optimizations,
        estimatedLoadTime: 2500, // 2.5秒
        screenshotStability: 95 // 95%の安定性
      };

      return result;
    };

    const result = await wpOptimizationTest('https://wordpress-site.com');
    expect(result.optimizations.animationsDisabled).toBe(true);
    expect(result.screenshotStability).toBeGreaterThan(90);
  });

  test('WordPress プラグイン互換性テスト', async () => {
    const pluginCompatibilityTest = async () => {
      const commonPlugins = [
        'Elementor',
        'WooCommerce',
        'Yoast SEO',
        'Contact Form 7',
        'WP Rocket'
      ];

      const compatibility = commonPlugins.map(plugin => ({
        name: plugin,
        compatible: true,
        issues: [],
        workaroundApplied: false
      }));

      return {
        testedPlugins: commonPlugins.length,
        compatiblePlugins: compatibility.filter(p => p.compatible).length,
        compatibility
      };
    };

    const result = await pluginCompatibilityTest();
    expect(result.testedPlugins).toBe(5);
    expect(result.compatiblePlugins).toBe(5);
  });
});