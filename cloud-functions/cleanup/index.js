const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const { Firestore } = require('@google-cloud/firestore');

const storage = new Storage();
const firestore = new Firestore();

/**
 * Parse date string to Date object
 * @param {string} dateStr - Date string in YYYYMMDD format
 * @returns {Date} Parsed date
 */
function parseDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  
  const year = dateStr.substr(0, 4);
  const month = dateStr.substr(4, 2);
  const day = dateStr.substr(6, 2);
  
  return new Date(`${year}-${month}-${day}`);
}

/**
 * Get all unique date folders from GCS bucket
 * @param {Object} bucket - GCS bucket instance
 * @returns {Set} Set of unique date strings
 */
async function getDateFolders(bucket) {
  const [files] = await bucket.getFiles();
  const dates = new Set();
  
  for (const file of files) {
    const pathParts = file.name.split('/');
    if (pathParts.length >= 2) {
      const dateStr = pathParts[1];
      if (dateStr && dateStr.match(/^\d{8}$/)) {
        dates.add(dateStr);
      }
    }
  }
  
  return dates;
}

/**
 * Delete all files in a specific date folder
 * @param {Object} bucket - GCS bucket instance
 * @param {string} dateStr - Date string in YYYYMMDD format
 * @returns {number} Number of deleted files
 */
async function deleteDateFolder(bucket, dateStr) {
  const prefixes = [`baseline/${dateStr}/`, `after/${dateStr}/`, `diff/${dateStr}/`];
  let deletedCount = 0;
  
  for (const prefix of prefixes) {
    try {
      const [files] = await bucket.getFiles({ prefix });
      
      if (files.length === 0) {
        continue;
      }
      
      console.log(`Deleting ${files.length} files from ${prefix}`);
      
      // Delete files in batches to avoid overwhelming the API
      const batchSize = 100;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const deletePromises = batch.map(file => 
          file.delete().catch(error => {
            console.error(`Failed to delete ${file.name}:`, error);
            return null;
          })
        );
        
        const results = await Promise.all(deletePromises);
        deletedCount += results.filter(result => result !== null).length;
      }
      
    } catch (error) {
      console.error(`Error deleting files from ${prefix}:`, error);
    }
  }
  
  console.log(`Deleted ${deletedCount} files from date folder ${dateStr}`);
  return deletedCount;
}

/**
 * Clean up old Firestore documents
 * @param {Date} cutoffDate - Date before which documents should be deleted
 * @returns {number} Number of deleted documents
 */
async function cleanupFirestoreDocuments(cutoffDate) {
  let deletedCount = 0;
  
  try {
    // Clean up crawls collection
    const crawlsSnapshot = await firestore
      .collection('crawls')
      .where('timestamp', '<', cutoffDate)
      .get();
    
    if (!crawlsSnapshot.empty) {
      const crawlsBatch = firestore.batch();
      crawlsSnapshot.forEach(doc => crawlsBatch.delete(doc.ref));
      await crawlsBatch.commit();
      deletedCount += crawlsSnapshot.size;
      console.log(`Deleted ${crawlsSnapshot.size} crawl documents`);
    }
    
    // Clean up comparisons collection
    const comparisonsSnapshot = await firestore
      .collection('comparisons')
      .where('timestamp', '<', cutoffDate)
      .get();
    
    if (!comparisonsSnapshot.empty) {
      const comparisonsBatch = firestore.batch();
      comparisonsSnapshot.forEach(doc => comparisonsBatch.delete(doc.ref));
      await comparisonsBatch.commit();
      deletedCount += comparisonsSnapshot.size;
      console.log(`Deleted ${comparisonsSnapshot.size} comparison documents`);
    }
    
  } catch (error) {
    console.error('Error cleaning up Firestore documents:', error);
  }
  
  return deletedCount;
}

/**
 * Get storage usage statistics
 * @param {Object} bucket - GCS bucket instance
 * @returns {Object} Storage statistics
 */
async function getStorageStats(bucket) {
  try {
    const [files] = await bucket.getFiles();
    
    let totalSize = 0;
    let fileCount = 0;
    const typeStats = {
      baseline: { count: 0, size: 0 },
      after: { count: 0, size: 0 },
      diff: { count: 0, size: 0 }
    };
    
    for (const file of files) {
      const [metadata] = await file.getMetadata();
      const size = parseInt(metadata.size || 0);
      
      totalSize += size;
      fileCount++;
      
      if (file.name.startsWith('baseline/')) {
        typeStats.baseline.count++;
        typeStats.baseline.size += size;
      } else if (file.name.startsWith('after/')) {
        typeStats.after.count++;
        typeStats.after.size += size;
      } else if (file.name.startsWith('diff/')) {
        typeStats.diff.count++;
        typeStats.diff.size += size;
      }
    }
    
    return {
      totalFiles: fileCount,
      totalSize: totalSize,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      typeStats
    };
    
  } catch (error) {
    console.error('Error getting storage stats:', error);
    return null;
  }
}

/**
 * HTTP Cloud Function to cleanup old VRT data
 * Can be triggered by Cloud Scheduler
 */
functions.http('cleanupOldData', async (req, res) => {
  const startTime = Date.now();
  console.log('Starting cleanup process...');
  
  try {
    // Get retention period from environment or default to 90 days
    const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS) || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    console.log(`Cleaning data older than ${cutoffDate.toISOString()} (${retentionDays} days)`);
    
    const bucket = storage.bucket(process.env.DRIVE_ROOT);
    
    // Get storage stats before cleanup
    const statsBefore = await getStorageStats(bucket);
    
    // Get all date folders
    const dateFolders = await getDateFolders(bucket);
    console.log(`Found ${dateFolders.size} date folders`);
    
    // Identify old folders to delete
    const foldersToDelete = [];
    for (const dateStr of dateFolders) {
      try {
        const folderDate = parseDate(dateStr);
        if (folderDate < cutoffDate) {
          foldersToDelete.push(dateStr);
        }
      } catch (error) {
        console.error(`Invalid date folder: ${dateStr}`, error);
      }
    }
    
    console.log(`Found ${foldersToDelete.length} old folders to delete`);
    
    let totalDeletedFiles = 0;
    
    // Delete old folders
    for (const dateStr of foldersToDelete) {
      try {
        const deletedCount = await deleteDateFolder(bucket, dateStr);
        totalDeletedFiles += deletedCount;
      } catch (error) {
        console.error(`Failed to delete folder ${dateStr}:`, error);
      }
    }
    
    // Clean up Firestore documents
    const deletedDocuments = await cleanupFirestoreDocuments(cutoffDate);
    
    // Get storage stats after cleanup
    const statsAfter = await getStorageStats(bucket);
    
    const duration = Date.now() - startTime;
    const freedSpace = statsBefore && statsAfter ? 
      statsBefore.totalSizeMB - statsAfter.totalSizeMB : 0;
    
    const result = {
      success: true,
      duration: `${duration}ms`,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      foldersProcessed: foldersToDelete.length,
      filesDeleted: totalDeletedFiles,
      documentsDeleted: deletedDocuments,
      spaceFeedMB: freedSpace,
      statsBefore,
      statsAfter,
      timestamp: new Date().toISOString()
    };
    
    console.log('Cleanup completed:', JSON.stringify(result, null, 2));
    
    res.json(result);
    
  } catch (error) {
    console.error('Cleanup failed:', error);
    
    const result = {
      success: false,
      error: error.message,
      stack: error.stack,
      duration: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString()
    };
    
    res.status(500).json(result);
  }
});

// Export for testing
module.exports = {
  parseDate,
  getDateFolders,
  deleteDateFolder,
  cleanupFirestoreDocuments,
  getStorageStats
};