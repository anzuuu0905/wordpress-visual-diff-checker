// Jest setup file
process.env.NODE_ENV = 'test';
process.env.DRIVE_ROOT = 'test-bucket';
process.env.SHEET_ID = 'test-sheet-id';
process.env.MAX_CRAWL_URLS = '10';
process.env.DIFF_THRESHOLD = '2.0';
process.env.SCREENSHOT_VIEWPORT_WIDTH = '1920';
process.env.SCREENSHOT_VIEWPORT_HEIGHT = '1080';

// Increase timeout for Puppeteer operations
jest.setTimeout(30000);