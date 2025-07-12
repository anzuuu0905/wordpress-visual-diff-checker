/**
 * 🕷️ URLクローラー機能
 * 同一ドメイン内のリンクを自動収集
 */

const { URL } = require('url');

class SiteCrawler {
  constructor(options = {}) {
    this.maxPages = options.maxPages || 20;
    this.maxDepth = options.maxDepth || 3;
    this.timeout = options.timeout || 30000;
    this.excludePatterns = options.excludePatterns || [
      /\.(pdf|zip|exe|dmg|doc|docx|xls|xlsx)$/i,
      /^mailto:/,
      /^tel:/,
      /^javascript:/,
      /#.*$/,
      /\/wp-admin/,
      /\/admin/,
      /\?.*logout/,
      /\?.*action=logout/
    ];
  }

  /**
   * URLを正規化して重複を防ぐ
   */
  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // 末尾スラッシュを統一（除去）
      urlObj.pathname = urlObj.pathname.replace(/\/+$/, '') || '/';
      
      // クエリパラメータをソート
      urlObj.searchParams.sort();
      
      // ハッシュフラグメントを除去
      urlObj.hash = '';
      
      return urlObj.href.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * サイトをクロールしてURL一覧を取得
   */
  async crawl(page, baseUrl) {
    const baseDomain = new URL(baseUrl).hostname;
    const visited = new Set();
    const normalizedToOriginal = new Map(); // 正規化URL → 元URL
    const queue = [{ url: baseUrl, depth: 0 }];
    const urls = [];
    const urlMetadata = new Map();

    console.log(`🕷️ クローリング開始: ${baseUrl} (最大${this.maxPages}ページ)`);

    while (queue.length > 0 && urls.length < this.maxPages) {
      const { url, depth } = queue.shift();
      const normalizedUrl = this.normalizeUrl(url);
      
      // 正規化されたURLで重複チェック
      if (visited.has(normalizedUrl) || depth > this.maxDepth) {
        continue;
      }

      // 除外パターンチェック
      if (this.shouldExclude(url)) {
        continue;
      }

      visited.add(normalizedUrl);
      normalizedToOriginal.set(normalizedUrl, url);
      
      try {
        // ページ訪問
        console.log(`📄 訪問中 (${urls.length + 1}/${this.maxPages}): ${url}`);
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: this.timeout
        });

        // ページタイトル取得
        const title = await page.title();
        const pathname = new URL(url).pathname;
        
        urls.push(url);
        urlMetadata.set(url, {
          title: title || pathname,
          pathname: pathname,
          depth: depth,
          index: urls.length
        });

        // 同一ドメインのリンクを収集
        if (depth < this.maxDepth) {
          const links = await this.extractLinks(page, baseDomain);
          const newLinks = links
            .filter(link => {
              const normalizedLink = this.normalizeUrl(link);
              return !visited.has(normalizedLink) && this.isSameDomain(link, baseDomain);
            })
            .map(link => ({ url: link, depth: depth + 1 }));
          
          queue.push(...newLinks);
          console.log(`🔗 ${newLinks.length}個の新しいリンクを発見 (重複除去済み)`);
        }

      } catch (error) {
        console.log(`⚠️ ページ読み込みエラー: ${url} - ${error.message}`);
      }
    }

    console.log(`✅ クローリング完了: ${urls.length}ページを収集`);
    
    return {
      urls: urls,
      metadata: Object.fromEntries(urlMetadata)
    };
  }

  /**
   * ページからリンクを抽出
   */
  async extractLinks(page, baseDomain) {
    return await page.evaluate((baseDomain) => {
      const links = new Set();
      const anchors = document.querySelectorAll('a[href]');
      
      anchors.forEach(anchor => {
        try {
          const href = anchor.href;
          const url = new URL(href, window.location.href);
          
          // 絶対URLに変換
          const absoluteUrl = url.href;
          
          // httpまたはhttpsのみ
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            // クエリパラメータとハッシュを除去（基本URL）
            url.hash = '';
            // 特定のクエリパラメータは保持（ページネーションなど）
            const keepParams = ['page', 'p', 'id'];
            const searchParams = new URLSearchParams(url.search);
            const newParams = new URLSearchParams();
            
            keepParams.forEach(param => {
              if (searchParams.has(param)) {
                newParams.set(param, searchParams.get(param));
              }
            });
            
            url.search = newParams.toString();
            links.add(url.href);
          }
        } catch (e) {
          // 無効なURLは無視
        }
      });
      
      return Array.from(links);
    }, baseDomain);
  }

  /**
   * 同一ドメインかチェック
   */
  isSameDomain(url, baseDomain) {
    try {
      const urlDomain = new URL(url).hostname;
      return urlDomain === baseDomain || 
             urlDomain === `www.${baseDomain}` ||
             `www.${urlDomain}` === baseDomain;
    } catch {
      return false;
    }
  }

  /**
   * 除外パターンチェック
   */
  shouldExclude(url) {
    return this.excludePatterns.some(pattern => pattern.test(url));
  }

  /**
   * URLリストからページ識別子を生成
   */
  static generatePageIdentifiers(urls, metadata) {
    return urls.map((url, index) => {
      const meta = metadata[url] || {};
      const pathname = meta.pathname || new URL(url).pathname;
      
      // パス名から識別子を生成
      let identifier = pathname
        .replace(/^\//, '')
        .replace(/\/$/, '')
        .replace(/[^a-zA-Z0-9]/g, '-')
        .toLowerCase();
      
      // 空の場合はトップページ
      if (!identifier) {
        identifier = 'top';
      }
      
      // 長すぎる場合は短縮
      if (identifier.length > 30) {
        identifier = identifier.substring(0, 30);
      }
      
      return {
        url: url,
        pageId: String(index + 1).padStart(3, '0'),
        identifier: identifier,
        title: meta.title || identifier
      };
    });
  }
}

module.exports = SiteCrawler;