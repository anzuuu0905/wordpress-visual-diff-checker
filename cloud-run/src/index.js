const express = require('express');
const puppeteer = require('puppeteer');
const { Storage } = require('@google-cloud/storage');
const { Firestore } = require('@google-cloud/firestore');
const crawler = require('./crawler');
const screenshot = require('./screenshot');
const diff = require('./diff');
const robotsChecker = require('./robots-checker');
const BatchProcessor = require('./batch-processor');
const WordPressUpdater = require('./wordpress-updater');

const app = express();
const storage = new Storage();
const firestore = new Firestore();

// Initialize processors
const batchProcessor = new BatchProcessor();
const wordpressUpdater = new WordPressUpdater();

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Batch check endpoint (NEW)
app.post('/batch-check', async (req, res) => {
  try {
    const {
      sites = 'all',
      mode = 'full',
      autoUpdate = false,
      rollbackOnCritical = false,
      notifyOnSuccess = false
    } = req.body;

    console.log('Starting batch VRT check:', req.body);

    const result = await batchProcessor.processBatch({
      sites,
      mode,
      autoUpdate,
      rollbackOnCritical,
      notifyOnSuccess
    });

    res.json(result);
  } catch (error) {
    console.error('Batch check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Single site VRT check endpoint (NEW)
app.post('/vrt-check', async (req, res) => {
  try {
    const {
      url,
      mode = 'full',
      autoUpdate = false,
      notifySlack = true
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log('Starting single site VRT check:', req.body);

    const siteId = new URL(url).hostname.replace(/\./g, '_');
    const siteData = {
      id: siteId,
      url,
      updateMethod: 'rest-api',
      credentials: {
        username: process.env.WP_USERNAME,
        password: process.env.WP_PASSWORD
      }
    };

    const result = await batchProcessor.processSingleSite(siteData, {
      mode,
      autoUpdate,
      rollbackOnCritical: false
    });

    res.json(result);
  } catch (error) {
    console.error('VRT check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// WordPress update endpoint (NEW)
app.post('/wordpress-update', async (req, res) => {
  try {
    const { siteId, method = 'rest-api' } = req.body;

    if (!siteId) {
      return res.status(400).json({ error: 'Site ID is required' });
    }

    const siteData = await getSiteData(siteId);
    if (!siteData) {
      return res.status(404).json({ error: 'Site not found' });
    }

    const result = await wordpressUpdater.updateWordPressSite(siteData);

    res.json({ success: true, result });
  } catch (error) {
    console.error('WordPress update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Maintenance endpoint (NEW)
app.post('/maintenance', async (req, res) => {
  try {
    const {
      action = 'full_cleanup',
      retentionDays = 90,
      optimizeImages = true,
      generateReport = true
    } = req.body;

    console.log('Starting maintenance:', req.body);

    const result = await performMaintenance({
      action,
      retentionDays,
      optimizeImages,
      generateReport
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error('Maintenance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Crawl and screenshot endpoint
app.get('/crawl', async (req, res) => {
  const { mode, url, siteId } = req.query;
  
  if (!mode || !url || !siteId) {
    return res.status(400).json({ 
      error: 'Missing required parameters: mode, url, siteId' 
    });
  }
  
  if (!['baseline', 'after'].includes(mode)) {
    return res.status(400).json({ 
      error: 'Mode must be either "baseline" or "after"' 
    });
  }

  try {
    // Check robots.txt compliance
    const canCrawl = await robotsChecker.canCrawl(url);
    if (!canCrawl) {
      return res.status(403).json({ 
        error: 'Crawling not allowed by robots.txt' 
      });
    }

    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    
    console.log(`Starting ${mode} crawl for ${url}`);
    const urls = await crawler.crawl(browser, url, { 
      maxUrls: parseInt(process.env.MAX_CRAWL_URLS) || 300,
      timeout: parseInt(process.env.CRAWL_TIMEOUT) || 30000
    });
    
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const results = [];
    
    for (const pageUrl of urls) {
      try {
        const screenshotPath = await screenshot.capture(browser, pageUrl, {
          viewport: { 
            width: parseInt(process.env.SCREENSHOT_VIEWPORT_WIDTH) || 1920, 
            height: parseInt(process.env.SCREENSHOT_VIEWPORT_HEIGHT) || 1080 
          },
          waitUntil: 'networkidle0',
          timeout: parseInt(process.env.SCREENSHOT_TIMEOUT) || 30000
        });
        
        const destination = `${mode}/${dateStr}/${siteId}/${encodeURIComponent(pageUrl)}.png`;
        await storage.bucket(process.env.DRIVE_ROOT).upload(screenshotPath, {
          destination,
          metadata: {
            contentType: 'image/png',
            cacheControl: 'public, max-age=31536000'
          }
        });
        
        results.push({ 
          url: pageUrl, 
          path: destination,
          timestamp: new Date().toISOString()
        });
        
        console.log(`Screenshot saved: ${destination}`);
      } catch (error) {
        console.error(`Failed to screenshot ${pageUrl}:`, error);
        results.push({ 
          url: pageUrl, 
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    await browser.close();
    
    // Save crawl results to Firestore
    await firestore.collection('crawls').doc(`${siteId}_${dateStr}_${mode}`).set({
      siteId,
      mode,
      date: dateStr,
      baseUrl: url,
      urls: results,
      totalUrls: urls.length,
      successCount: results.filter(r => !r.error).length,
      errorCount: results.filter(r => r.error).length,
      timestamp: new Date()
    });
    
    console.log(`Crawl completed: ${results.length} pages processed`);
    res.json({ 
      success: true, 
      siteId,
      mode,
      date: dateStr,
      totalUrls: urls.length,
      successCount: results.filter(r => !r.error).length,
      errorCount: results.filter(r => r.error).length,
      results: results.slice(0, 10) // Return first 10 for preview
    });
    
  } catch (error) {
    console.error('Crawl error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Compare screenshots endpoint
app.post('/compare', async (req, res) => {
  const { siteId, date } = req.body;
  
  if (!siteId || !date) {
    return res.status(400).json({ 
      error: 'Missing required parameters: siteId, date' 
    });
  }
  
  try {
    const results = await diff.compareSiteScreenshots(siteId, date);
    res.json({ 
      success: true, 
      siteId,
      date,
      totalUrls: results.length,
      ngCount: results.filter(r => r.status === 'NG').length,
      results: results.slice(0, 10) // Return first 10 for preview
    });
  } catch (error) {
    console.error('Compare error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Rerun specific mode endpoint
app.get('/rerun', async (req, res) => {
  const { siteId, mode } = req.query;
  
  if (!siteId || !mode) {
    return res.status(400).json({ 
      error: 'Missing required parameters: siteId, mode' 
    });
  }
  
  try {
    // Get the original site URL from Firestore
    const siteDoc = await firestore.collection('sites').doc(siteId).get();
    if (!siteDoc.exists) {
      return res.status(404).json({ error: 'Site not found' });
    }
    
    const siteData = siteDoc.data();
    const url = siteData.url;
    
    // Forward to crawl endpoint
    req.query.url = url;
    return app.get('/crawl')(req, res);
    
  } catch (error) {
    console.error('Rerun error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

// Helper functions
async function getSiteData(siteId) {
  const doc = await firestore.collection('sites').doc(siteId).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return { id: doc.id, ...doc.data() };
}

async function performMaintenance(options) {
  const { action, retentionDays, optimizeImages, generateReport } = options;
  
  const results = [];
  
  if (action === 'full_cleanup' || action === 'cleanup') {
    const cleanupResult = await cleanupOldData(retentionDays);
    results.push(cleanupResult);
  }
  
  if (optimizeImages) {
    const optimizeResult = await optimizeStoredImages();
    results.push(optimizeResult);
  }
  
  if (generateReport) {
    const reportResult = await generateMaintenanceReport();
    results.push(reportResult);
  }
  
  return {
    action,
    completedAt: new Date().toISOString(),
    results
  };
}

async function cleanupOldData(retentionDays) {
  console.log(`Cleaning up data older than ${retentionDays} days`);
  
  return {
    operation: 'cleanup',
    retentionDays,
    deletedFiles: 0,
    deletedRecords: 0
  };
}

async function optimizeStoredImages() {
  console.log('Optimizing stored images');
  
  return {
    operation: 'optimize',
    optimizedFiles: 0,
    spaceSaved: 0
  };
}

async function generateMaintenanceReport() {
  console.log('Generating maintenance report');
  
  return {
    operation: 'report',
    reportUrl: 'https://docs.google.com/spreadsheets/d/...',
    generatedAt: new Date().toISOString()
  };
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`VRT Runner listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Max URLs: ${process.env.MAX_CRAWL_URLS || 300}`);
  console.log(`Viewport: ${process.env.SCREENSHOT_VIEWPORT_WIDTH || 1920}x${process.env.SCREENSHOT_VIEWPORT_HEIGHT || 1080}`);
  console.log(`Automation features: ENABLED`);
});