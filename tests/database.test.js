/**
 * 🧪 データベースシステムのテスト
 */

const { VRTDatabase, getDatabase } = require('../src/database');
const fs = require('fs-extra');
const path = require('path');

describe('VRTDatabase', () => {
  let database;
  let testDataDir;

  beforeEach(() => {
    // テスト用の一時ディレクトリ
    testDataDir = path.join(__dirname, 'temp-db');
    fs.ensureDirSync(testDataDir);
    
    database = new VRTDatabase({
      mode: 'local',
      dataDir: testDataDir
    });
  });

  afterEach(() => {
    // テスト後のクリーンアップ
    if (fs.existsSync(testDataDir)) {
      fs.removeSync(testDataDir);
    }
  });

  describe('初期化', () => {
    test('ローカルDBファイルが正しく作成される', () => {
      const expectedFiles = ['sites.json', 'sessions.json', 'results.json', 'metadata.json'];
      expectedFiles.forEach(file => {
        expect(fs.existsSync(path.join(testDataDir, file))).toBe(true);
      });
    });

    test('初期DBファイルは空配列を含む', () => {
      const sitesData = fs.readFileSync(path.join(testDataDir, 'sites.json'), 'utf8');
      expect(JSON.parse(sitesData)).toEqual([]);
    });
  });

  describe('サイト設定管理', () => {
    test('サイト設定を保存できる', async () => {
      const config = {
        name: 'テストサイト',
        baseUrl: 'https://example.com',
        enabled: true
      };

      const result = await database.saveSiteConfig('test-site', config);
      expect(result.id).toBe('test-site');
      expect(result.name).toBe('テストサイト');
      expect(result.updatedAt).toBeDefined();
    });

    test('保存したサイト設定を取得できる', async () => {
      const config = {
        name: 'テストサイト',
        baseUrl: 'https://example.com'
      };

      await database.saveSiteConfig('test-site', config);
      const retrieved = await database.getSiteConfig('test-site');
      
      expect(retrieved.name).toBe('テストサイト');
      expect(retrieved.baseUrl).toBe('https://example.com');
    });

    test('存在しないサイト設定はnullを返す', async () => {
      const result = await database.getSiteConfig('non-existent');
      expect(result).toBeNull();
    });

    test('全サイト設定を取得できる', async () => {
      await database.saveSiteConfig('site1', { name: 'Site 1' });
      await database.saveSiteConfig('site2', { name: 'Site 2' });
      
      const allSites = await database.getAllSiteConfigs();
      expect(allSites).toHaveLength(2);
      expect(allSites.map(s => s.name)).toEqual(['Site 1', 'Site 2']);
    });
  });

  describe('VRTセッション管理', () => {
    test('VRTセッションを保存できる', async () => {
      const sessionData = {
        type: 'baseline',
        siteId: 'test-site',
        device: 'desktop',
        urls: ['https://example.com'],
        status: 'running'
      };

      const result = await database.saveVRTSession(sessionData);
      expect(result.id).toBeDefined();
      expect(result.type).toBe('baseline');
      expect(result.createdAt).toBeDefined();
    });

    test('保存したセッションを取得できる', async () => {
      const sessionData = {
        id: 'test-session',
        type: 'comparison',
        siteId: 'test-site',
        status: 'completed'
      };

      await database.saveVRTSession(sessionData);
      const retrieved = await database.getVRTSession('test-session');
      
      expect(retrieved.id).toBe('test-session');
      expect(retrieved.type).toBe('comparison');
      expect(retrieved.status).toBe('completed');
    });

    test('サイト別セッション履歴を取得できる', async () => {
      const sessions = [
        { siteId: 'site1', type: 'baseline' },
        { siteId: 'site1', type: 'comparison' },
        { siteId: 'site2', type: 'baseline' }
      ];

      for (const session of sessions) {
        await database.saveVRTSession(session);
      }

      const site1History = await database.getSiteVRTHistory('site1');
      expect(site1History).toHaveLength(2);
      expect(site1History.every(s => s.siteId === 'site1')).toBe(true);
    });
  });

  describe('比較結果管理', () => {
    test('比較結果を保存できる', async () => {
      const resultData = {
        siteId: 'test-site',
        device: 'desktop',
        status: 'NG',
        diffPercentage: 5.2,
        diffPixels: 1024,
        threshold: 2.0,
        baselineFile: 'baseline.png',
        afterFile: 'after.png',
        diffFile: 'diff.png'
      };

      const result = await database.saveComparisonResult(resultData);
      expect(result.id).toBeDefined();
      expect(result.status).toBe('NG');
      expect(result.diffPercentage).toBe(5.2);
      expect(result.createdAt).toBeDefined();
    });

    test('比較統計を取得できる', async () => {
      const results = [
        { siteId: 'test-site', status: 'OK', diffPercentage: 1.0 },
        { siteId: 'test-site', status: 'NG', diffPercentage: 3.0 },
        { siteId: 'test-site', status: 'OK', diffPercentage: 0.5 }
      ];

      for (const result of results) {
        await database.saveComparisonResult(result);
      }

      const stats = await database.getComparisonStats('test-site');
      expect(stats.total).toBe(3);
      expect(stats.ok).toBe(2);
      expect(stats.ng).toBe(1);
      expect(stats.avgDiffPercentage).toBe(1.5); // (1.0 + 3.0 + 0.5) / 3
    });
  });

  describe('メタデータ管理', () => {
    test('メタデータを保存・取得できる', async () => {
      const data = { version: '1.0.0', config: { theme: 'dark' } };
      
      await database.saveMetadata('app-config', data);
      const retrieved = await database.getMetadata('app-config');
      
      expect(retrieved).toEqual(data);
    });

    test('存在しないメタデータはnullを返す', async () => {
      const result = await database.getMetadata('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('クリーンアップ機能', () => {
    test('古いデータを削除できる', async () => {
      // 古い日付のデータを作成
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);

      // セッションファイルを直接編集して古いデータを追加
      const sessionsPath = path.join(testDataDir, 'sessions.json');
      const oldSession = {
        id: 'old-session',
        createdAt: oldDate.toISOString()
      };
      fs.writeFileSync(sessionsPath, JSON.stringify([oldSession], null, 2));

      // 新しいセッションを追加
      await database.saveVRTSession({
        id: 'new-session',
        siteId: 'test'
      });

      // クリーンアップ実行
      const result = await database.cleanup(50);
      expect(result.deletedSessions).toBe(1);

      // 新しいセッションのみ残っているか確認
      const remainingSessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0].id).toBe('new-session');
    });
  });

  describe('統計情報', () => {
    test('データベース統計を取得できる', async () => {
      await database.saveSiteConfig('site1', { name: 'Site 1' });
      await database.saveVRTSession({ siteId: 'site1' });
      
      const stats = await database.getStats();
      
      expect(stats.mode).toBe('local');
      expect(stats.collections.sites.count).toBe(1);
      expect(stats.collections.sessions.count).toBe(1);
      expect(stats.totalSizeKB).toBeGreaterThan(0);
    });
  });
});

describe('getDatabase シングルトン', () => {
  test('同じインスタンスを返す', () => {
    const db1 = getDatabase();
    const db2 = getDatabase();
    expect(db1).toBe(db2);
  });
});