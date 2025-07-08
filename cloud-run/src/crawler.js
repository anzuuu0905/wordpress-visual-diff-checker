const url = require('url');
const robotsChecker = require('./robots-checker');

/**
 * Crawl website using BFS algorithm to discover internal links
 * @param {Object} browser - Puppeteer browser instance
 * @param {string} startUrl - Starting URL to crawl
 * @param {Object} options - Crawling options
 * @returns {Array} Array of discovered URLs
 */
async function crawl(browser, startUrl, options = {}) {
  const {
    maxUrls = 300,
    timeout = 30000,
    userAgent = 'WordPress-Visual-Diff-Bot/1.0'
  } = options;
  
  const visitedUrls = new Set();
  const discoveredUrls = new Set();
  const queue = [startUrl];
  const baseUrl = new URL(startUrl);
  const baseDomain = baseUrl.hostname;
  
  console.log(`Starting crawl of ${startUrl} (max: ${maxUrls} URLs)`);
  
  while (queue.length > 0 && discoveredUrls.size < maxUrls) {
    const currentUrl = queue.shift();
    
    if (visitedUrls.has(currentUrl)) {
      continue;
    }
    
    try {
      // Check robots.txt for each URL
      const canCrawl = await robotsChecker.canCrawl(currentUrl);
      if (!canCrawl) {
        console.log(`Skipping ${currentUrl} - blocked by robots.txt`);
        continue;
      }
      
      const page = await browser.newPage();
      await page.setUserAgent(userAgent);
      
      // Set viewport for consistent rendering
      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1
      });
      
      console.log(`Crawling: ${currentUrl}`);
      visitedUrls.add(currentUrl);
      discoveredUrls.add(currentUrl);
      
      await page.goto(currentUrl, {
        waitUntil: 'networkidle2',
        timeout: timeout
      });
      
      // Extract all internal links
      const links = await page.evaluate((baseDomain) => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors
          .map(anchor => {
            try {
              const href = anchor.href;
              const url = new URL(href, window.location.href);
              
              // Only return internal links from the same domain
              if (url.hostname === baseDomain) {
                // Remove fragment and query parameters for consistency
                url.hash = '';
                url.search = '';
                return url.toString();
              }
              return null;
            } catch (e) {
              return null;
            }
          })
          .filter(href => href !== null);
      }, baseDomain);
      
      // Add new links to queue
      for (const link of links) {
        if (!visitedUrls.has(link) && !queue.includes(link)) {
          queue.push(link);
        }
      }
      
      await page.close();
      
      // Add delay to be respectful to the server
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error crawling ${currentUrl}:`, error.message);
      // Still add the URL to discovered list even if crawling failed
      discoveredUrls.add(currentUrl);
    }
  }
  
  const finalUrls = Array.from(discoveredUrls);
  console.log(`Crawl completed: discovered ${finalUrls.length} URLs`);
  
  return finalUrls;
}

/**
 * Extract links from a single page without crawling
 * @param {Object} browser - Puppeteer browser instance  
 * @param {string} pageUrl - URL to extract links from
 * @returns {Array} Array of discovered URLs
 */
async function extractLinks(browser, pageUrl) {
  const page = await browser.newPage();
  
  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle2' });
    
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const baseUrl = new URL(window.location.href);
      
      return anchors
        .map(anchor => {
          try {
            const href = anchor.href;
            const url = new URL(href, window.location.href);
            
            if (url.hostname === baseUrl.hostname) {
              url.hash = '';
              url.search = '';
              return url.toString();
            }
            return null;
          } catch (e) {
            return null;
          }
        })
        .filter(href => href !== null);
    });
    
    return [...new Set(links)]; // Remove duplicates
    
  } finally {
    await page.close();
  }
}

module.exports = {
  crawl,
  extractLinks
};