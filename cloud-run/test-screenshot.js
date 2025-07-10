const puppeteer = require('puppeteer');
const { capture } = require('./src/screenshot');

async function testScreenshot() {
  console.log('Starting screenshot test...');
  
  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  });

  try {
    // Test with a sample WordPress site
    const testUrl = 'https://wordpress.com/';
    
    console.log(`Testing screenshot capture for: ${testUrl}`);
    
    const screenshotPath = await capture(browser, testUrl, {
      viewport: { width: 1920, height: 1080 },
      waitUntil: 'networkidle0',
      timeout: 60000,
      fullPage: true,
      quality: 90
    });
    
    console.log(`Screenshot saved to: ${screenshotPath}`);
    
  } catch (error) {
    console.error('Screenshot test failed:', error);
  } finally {
    await browser.close();
  }
}

// Run the test
testScreenshot().catch(console.error);