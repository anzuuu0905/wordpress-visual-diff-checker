const robotsParser = require('robots-parser');
const fetch = require('node-fetch');

/**
 * Check if a URL can be crawled according to robots.txt
 * @param {string} url - URL to check
 * @param {string} userAgent - User agent string (default: WordPress-Visual-Diff-Bot)
 * @returns {boolean} True if crawling is allowed
 */
async function canCrawl(url, userAgent = 'WordPress-Visual-Diff-Bot') {
  try {
    const urlObj = new URL(url);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
    
    // Cache robots.txt for performance
    if (robotsCache.has(urlObj.host)) {
      const robots = robotsCache.get(urlObj.host);
      if (robots === null) return true; // No robots.txt found
      return robots.isAllowed(url, userAgent);
    }
    
    console.log(`Fetching robots.txt from: ${robotsUrl}`);
    const response = await fetch(robotsUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': userAgent
      }
    });
    
    if (!response.ok) {
      console.log(`No robots.txt found for ${urlObj.host} (${response.status})`);
      robotsCache.set(urlObj.host, null);
      return true; // No robots.txt = allow crawling
    }
    
    const robotsText = await response.text();
    const robots = robotsParser(robotsUrl, robotsText);
    
    robotsCache.set(urlObj.host, robots);
    
    const allowed = robots.isAllowed(url, userAgent);
    console.log(`Robots.txt check for ${url}: ${allowed ? 'ALLOWED' : 'BLOCKED'}`);
    
    return allowed;
    
  } catch (error) {
    console.error(`Robots.txt check error for ${url}:`, error.message);
    // Default to allow on error to avoid blocking legitimate crawling
    return true;
  }
}

/**
 * Get crawl delay from robots.txt
 * @param {string} url - URL to check
 * @param {string} userAgent - User agent string
 * @returns {number} Crawl delay in milliseconds
 */
async function getCrawlDelay(url, userAgent = 'WordPress-Visual-Diff-Bot') {
  try {
    const urlObj = new URL(url);
    
    if (robotsCache.has(urlObj.host)) {
      const robots = robotsCache.get(urlObj.host);
      if (robots === null) return 1000; // Default 1 second delay
      
      const delay = robots.getCrawlDelay(userAgent);
      return (delay || 1) * 1000; // Convert to milliseconds, default 1 second
    }
    
    // If not cached, perform canCrawl check which will cache the robots.txt
    await canCrawl(url, userAgent);
    return getCrawlDelay(url, userAgent); // Recursive call with cached data
    
  } catch (error) {
    console.error(`Failed to get crawl delay for ${url}:`, error);
    return 1000; // Default 1 second delay
  }
}

/**
 * Get sitemap URLs from robots.txt
 * @param {string} url - Base URL to check
 * @returns {Array} Array of sitemap URLs
 */
async function getSitemaps(url) {
  try {
    const urlObj = new URL(url);
    
    if (robotsCache.has(urlObj.host)) {
      const robots = robotsCache.get(urlObj.host);
      if (robots === null) return [];
      
      return robots.getSitemaps() || [];
    }
    
    // If not cached, perform canCrawl check which will cache the robots.txt
    await canCrawl(url);
    return getSitemaps(url); // Recursive call with cached data
    
  } catch (error) {
    console.error(`Failed to get sitemaps for ${url}:`, error);
    return [];
  }
}

/**
 * Check if a specific path is allowed for crawling
 * @param {string} baseUrl - Base URL of the site
 * @param {string} path - Path to check (e.g., '/admin/', '/wp-admin/')
 * @param {string} userAgent - User agent string
 * @returns {boolean} True if path is allowed
 */
async function isPathAllowed(baseUrl, path, userAgent = 'WordPress-Visual-Diff-Bot') {
  try {
    const fullUrl = new URL(path, baseUrl).toString();
    return await canCrawl(fullUrl, userAgent);
  } catch (error) {
    console.error(`Failed to check path ${path} for ${baseUrl}:`, error);
    return true; // Default to allow
  }
}

/**
 * Clear the robots.txt cache
 */
function clearCache() {
  robotsCache.clear();
  console.log('Robots.txt cache cleared');
}

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
  return {
    size: robotsCache.size,
    hosts: Array.from(robotsCache.keys())
  };
}

// Cache for robots.txt content to avoid repeated requests
const robotsCache = new Map();

// Clear cache every hour to respect updates
setInterval(clearCache, 60 * 60 * 1000);

module.exports = {
  canCrawl,
  getCrawlDelay,
  getSitemaps,
  isPathAllowed,
  clearCache,
  getCacheStats
};