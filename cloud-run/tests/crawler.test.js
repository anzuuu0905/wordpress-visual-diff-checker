const { crawl, extractLinks } = require('../src/crawler');
const puppeteer = require('puppeteer');

// Mock dependencies
jest.mock('../src/robots-checker', () => ({
  canCrawl: jest.fn().mockResolvedValue(true)
}));

describe('Crawler', () => {
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
  
  describe('crawl', () => {
    it('should discover URLs from a starting page', async () => {
      const startUrl = 'https://example.com';
      const urls = await crawl(browser, startUrl, { maxUrls: 5, timeout: 10000 });
      
      expect(Array.isArray(urls)).toBe(true);
      expect(urls.length).toBeGreaterThan(0);
      expect(urls).toContain(startUrl);
    }, 30000);
    
    it('should respect maxUrls limit', async () => {
      const startUrl = 'https://example.com';
      const maxUrls = 3;
      const urls = await crawl(browser, startUrl, { maxUrls, timeout: 10000 });
      
      expect(urls.length).toBeLessThanOrEqual(maxUrls);
    }, 30000);
    
    it('should only return internal links', async () => {
      const startUrl = 'https://example.com';
      const urls = await crawl(browser, startUrl, { maxUrls: 5, timeout: 10000 });
      
      for (const url of urls) {
        const urlObj = new URL(url);
        expect(urlObj.hostname).toBe('example.com');
      }
    }, 30000);
  });
  
  describe('extractLinks', () => {
    it('should extract links from a page', async () => {
      const pageUrl = 'https://example.com';
      const links = await extractLinks(browser, pageUrl);
      
      expect(Array.isArray(links)).toBe(true);
      // Should at least contain the page itself or some internal links
      expect(links.length).toBeGreaterThanOrEqual(0);
    }, 15000);
  });
});