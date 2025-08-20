const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');
const fs = require('fs').promises;
const { Storage } = require('@google-cloud/storage');
const { Firestore } = require('@google-cloud/firestore');

const storage = new Storage();
const firestore = new Firestore();

/**
 * Compare screenshots for a site and generate diff images
 * @param {string} siteId - Site identifier
 * @param {string} date - Date string in YYYYMMDD format
 * @returns {Array} Array of comparison results
 */
async function compareSiteScreenshots(siteId, date) {
  const bucket = storage.bucket(process.env.DRIVE_ROOT);
  const baselinePrefix = `baseline/${date}/${siteId}/`;
  const afterPrefix = `after/${date}/${siteId}/`;
  const diffPrefix = `diff/${date}/${siteId}/`;
  
  console.log(`Starting comparison for site ${siteId} on ${date}`);
  
  try {
    const [baselineFiles] = await bucket.getFiles({ prefix: baselinePrefix });
    
    if (baselineFiles.length === 0) {
      throw new Error(`No baseline files found for ${siteId} on ${date}`);
    }
    
    const results = [];
    const diffThreshold = parseFloat(process.env.DIFF_THRESHOLD) || 2.0;
    
    for (const baselineFile of baselineFiles) {
      const url = decodeURIComponent(
        baselineFile.name.replace(baselinePrefix, '').replace('.png', '')
      );
      
      const afterPath = baselineFile.name.replace('baseline', 'after');
      const [afterExists] = await bucket.file(afterPath).exists();
      
      if (!afterExists) {
        console.log(`After file not found for ${url}, skipping`);
        results.push({
          url,
          baselinePath: baselineFile.name,
          afterPath: null,
          diffPath: null,
          diffPercent: null,
          status: 'MISSING_AFTER',
          error: 'After screenshot not found',
          timestamp: new Date()
        });
        continue;
      }
      
      try {
        console.log(`Comparing screenshots for: ${url}`);
        
        // Download both images
        const [baselineBuffer] = await baselineFile.download();
        const [afterBuffer] = await bucket.file(afterPath).download();
        
        // Parse PNG images
        const baseline = PNG.sync.read(baselineBuffer);
        const after = PNG.sync.read(afterBuffer);
        
        // Ensure images have the same dimensions
        const { width, height } = baseline;
        if (after.width !== width || after.height !== height) {
          console.log(`Dimension mismatch for ${url}: ${width}x${height} vs ${after.width}x${after.height}`);
          results.push({
            url,
            baselinePath: baselineFile.name,
            afterPath,
            diffPath: null,
            diffPercent: null,
            status: 'DIMENSION_MISMATCH',
            error: `Image dimensions don't match: ${width}x${height} vs ${after.width}x${after.height}`,
            timestamp: new Date()
          });
          continue;
        }
        
        // Create diff image
        const diff = new PNG({ width, height });
        
        // Compare images using pixelmatch
        const numDiffPixels = pixelmatch(
          baseline.data,
          after.data,
          diff.data,
          width,
          height,
          {
            threshold: 0.01, // より敏感に差分を検出 (0.1から0.01に変更)
            alpha: 0.5,
            includeAA: false, // アンチエイリアシングの差分を無視してより正確に
            diffColor: [255, 0, 0], // Red for differences
            aaColor: [255, 255, 0], // Yellow for anti-aliasing differences
            diffColorAlt: [0, 255, 0] // Green alternative
          }
        );
        
        const totalPixels = width * height;
        const diffPercent = (numDiffPixels / totalPixels) * 100;
        const status = diffPercent < diffThreshold ? 'OK' : 'NG';
        
        // Save diff image
        const diffPath = `${diffPrefix}${encodeURIComponent(url)}.png`;
        const diffBuffer = PNG.sync.write(diff);
        
        await bucket.file(diffPath).save(diffBuffer, {
          metadata: { 
            contentType: 'image/png',
            cacheControl: 'public, max-age=31536000',
            customMetadata: {
              'diff-percent': diffPercent.toString(),
              'status': status,
              'baseline-path': baselineFile.name,
              'after-path': afterPath
            }
          }
        });
        
        const result = {
          url,
          baselinePath: baselineFile.name,
          afterPath,
          diffPath,
          diffPercent: parseFloat(diffPercent.toFixed(3)),
          diffPixels: numDiffPixels,
          totalPixels,
          status,
          dimensions: { width, height },
          timestamp: new Date()
        };
        
        results.push(result);
        
        console.log(`Comparison complete for ${url}: ${diffPercent.toFixed(2)}% diff (${status})`);
        
      } catch (error) {
        console.error(`Error comparing ${url}:`, error);
        results.push({
          url,
          baselinePath: baselineFile.name,
          afterPath,
          diffPath: null,
          diffPercent: null,
          status: 'ERROR',
          error: error.message,
          timestamp: new Date()
        });
      }
    }
    
    // Save comparison results to Firestore
    const comparisonDoc = {
      siteId,
      date,
      results,
      totalUrls: results.length,
      okCount: results.filter(r => r.status === 'OK').length,
      ngCount: results.filter(r => r.status === 'NG').length,
      errorCount: results.filter(r => r.status === 'ERROR').length,
      missingCount: results.filter(r => r.status === 'MISSING_AFTER').length,
      averageDiffPercent: results
        .filter(r => r.diffPercent !== null)
        .reduce((sum, r) => sum + r.diffPercent, 0) / 
        results.filter(r => r.diffPercent !== null).length || 0,
      threshold: diffThreshold,
      timestamp: new Date()
    };
    
    await firestore.collection('comparisons').doc(`${siteId}_${date}`).set(comparisonDoc);
    
    console.log(`Comparison completed for ${siteId}: ${results.length} URLs processed, ${comparisonDoc.ngCount} NG detected`);
    
    return results;
    
  } catch (error) {
    console.error(`Failed to compare screenshots for ${siteId}:`, error);
    throw error;
  }
}

/**
 * Compare two specific screenshots
 * @param {string} baselinePath - Path to baseline image in GCS
 * @param {string} afterPath - Path to after image in GCS
 * @param {Object} options - Comparison options
 * @returns {Object} Comparison result
 */
async function compareImages(baselinePath, afterPath, options = {}) {
  const {
    threshold = 0.1,
    alpha = 0.5,
    diffThreshold = 2.0
  } = options;
  
  const bucket = storage.bucket(process.env.DRIVE_ROOT);
  
  try {
    // Download images
    const [baselineBuffer] = await bucket.file(baselinePath).download();
    const [afterBuffer] = await bucket.file(afterPath).download();
    
    // Parse images
    const baseline = PNG.sync.read(baselineBuffer);
    const after = PNG.sync.read(afterBuffer);
    
    // Check dimensions
    if (baseline.width !== after.width || baseline.height !== after.height) {
      throw new Error(`Image dimensions don't match: ${baseline.width}x${baseline.height} vs ${after.width}x${after.height}`);
    }
    
    const { width, height } = baseline;
    const diff = new PNG({ width, height });
    
    // Compare
    const numDiffPixels = pixelmatch(
      baseline.data,
      after.data,
      diff.data,
      width,
      height,
      { 
        threshold: threshold || 0.01, // デフォルトを0.01に変更
        alpha,
        includeAA: false
      }
    );
    
    const totalPixels = width * height;
    const diffPercent = (numDiffPixels / totalPixels) * 100;
    
    return {
      diffPercent: parseFloat(diffPercent.toFixed(3)),
      diffPixels: numDiffPixels,
      totalPixels,
      status: diffPercent < diffThreshold ? 'OK' : 'NG',
      dimensions: { width, height },
      diffImage: PNG.sync.write(diff)
    };
    
  } catch (error) {
    throw new Error(`Image comparison failed: ${error.message}`);
  }
}

/**
 * Generate diff summary report
 * @param {string} siteId - Site identifier
 * @param {string} date - Date string
 * @returns {Object} Summary report
 */
async function generateDiffReport(siteId, date) {
  try {
    const comparisonDoc = await firestore.collection('comparisons').doc(`${siteId}_${date}`).get();
    
    if (!comparisonDoc.exists) {
      throw new Error(`Comparison not found for ${siteId} on ${date}`);
    }
    
    const data = comparisonDoc.data();
    const results = data.results || [];
    
    // Group results by status
    const summary = {
      siteId,
      date,
      totalUrls: data.totalUrls,
      okCount: data.okCount,
      ngCount: data.ngCount,
      errorCount: data.errorCount,
      missingCount: data.missingCount,
      averageDiffPercent: data.averageDiffPercent,
      threshold: data.threshold,
      ngUrls: results.filter(r => r.status === 'NG').map(r => ({
        url: r.url,
        diffPercent: r.diffPercent,
        diffPath: r.diffPath
      })),
      errorUrls: results.filter(r => r.status === 'ERROR').map(r => ({
        url: r.url,
        error: r.error
      })),
      timestamp: data.timestamp
    };
    
    return summary;
    
  } catch (error) {
    throw new Error(`Failed to generate diff report: ${error.message}`);
  }
}

/**
 * Compare all screenshots for a site (wrapper for batch processor)
 * @param {string} siteId - Site identifier
 * @returns {Array} Array of comparison results
 */
async function compareAllScreenshots(siteId) {
  // Get today's date in YYYYMMDD format
  const today = new Date();
  const date = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
  
  console.log(`Running compareAllScreenshots for site ${siteId} on ${date}`);
  
  return await compareSiteScreenshots(siteId, date);
}

module.exports = {
  compareSiteScreenshots,
  compareImages,
  generateDiffReport,
  compareAllScreenshots
};