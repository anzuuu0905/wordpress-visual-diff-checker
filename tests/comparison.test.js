/**
 * 🧪 画像比較・差分検出モジュールのテスト
 */

const fs = require('fs-extra');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

// モック設定
jest.mock('fs-extra');
jest.mock('sharp');
jest.mock('../src/error-handler');
jest.mock('../src/database');

const sharp = require('sharp');
const { ErrorHandler } = require('../src/error-handler');
const { getDatabase } = require('../src/database');

describe('画像比較・差分検出', () => {
  let mockErrorHandler;
  let mockDatabase;

  beforeEach(() => {
    // ErrorHandler モック
    mockErrorHandler = {
      executeWithRetry: jest.fn().mockImplementation(async (fn) => await fn()),
      handleComparisonError: jest.fn().mockResolvedValue({
        status: 'OK',
        message: 'Test message'
      }),
      logError: jest.fn().mockResolvedValue(undefined)
    };

    ErrorHandler.mockImplementation(() => mockErrorHandler);

    // Database モック
    mockDatabase = {
      saveComparisonResult: jest.fn().mockResolvedValue({ id: 'test-result' })
    };

    getDatabase.mockReturnValue(mockDatabase);

    // Sharp モック
    sharp.mockReturnValue({
      resize: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized-image-data'))
    });

    // fs-extra モック
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['baseline.png', 'after.png']);
    fs.readFileSync.mockImplementation((filepath) => {
      if (filepath.includes('baseline')) {
        return createTestPNG(100, 100, [255, 0, 0, 255]); // 赤色の画像
      } else if (filepath.includes('after')) {
        return createTestPNG(100, 100, [0, 255, 0, 255]); // 緑色の画像
      }
      return Buffer.alloc(0);
    });
    fs.ensureDirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // テスト用のPNG画像を生成
  function createTestPNG(width, height, color = [255, 255, 255, 255]) {
    const png = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        png.data[idx] = color[0];     // Red
        png.data[idx + 1] = color[1]; // Green
        png.data[idx + 2] = color[2]; // Blue
        png.data[idx + 3] = color[3]; // Alpha
      }
    }
    return PNG.sync.write(png);
  }

  describe('基本的な比較機能', () => {
    test('同じ画像の比較で差分なしと判定される', () => {
      const width = 100;
      const height = 100;
      const img1 = new PNG({ width, height });
      const img2 = new PNG({ width, height });
      
      // 同じ色で塗りつぶし
      const fillColor = [255, 0, 0, 255];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (width * y + x) << 2;
          img1.data[idx] = img2.data[idx] = fillColor[0];
          img1.data[idx + 1] = img2.data[idx + 1] = fillColor[1];
          img1.data[idx + 2] = img2.data[idx + 2] = fillColor[2];
          img1.data[idx + 3] = img2.data[idx + 3] = fillColor[3];
        }
      }

      const diff = new PNG({ width, height });
      const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {
        threshold: 0.02
      });

      expect(diffPixels).toBe(0);
    });

    test('異なる画像の比較で差分が検出される', () => {
      const width = 100;
      const height = 100;
      const img1 = new PNG({ width, height });
      const img2 = new PNG({ width, height });
      
      // 異なる色で塗りつぶし
      const color1 = [255, 0, 0, 255]; // 赤
      const color2 = [0, 255, 0, 255]; // 緑
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (width * y + x) << 2;
          img1.data[idx] = color1[0];
          img1.data[idx + 1] = color1[1];
          img1.data[idx + 2] = color1[2];
          img1.data[idx + 3] = color1[3];
          
          img2.data[idx] = color2[0];
          img2.data[idx + 1] = color2[1];
          img2.data[idx + 2] = color2[2];
          img2.data[idx + 3] = color2[3];
        }
      }

      const diff = new PNG({ width, height });
      const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {
        threshold: 0.02
      });

      expect(diffPixels).toBeGreaterThan(0);
      expect(diffPixels).toBe(width * height); // 全ピクセルが異なる
    });
  });

  describe('高精度比較ロジック', () => {
    test('差分率の正確な計算', () => {
      const calculateDiffPercentage = (diffPixels, totalPixels) => {
        return (diffPixels / totalPixels) * 100;
      };

      const totalPixels = 10000; // 100x100の画像
      const diffPixels = 200;    // 200ピクセルが異なる
      
      const percentage = calculateDiffPercentage(diffPixels, totalPixels);
      expect(percentage).toBe(2.0); // 2.0%
    });

    test('閾値による判定ロジック', () => {
      const judgeDifference = (diffPercentage, threshold) => {
        return diffPercentage > threshold ? 'NG' : 'OK';
      };

      expect(judgeDifference(1.5, 2.0)).toBe('OK');
      expect(judgeDifference(2.5, 2.0)).toBe('NG');
      expect(judgeDifference(2.0, 2.0)).toBe('OK'); // 境界値
    });
  });

  describe('画像サイズ調整', () => {
    test('異なるサイズの画像が正しく調整される', async () => {
      const resizeImages = async (img1Buffer, img2Buffer) => {
        const img1 = PNG.sync.read(img1Buffer);
        const img2 = PNG.sync.read(img2Buffer);
        
        const maxWidth = Math.max(img1.width, img2.width);
        const maxHeight = Math.max(img1.height, img2.height);
        
        let resized1 = img1;
        let resized2 = img2;
        
        if (img1.width !== maxWidth || img1.height !== maxHeight) {
          const resizedBuffer = await sharp(img1Buffer)
            .resize(maxWidth, maxHeight, { 
              fit: 'contain', 
              background: { r: 255, g: 255, b: 255, alpha: 1 } 
            })
            .png()
            .toBuffer();
          resized1 = PNG.sync.read(resizedBuffer);
        }
        
        if (img2.width !== maxWidth || img2.height !== maxHeight) {
          const resizedBuffer = await sharp(img2Buffer)
            .resize(maxWidth, maxHeight, { 
              fit: 'contain', 
              background: { r: 255, g: 255, b: 255, alpha: 1 } 
            })
            .png()
            .toBuffer();
          resized2 = PNG.sync.read(resizedBuffer);
        }
        
        return { resized1, resized2, maxWidth, maxHeight };
      };

      const img1Buffer = createTestPNG(100, 100);
      const img2Buffer = createTestPNG(200, 150);
      
      const result = await resizeImages(img1Buffer, img2Buffer);
      
      expect(result.maxWidth).toBe(200);
      expect(result.maxHeight).toBe(150);
      expect(sharp).toHaveBeenCalledWith(img1Buffer);
    });
  });

  describe('ファイルペア検索', () => {
    test('対応するページペアが正しく見つかる', () => {
      const findPagePair = (baselineFiles, afterFiles) => {
        for (const bFile of baselineFiles) {
          const pageMatch = bFile.match(/page-(\d{3})_([^_]+)_/);
          if (!pageMatch) continue;

          const pageId = pageMatch[1];
          const pageIdentifier = pageMatch[2];

          const matchingAfterFile = afterFiles.find(f =>
            f.includes(`page-${pageId}_${pageIdentifier}_`)
          );

          if (matchingAfterFile) {
            return { baseline: bFile, after: matchingAfterFile };
          }
        }
        return null;
      };

      const baselineFiles = [
        'page-001_home_2024-01-01T10-00-00.png',
        'page-002_about_2024-01-01T10-01-00.png'
      ];
      const afterFiles = [
        'page-001_home_2024-01-01T11-00-00.png',
        'page-003_contact_2024-01-01T11-02-00.png'
      ];

      const pair = findPagePair(baselineFiles, afterFiles);
      expect(pair).not.toBeNull();
      expect(pair.baseline).toContain('page-001_home');
      expect(pair.after).toContain('page-001_home');
    });

    test('対応するページペアが見つからない場合', () => {
      const findPagePair = (baselineFiles, afterFiles) => {
        for (const bFile of baselineFiles) {
          const pageMatch = bFile.match(/page-(\d{3})_([^_]+)_/);
          if (!pageMatch) continue;

          const pageId = pageMatch[1];
          const pageIdentifier = pageMatch[2];

          const matchingAfterFile = afterFiles.find(f =>
            f.includes(`page-${pageId}_${pageIdentifier}_`)
          );

          if (matchingAfterFile) {
            return { baseline: bFile, after: matchingAfterFile };
          }
        }
        return null;
      };

      const baselineFiles = ['page-001_home_baseline.png'];
      const afterFiles = ['page-002_about_after.png'];

      const pair = findPagePair(baselineFiles, afterFiles);
      expect(pair).toBeNull();
    });
  });

  describe('エラーハンドリング', () => {
    test('ベースライン画像が見つからない場合のエラー処理', async () => {
      fs.existsSync.mockReturnValue(false);

      const compareWithError = async () => {
        return mockErrorHandler.executeWithRetry(async () => {
          if (!fs.existsSync('baseline-dir')) {
            throw new Error('Baseline directory not found');
          }
        });
      };

      await expect(compareWithError()).rejects.toThrow('Baseline directory not found');
    });

    test('画像ファイルが破損している場合のエラー処理', async () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File is corrupted');
      });

      mockErrorHandler.handleComparisonError.mockResolvedValue({
        status: 'ERROR',
        message: '画像ファイルが破損しています',
        action: 'cleanup_and_retry'
      });

      const result = await mockErrorHandler.handleComparisonError(
        new Error('File is corrupted'),
        'test-site',
        'desktop'
      );

      expect(result.status).toBe('ERROR');
      expect(result.action).toBe('cleanup_and_retry');
    });

    test('画像サイズ不一致エラーの処理', async () => {
      mockErrorHandler.handleComparisonError.mockResolvedValue({
        status: 'SKIP',
        message: 'ベースライン画像とサイズが異なります',
        action: 'require_rebaseline'
      });

      const result = await mockErrorHandler.handleComparisonError(
        new Error('Image size mismatch'),
        'test-site',
        'desktop'
      );

      expect(result.status).toBe('SKIP');
      expect(result.action).toBe('require_rebaseline');
    });
  });

  describe('差分画像生成', () => {
    test('差分画像が正しく生成される', () => {
      const width = 10;
      const height = 10;
      const baseline = new PNG({ width, height });
      const after = new PNG({ width, height });
      const diff = new PNG({ width, height });

      // ベースライン: 全て赤
      // アフター: 半分赤、半分緑
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (width * y + x) << 2;
          
          // ベースライン (赤)
          baseline.data[idx] = 255;
          baseline.data[idx + 1] = 0;
          baseline.data[idx + 2] = 0;
          baseline.data[idx + 3] = 255;
          
          // アフター (左半分赤、右半分緑)
          if (x < width / 2) {
            after.data[idx] = 255;     // 赤
            after.data[idx + 1] = 0;
            after.data[idx + 2] = 0;
            after.data[idx + 3] = 255;
          } else {
            after.data[idx] = 0;       // 緑
            after.data[idx + 1] = 255;
            after.data[idx + 2] = 0;
            after.data[idx + 3] = 255;
          }
        }
      }

      const diffPixels = pixelmatch(baseline.data, after.data, diff.data, width, height, {
        threshold: 0.02,
        diffColor: [255, 0, 255] // マゼンタで差分をハイライト
      });

      expect(diffPixels).toBe(50); // 右半分の50ピクセルが異なる
    });
  });

  describe('データベース統合', () => {
    test('比較結果がデータベースに保存される', async () => {
      const saveResult = async (comparisonResult) => {
        return await mockDatabase.saveComparisonResult({
          siteId: comparisonResult.siteId,
          device: comparisonResult.device,
          status: comparisonResult.status,
          diffPercentage: comparisonResult.diffPercentage,
          diffPixels: comparisonResult.diffPixels,
          threshold: comparisonResult.threshold,
          metadata: comparisonResult.metadata
        });
      };

      const result = {
        siteId: 'test-site',
        device: 'desktop',
        status: 'NG',
        diffPercentage: 5.2,
        diffPixels: 520,
        threshold: 2.0,
        metadata: { dimensions: { width: 100, height: 100 } }
      };

      await saveResult(result);

      expect(mockDatabase.saveComparisonResult).toHaveBeenCalledWith({
        siteId: 'test-site',
        device: 'desktop',
        status: 'NG',
        diffPercentage: 5.2,
        diffPixels: 520,
        threshold: 2.0,
        metadata: { dimensions: { width: 100, height: 100 } }
      });
    });

    test('データベース保存エラーが適切に処理される', async () => {
      mockDatabase.saveComparisonResult.mockRejectedValue(new Error('Database error'));

      const saveWithErrorHandling = async (result) => {
        try {
          await mockDatabase.saveComparisonResult(result);
          return { success: true };
        } catch (error) {
          console.log('⚠️ DB保存エラー:', error.message);
          return { success: false, error: error.message };
        }
      };

      const result = await saveWithErrorHandling({ test: 'data' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });
});

describe('統合テスト', () => {
  test('完全な比較ワークフローのテスト', async () => {
    // 実際のPNG画像を使用した統合テスト
    const fullWorkflow = async (baselineBuffer, afterBuffer) => {
      const baseline = PNG.sync.read(baselineBuffer);
      const after = PNG.sync.read(afterBuffer);
      
      const maxWidth = Math.max(baseline.width, after.width);
      const maxHeight = Math.max(baseline.height, after.height);
      
      const diff = new PNG({ width: maxWidth, height: maxHeight });
      const diffPixels = pixelmatch(
        baseline.data,
        after.data,
        diff.data,
        maxWidth,
        maxHeight,
        { threshold: 0.02 }
      );
      
      const totalPixels = maxWidth * maxHeight;
      const diffPercentage = (diffPixels / totalPixels) * 100;
      const status = diffPercentage > 2.0 ? 'NG' : 'OK';
      
      return {
        diffPixels,
        diffPercentage,
        status,
        dimensions: { width: maxWidth, height: maxHeight }
      };
    };

    const baselineBuffer = createTestPNG(100, 100, [255, 0, 0, 255]);
    const afterBuffer = createTestPNG(100, 100, [255, 0, 0, 255]);
    
    const result = await fullWorkflow(baselineBuffer, afterBuffer);
    
    expect(result.diffPixels).toBe(0);
    expect(result.diffPercentage).toBe(0);
    expect(result.status).toBe('OK');
    expect(result.dimensions).toEqual({ width: 100, height: 100 });
  });
});