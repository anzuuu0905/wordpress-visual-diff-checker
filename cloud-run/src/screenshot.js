const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Capture screenshot of a webpage
 * @param {Object} browser - Puppeteer browser instance
 * @param {string} url - URL to capture
 * @param {Object} options - Screenshot options
 * @returns {string} Path to the captured screenshot
 */
async function capture(browser, url, options = {}) {
  const {
    viewport = { width: 1920, height: 1080 },
    waitUntil = 'networkidle0',
    timeout = 30000,
    fullPage = true,
    quality = 90
  } = options;
  
  const page = await browser.newPage();
  
  try {
    // Set viewport
    await page.setViewport({
      ...viewport,
      deviceScaleFactor: 1
    });
    
    // Set user agent
    await page.setUserAgent('WordPress-Visual-Diff-Bot/1.0 (Compatible; Screenshot Generator)');
    
    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['font', 'stylesheet'].includes(resourceType)) {
        // Allow fonts and stylesheets for visual accuracy
        request.continue();
      } else if (['image', 'media'].includes(resourceType)) {
        // Block images and media to focus on layout
        const url = request.url();
        if (url.includes('logo') || url.includes('icon') || url.includes('avatar')) {
          request.continue(); // Allow important images
        } else {
          request.abort();
        }
      } else {
        request.continue();
      }
    });
    
    console.log(`Capturing screenshot: ${url}`);
    
    // Navigate to page
    await page.goto(url, {
      waitUntil: waitUntil,
      timeout: timeout
    });
    
    // Wait for any lazy-loaded content
    await page.waitForTimeout(2000);
    
    // Hide scrollbars and other dynamic elements
    await page.addStyleTag({
      content: `
        * {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        *::-webkit-scrollbar {
          display: none !important;
        }
        .cookie-banner,
        .gdpr-banner,
        .notification-bar,
        [id*="cookie"],
        [class*="cookie"],
        [id*="notification"],
        [class*="notification"] {
          display: none !important;
        }
      `
    });
    
    // Remove dynamic timestamps and date elements
    await page.evaluate(() => {
      const timeElements = document.querySelectorAll(
        '[class*="time"], [class*="date"], [id*="time"], [id*="date"], time'
      );
      timeElements.forEach(el => {
        if (el.textContent && el.textContent.match(/\d{4}[-\/]\d{2}[-\/]\d{2}|\d{2}:\d{2}/)) {
          el.textContent = 'TIMESTAMP_PLACEHOLDER';
        }
      });
    });
    
    // Create temporary file
    const tempDir = os.tmpdir();
    const fileName = `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
    const filePath = path.join(tempDir, fileName);
    
    // Take screenshot
    await page.screenshot({
      path: filePath,
      fullPage: fullPage,
      type: 'png',
      quality: quality
    });
    
    console.log(`Screenshot saved: ${filePath}`);
    return filePath;
    
  } catch (error) {
    console.error(`Failed to capture screenshot for ${url}:`, error);
    throw new Error(`Screenshot capture failed: ${error.message}`);
  } finally {
    await page.close();
  }
}

/**
 * Capture multiple screenshots with different viewport sizes
 * @param {Object} browser - Puppeteer browser instance
 * @param {string} url - URL to capture
 * @param {Array} viewports - Array of viewport configurations
 * @returns {Array} Array of screenshot file paths
 */
async function captureMultipleViewports(browser, url, viewports = []) {
  const defaultViewports = [
    { width: 1920, height: 1080, name: 'desktop' },
    { width: 768, height: 1024, name: 'tablet' },
    { width: 375, height: 667, name: 'mobile' }
  ];
  
  const targetViewports = viewports.length > 0 ? viewports : defaultViewports;
  const screenshots = [];
  
  for (const viewport of targetViewports) {
    try {
      const screenshotPath = await capture(browser, url, { viewport });
      screenshots.push({
        viewport: viewport.name || `${viewport.width}x${viewport.height}`,
        path: screenshotPath,
        width: viewport.width,
        height: viewport.height
      });
    } catch (error) {
      console.error(`Failed to capture ${viewport.name || viewport.width + 'x' + viewport.height}:`, error);
      screenshots.push({
        viewport: viewport.name || `${viewport.width}x${viewport.height}`,
        error: error.message,
        width: viewport.width,
        height: viewport.height
      });
    }
  }
  
  return screenshots;
}

/**
 * Clean up temporary screenshot files
 * @param {Array} filePaths - Array of file paths to clean up
 */
async function cleanup(filePaths) {
  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
      console.log(`Cleaned up: ${filePath}`);
    } catch (error) {
      console.error(`Failed to cleanup ${filePath}:`, error);
    }
  }
}

module.exports = {
  capture,
  captureMultipleViewports,
  cleanup
};