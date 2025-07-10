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
    
    // Control resource loading for better visual accuracy
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const url = request.url();
      
      if (['font', 'stylesheet', 'document', 'script'].includes(resourceType)) {
        // Allow critical resources for visual accuracy
        request.continue();
      } else if (['image', 'media'].includes(resourceType)) {
        // Allow images for complete visual representation
        // Block only heavy video content and ads
        if (url.includes('video') || url.includes('ads') || url.includes('doubleclick')) {
          request.abort();
        } else {
          request.continue();
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
    
    // Enhanced waiting and scrolling for lazy-loaded content
    await waitForContentAndScroll(page, {
      scrollSteps: 10,
      scrollDelay: 800,
      finalWait: 2000
    });
    
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

/**
 * Enhanced waiting and scrolling for lazy-loaded content
 * @param {Object} page - Puppeteer page instance
 * @param {Object} options - Scrolling options
 */
async function waitForContentAndScroll(page, options = {}) {
  const {
    scrollSteps = 10,
    scrollDelay = 800,
    finalWait = 2000,
    maxWaitTime = 30000
  } = options;
  
  const startTime = Date.now();
  
  try {
    // Wait for initial content load
    await page.waitForTimeout(1000);
    
    // Get page dimensions
    const pageHeight = await page.evaluate(() => {
      return Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
    });
    
    const viewportHeight = page.viewport().height;
    const scrollStep = Math.max(viewportHeight * 0.8, pageHeight / scrollSteps);
    
    console.log(`Page height: ${pageHeight}px, Scroll step: ${scrollStep}px`);
    
    // Track network activity
    let networkIdle = true;
    let networkIdleTimer;
    
    const resetNetworkIdleTimer = () => {
      networkIdle = false;
      clearTimeout(networkIdleTimer);
      networkIdleTimer = setTimeout(() => {
        networkIdle = true;
      }, 500);
    };
    
    // Monitor network requests
    page.on('request', resetNetworkIdleTimer);
    page.on('response', resetNetworkIdleTimer);
    
    // Progressive scrolling
    let currentPosition = 0;
    let previousImageCount = 0;
    
    while (currentPosition < pageHeight && (Date.now() - startTime) < maxWaitTime) {
      // Scroll to next position
      await page.evaluate((scrollTo) => {
        window.scrollTo(0, scrollTo);
      }, currentPosition);
      
      // Wait for content to load
      await page.waitForTimeout(scrollDelay);
      
      // Check for new images loaded
      const currentImageCount = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        let loadedCount = 0;
        images.forEach(img => {
          if (img.complete && img.naturalWidth > 0) {
            loadedCount++;
          }
        });
        return loadedCount;
      });
      
      // If new images were loaded, wait a bit more
      if (currentImageCount > previousImageCount) {
        console.log(`New images loaded: ${currentImageCount - previousImageCount}`);
        await page.waitForTimeout(1000);
        previousImageCount = currentImageCount;
      }
      
      // Move to next scroll position
      currentPosition += scrollStep;
      
      // Check if we've reached the bottom
      const isAtBottom = await page.evaluate(() => {
        return (window.innerHeight + window.pageYOffset) >= document.body.offsetHeight - 100;
      });
      
      if (isAtBottom) {
        console.log('Reached bottom of page');
        break;
      }
    }
    
    // Final scroll to bottom to ensure all content is loaded
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    
    // Wait for any final network activity to complete
    let waitCount = 0;
    while (!networkIdle && waitCount < 20) {
      await page.waitForTimeout(500);
      waitCount++;
    }
    
    // Final wait for any remaining content
    await page.waitForTimeout(finalWait);
    
    // Scroll back to top for consistent screenshots
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    
    await page.waitForTimeout(500);
    
    console.log(`Content loading completed in ${Date.now() - startTime}ms`);
    
    // Clean up event listeners
    page.removeAllListeners('request');
    page.removeAllListeners('response');
    
  } catch (error) {
    console.error('Error during content loading and scrolling:', error);
    // Continue with screenshot even if scrolling fails
  }
}

/**
 * Wait for images to load completely
 * @param {Object} page - Puppeteer page instance
 * @param {number} timeout - Maximum wait time in milliseconds
 */
async function waitForImages(page, timeout = 10000) {
  try {
    await page.waitForFunction(
      () => {
        const images = Array.from(document.querySelectorAll('img'));
        return images.every(img => img.complete && img.naturalWidth > 0);
      },
      { timeout }
    );
    console.log('All images loaded successfully');
  } catch (error) {
    console.log('Some images may not have loaded completely:', error.message);
  }
}

module.exports = {
  capture,
  captureMultipleViewports,
  cleanup,
  waitForContentAndScroll,
  waitForImages
};