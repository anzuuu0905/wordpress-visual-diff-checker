const { capture, waitForContentAndScroll } = require('../src/screenshot');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

describe('Screenshot', () => {
  let browser;
  
  beforeAll(async () => {
    browser = await puppeteer.launch({ 
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--disable-web-security',
        '--disable-features=TranslateUI'
      ]
    });
  });
  
  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('capture', () => {
    it('should capture a screenshot of a webpage', async () => {
      // Create a simple test HTML page
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .section { height: 500px; margin: 20px 0; padding: 20px; border: 1px solid #ccc; }
            .lazy-image { width: 100%; height: 200px; background: #f0f0f0; }
          </style>
        </head>
        <body>
          <h1>Test Page</h1>
          <div class="section">Section 1</div>
          <div class="section">Section 2</div>
          <div class="section">Section 3</div>
          <img class="lazy-image" src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNkZGQiLz4KPC9zdmc+" alt="Test Image">
        </body>
        </html>
      `;
      
      const page = await browser.newPage();
      await page.setContent(testHtml);
      
      const screenshotPath = await capture(browser, 'data:text/html;charset=utf-8,' + encodeURIComponent(testHtml));
      
      // Verify screenshot file exists
      const stats = await fs.stat(screenshotPath);
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
      
      // Cleanup
      await fs.unlink(screenshotPath);
      await page.close();
    }, 30000);

    it('should handle different viewport sizes', async () => {
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Responsive Test</title>
          <style>
            body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
            .container { max-width: 1200px; margin: 0 auto; }
            @media (max-width: 768px) {
              .container { max-width: 100%; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Responsive Test Page</h1>
            <p>This page should look different on different screen sizes.</p>
          </div>
        </body>
        </html>
      `;
      
      const viewports = [
        { width: 1920, height: 1080 },
        { width: 768, height: 1024 },
        { width: 375, height: 667 }
      ];
      
      const screenshots = [];
      
      for (const viewport of viewports) {
        const screenshotPath = await capture(
          browser, 
          'data:text/html;charset=utf-8,' + encodeURIComponent(testHtml),
          { viewport }
        );
        screenshots.push(screenshotPath);
        
        // Verify screenshot exists
        const stats = await fs.stat(screenshotPath);
        expect(stats.isFile()).toBe(true);
        expect(stats.size).toBeGreaterThan(0);
      }
      
      // Cleanup
      for (const screenshotPath of screenshots) {
        await fs.unlink(screenshotPath);
      }
    }, 45000);
  });

  describe('waitForContentAndScroll', () => {
    it('should handle scrolling and content loading', async () => {
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Scroll Test</title>
          <style>
            body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
            .section { height: 800px; margin: 20px 0; padding: 20px; border: 1px solid #ccc; }
            .lazy-content { display: none; }
          </style>
          <script>
            document.addEventListener('DOMContentLoaded', function() {
              let observer = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                  if (entry.isIntersecting) {
                    entry.target.querySelector('.lazy-content').style.display = 'block';
                  }
                });
              });
              
              document.querySelectorAll('.section').forEach(function(section) {
                observer.observe(section);
              });
            });
          </script>
        </head>
        <body>
          <div class="section">
            <h2>Section 1</h2>
            <div class="lazy-content">Lazy loaded content 1</div>
          </div>
          <div class="section">
            <h2>Section 2</h2>
            <div class="lazy-content">Lazy loaded content 2</div>
          </div>
          <div class="section">
            <h2>Section 3</h2>
            <div class="lazy-content">Lazy loaded content 3</div>
          </div>
        </body>
        </html>
      `;
      
      const page = await browser.newPage();
      await page.setContent(testHtml);
      
      // Test the scrolling function
      await waitForContentAndScroll(page, {
        scrollSteps: 5,
        scrollDelay: 500,
        finalWait: 1000
      });
      
      // Verify that lazy content is now visible
      const lazyContentVisible = await page.evaluate(() => {
        const lazyElements = document.querySelectorAll('.lazy-content');
        return Array.from(lazyElements).some(el => 
          getComputedStyle(el).display !== 'none'
        );
      });
      
      expect(lazyContentVisible).toBe(true);
      
      await page.close();
    }, 30000);
  });
});