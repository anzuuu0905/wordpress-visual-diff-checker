/**
 * 🚨 包括的エラーハンドリング
 * VRTシステムの堅牢性を保証
 */

const fs = require('fs-extra');
const path = require('path');

class VRTError extends Error {
  constructor(message, type, details = {}) {
    super(message);
    this.name = 'VRTError';
    this.type = type;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

class ErrorHandler {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, '..', 'logs');
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    // ログディレクトリを確保
    fs.ensureDirSync(this.logDir);
  }

  /**
   * エラーログを記録
   */
  async logError(error, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        type: error.type || 'unknown'
      },
      context: context,
      severity: this.getSeverity(error)
    };

    const logFile = path.join(this.logDir, `vrt-errors-${this.getDateString()}.log`);
    
    try {
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (writeError) {
      console.error('ログ書き込みエラー:', writeError);
    }
  }

  /**
   * リトライ機能付き関数実行
   */
  async executeWithRetry(fn, context = '', maxRetries = this.maxRetries) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        await this.logError(error, {
          context,
          attempt,
          maxRetries
        });

        if (attempt === maxRetries) {
          throw new VRTError(
            `${context}: ${maxRetries}回の試行後に失敗`,
            'MAX_RETRY_EXCEEDED',
            { originalError: error, attempts: maxRetries }
          );
        }

        // 指数バックオフでリトライ間隔を調整
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        console.log(`⚠️ ${context} 失敗 (${attempt}/${maxRetries}) - ${delay}ms後にリトライ`);
        
        await this.sleep(delay);
      }
    }
  }

  /**
   * スクリーンショット専用エラーハンドリング
   */
  async handleScreenshotError(error, url, siteId, attempt = 1) {
    const errorInfo = {
      url,
      siteId,
      attempt,
      userAgent: 'WordPress-VRT-System',
      errorType: this.classifyScreenshotError(error)
    };

    await this.logError(error, errorInfo);

    // エラータイプ別の対処
    switch (errorInfo.errorType) {
      case 'TIMEOUT':
        if (attempt < 3) {
          console.log(`⏰ ${url} - タイムアウト発生、DOMContentLoadedで再試行`);
          return 'retry_with_fallback';
        }
        break;
        
      case 'NETWORK':
        if (attempt < 2) {
          console.log(`🌐 ${url} - ネットワークエラー、再試行`);
          return 'retry';
        }
        break;
        
      case 'NAVIGATION':
        console.log(`🚫 ${url} - ナビゲーションエラー、スキップ`);
        return 'skip';
        
      default:
        console.log(`❌ ${url} - 未分類エラー: ${error.message}`);
    }

    return 'fail';
  }

  /**
   * 差分検出エラーの処理
   */
  async handleComparisonError(error, siteId, device) {
    const errorInfo = {
      siteId,
      device,
      operation: 'image_comparison',
      errorType: this.classifyComparisonError(error)
    };

    await this.logError(error, errorInfo);

    switch (errorInfo.errorType) {
      case 'MISSING_BASELINE':
        return {
          status: 'SKIP',
          message: 'Baselineスクリーンショットが見つかりません。先にStep1でBaseline撮影を実行してください。',
          action: 'require_baseline'
        };
        
      case 'IMAGE_SIZE_MISMATCH':
        return {
          status: 'SKIP',
          message: 'ベースライン画像とサイズが異なります。Baselineを再撮影してください。',
          action: 'require_rebaseline'
        };
        
      case 'CORRUPTED_IMAGE':
        return {
          status: 'ERROR',
          message: '画像ファイルが破損しています。',
          action: 'cleanup_and_retry'
        };
        
      default:
        return {
          status: 'ERROR',
          message: `画像比較中にエラーが発生: ${error.message}`,
          action: 'manual_check'
        };
    }
  }

  /**
   * スクリーンショットエラーの分類
   */
  classifyScreenshotError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout') || message.includes('navigation timeout')) {
      return 'TIMEOUT';
    }
    if (message.includes('net::') || message.includes('network')) {
      return 'NETWORK';
    }
    if (message.includes('navigation') || message.includes('navigate')) {
      return 'NAVIGATION';
    }
    if (message.includes('memory') || message.includes('out of memory')) {
      return 'MEMORY';
    }
    
    return 'UNKNOWN';
  }

  /**
   * 比較エラーの分類
   */
  classifyComparisonError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('baseline') && message.includes('not found')) {
      return 'MISSING_BASELINE';
    }
    if (message.includes('size') || message.includes('dimension')) {
      return 'IMAGE_SIZE_MISMATCH';
    }
    if (message.includes('corrupt') || message.includes('invalid')) {
      return 'CORRUPTED_IMAGE';
    }
    
    return 'UNKNOWN';
  }

  /**
   * エラーの深刻度を判定
   */
  getSeverity(error) {
    if (error.type === 'SECURITY' || error.message.includes('security')) {
      return 'CRITICAL';
    }
    if (error.type === 'MAX_RETRY_EXCEEDED') {
      return 'HIGH';
    }
    if (error.type === 'TIMEOUT' || error.type === 'NETWORK') {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }

  /**
   * 日付文字列を取得（ログファイル名用）
   */
  getDateString() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * 指定ミリ秒待機
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// グローバルエラーハンドラー設定
process.on('uncaughtException', (error) => {
  console.error('🚨 未処理例外:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 未処理Promise拒否:', reason);
  // プロセス終了せずログ記録のみ
});

module.exports = { ErrorHandler, VRTError };