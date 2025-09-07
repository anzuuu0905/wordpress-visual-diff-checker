const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * WebP変換の実際の処理時間を測定
 * 実際のVRTで生成されたPNGファイルでベンチマーク
 */
async function benchmarkWebPConversion() {
  console.log('=== WebP変換時間ベンチマーク ===\n');
  
  // 実際のスクリーンショットディレクトリを確認
  const screenshotsDir = path.join(__dirname, 'screenshots');
  const testFiles = [];
  
  if (fs.existsSync(screenshotsDir)) {
    // 各サイトディレクトリを確認
    const siteDirs = fs.readdirSync(screenshotsDir);
    
    for (const siteDir of siteDirs) {
      const sitePath = path.join(screenshotsDir, siteDir);
      if (fs.statSync(sitePath).isDirectory()) {
        // baseline、after ディレクトリ内のPNGファイルをチェック
        const subDirs = ['baseline', 'after'];
        
        for (const subDir of subDirs) {
          const subDirPath = path.join(sitePath, subDir);
          if (fs.existsSync(subDirPath)) {
            const files = fs.readdirSync(subDirPath);
            for (const file of files) {
              if (file.endsWith('.png')) {
                const filePath = path.join(subDirPath, file);
                const stats = fs.statSync(filePath);
                testFiles.push({
                  path: filePath,
                  size: stats.size,
                  sizeMB: (stats.size / 1024 / 1024).toFixed(1),
                  site: siteDir,
                  type: subDir
                });
              }
            }
          }
        }
      }
    }
  }
  
  if (testFiles.length === 0) {
    console.log('テスト用のPNGファイルが見つかりません');
    return;
  }
  
  // サイズ順にソート（大きいファイルから）
  testFiles.sort((a, b) => b.size - a.size);
  
  console.log(`発見したPNGファイル: ${testFiles.length}個`);
  console.log('最大ファイル:', testFiles[0]);
  console.log('');
  
  // 異なるサイズのファイルでテスト
  const testTargets = [
    testFiles[0], // 最大
    testFiles[Math.floor(testFiles.length / 2)], // 中間
    testFiles[testFiles.length - 1] // 最小
  ].filter(Boolean);
  
  const results = [];
  
  for (const testFile of testTargets) {
    console.log(`=== ${testFile.site} (${testFile.sizeMB}MB) ===`);
    
    try {
      // 1. PNG読み込み時間
      const loadStart = Date.now();
      const inputBuffer = fs.readFileSync(testFile.path);
      const loadTime = Date.now() - loadStart;
      
      // 2. WebP変換時間（品質80）
      const convertStart = Date.now();
      const webpBuffer = await sharp(inputBuffer)
        .webp({ quality: 80 })
        .toBuffer();
      const convertTime = Date.now() - convertStart;
      
      // 3. WebP保存時間
      const outputPath = testFile.path.replace('.png', '_converted.webp');
      const saveStart = Date.now();
      fs.writeFileSync(outputPath, webpBuffer);
      const saveTime = Date.now() - saveStart;
      
      const webpSizeMB = (webpBuffer.length / 1024 / 1024).toFixed(1);
      const compressionRatio = ((1 - webpBuffer.length / testFile.size) * 100).toFixed(1);
      const totalTime = loadTime + convertTime + saveTime;
      
      console.log(`読み込み: ${loadTime}ms`);
      console.log(`変換: ${convertTime}ms`);
      console.log(`保存: ${saveTime}ms`);
      console.log(`合計: ${totalTime}ms`);
      console.log(`PNG: ${testFile.sizeMB}MB → WebP: ${webpSizeMB}MB (${compressionRatio}%削減)`);
      console.log('');
      
      results.push({
        size: testFile.size,
        sizeMB: testFile.sizeMB,
        totalTime,
        compressionRatio: parseFloat(compressionRatio),
        site: testFile.site
      });
      
      // 一時ファイル削除
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      
    } catch (error) {
      console.error(`エラー (${testFile.site}):`, error.message);
    }
  }
  
  // 結果分析
  console.log('=== 変換効果分析 ===');
  if (results.length > 0) {
    const avgTime = results.reduce((sum, r) => sum + r.totalTime, 0) / results.length;
    const avgCompression = results.reduce((sum, r) => sum + r.compressionRatio, 0) / results.length;
    
    console.log(`平均変換時間: ${avgTime.toFixed(1)}ms`);
    console.log(`平均圧縮率: ${avgCompression.toFixed(1)}%削減`);
    console.log(`20ページ変換予想時間: ${(avgTime * 20 / 1000).toFixed(1)}秒`);
    
    const conversionCostPercentage = (avgTime * 20 / (10 * 60 * 1000) * 100).toFixed(2);
    console.log(`全体処理時間(10分)に対する変換コスト: ${conversionCostPercentage}%`);
    
    // 結論
    console.log('\n=== 結論 ===');
    if (avgTime < 500) {
      console.log('✅ WebP変換は高速（0.5秒未満/ファイル）');
      console.log('✅ 圧縮効果が変換時間を大きく上回る');
      console.log('✅ 確実に導入すべき最適化');
    } else if (avgTime < 1000) {
      console.log('⚠️ WebP変換は中程度（0.5-1秒/ファイル）');
      console.log('⚠️ 圧縮効果と変換時間を天秤にかける必要');
    } else {
      console.log('❌ WebP変換に時間がかかる');
      console.log(`変換時間: ${(avgTime/1000).toFixed(1)}秒/ファイル`);
      console.log('❌ 他の最適化を優先すべき');
    }
  }
}

// Sharp性能テスト（実際のサイズで）
async function sharpPerformanceTest() {
  console.log('\n=== Sharp性能テスト（実画面サイズ）===');
  
  // 実際のページサイズでテスト
  const testSizes = [
    { width: 1280, height: 800, name: 'ノーマルページ' },
    { width: 1280, height: 3000, name: '長いページ' },
    { width: 1280, height: 8000, name: '超長いページ' }
  ];
  
  for (const size of testSizes) {
    console.log(`${size.name} (${size.width}x${size.height})`);
    
    const iterations = 3;
    let totalTime = 0;
    
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      
      try {
        await sharp({
          create: {
            width: size.width,
            height: size.height,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          }
        })
        .png()
        .webp({ quality: 80 })
        .toBuffer();
        
        const time = Date.now() - start;
        totalTime += time;
        
      } catch (error) {
        console.log(`テスト${i+1}でエラー: ${error.message}`);
      }
    }
    
    const averageTime = totalTime / iterations;
    console.log(`平均変換時間: ${averageTime.toFixed(1)}ms`);
  }
}

// メイン実行
async function main() {
  await benchmarkWebPConversion();
  await sharpPerformanceTest();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { benchmarkWebPConversion, sharpPerformanceTest };