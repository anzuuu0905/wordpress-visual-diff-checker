/**
 * WordPress Visual Diff Checker - Google Apps Script UI
 * 日本語のサイト管理インターフェース
 */

// 設定値
const CLOUD_RUN_URL = 'https://vrt-runner-asia-northeast1-PROJECT_ID.a.run.app';
const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');

/**
 * Web アプリのメインエントリーポイント
 */
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setTitle('WordPress Visual Diff Checker')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTML ファイルを include するためのヘルパー関数
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * サイト一覧を取得
 */
function getSites() {
  try {
    const sheet = getOrCreateSitesSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return [];
    }
    
    return data.slice(1).map(row => ({
      id: row[0],
      name: row[1],
      url: row[2],
      lastRun: row[3] || '',
      status: row[4] || 'pending',
      description: row[5] || '',
      created: row[6] || new Date().toISOString(),
      baselineStatus: row[7] || 'none' // 'none', 'completed', 'ready'
    }));
    
  } catch (error) {
    console.error('サイト一覧取得エラー:', error);
    throw new Error('サイト一覧の取得に失敗しました: ' + error.message);
  }
}

/**
 * 新しいサイトを追加
 */
function addSite(name, url, description = '') {
  try {
    if (!name || !url) {
      throw new Error('サイト名とURLは必須です');
    }
    
    // URL の正規化とバリデーション
    const normalizedUrl = normalizeUrl(url);
    if (!isValidUrl(normalizedUrl)) {
      throw new Error('有効なURLを入力してください');
    }
    
    const sheet = getOrCreateSitesSheet();
    const id = Utilities.getUuid();
    
    // 重複チェック
    const existingSites = getSites();
    const duplicate = existingSites.find(site => 
      site.url.toLowerCase() === normalizedUrl.toLowerCase() ||
      site.name.toLowerCase() === name.toLowerCase()
    );
    
    if (duplicate) {
      throw new Error('同じ名前またはURLのサイトが既に登録されています');
    }
    
    sheet.appendRow([
      id,
      name,
      normalizedUrl,
      '', // lastRun
      'pending', // status
      description,
      new Date().toISOString(),
      'none' // baselineStatus
    ]);
    
    Logger.log(`サイト追加: ${name} (${normalizedUrl})`);
    return { success: true, id: id, message: 'サイトを追加しました' };
    
  } catch (error) {
    console.error('サイト追加エラー:', error);
    return { success: false, error: error.message };
  }
}

/**
 * サイトを削除
 */
function deleteSite(siteId) {
  try {
    if (!siteId) {
      throw new Error('サイトIDが指定されていません');
    }
    
    const sheet = getOrCreateSitesSheet();
    const data = sheet.getDataRange().getValues();
    
    const rowIndex = data.findIndex(row => row[0] === siteId);
    if (rowIndex === -1) {
      throw new Error('指定されたサイトが見つかりません');
    }
    
    if (rowIndex === 0) {
      throw new Error('ヘッダー行は削除できません');
    }
    
    const siteName = data[rowIndex][1];
    sheet.deleteRow(rowIndex + 1);
    
    Logger.log(`サイト削除: ${siteName} (${siteId})`);
    return { success: true, message: 'サイトを削除しました' };
    
  } catch (error) {
    console.error('サイト削除エラー:', error);
    return { success: false, error: error.message };
  }
}

/**
 * サイト情報を更新
 */
function updateSite(siteId, name, url, description) {
  try {
    if (!siteId || !name || !url) {
      throw new Error('必須項目が入力されていません');
    }
    
    const normalizedUrl = normalizeUrl(url);
    if (!isValidUrl(normalizedUrl)) {
      throw new Error('有効なURLを入力してください');
    }
    
    const sheet = getOrCreateSitesSheet();
    const data = sheet.getDataRange().getValues();
    
    const rowIndex = data.findIndex(row => row[0] === siteId);
    if (rowIndex === -1) {
      throw new Error('指定されたサイトが見つかりません');
    }
    
    // 重複チェック（自分以外）
    const existingSites = getSites().filter(site => site.id !== siteId);
    const duplicate = existingSites.find(site => 
      site.url.toLowerCase() === normalizedUrl.toLowerCase() ||
      site.name.toLowerCase() === name.toLowerCase()
    );
    
    if (duplicate) {
      throw new Error('同じ名前またはURLのサイトが既に登録されています');
    }
    
    sheet.getRange(rowIndex + 1, 2).setValue(name);
    sheet.getRange(rowIndex + 1, 3).setValue(normalizedUrl);
    sheet.getRange(rowIndex + 1, 6).setValue(description || '');
    
    Logger.log(`サイト更新: ${name} (${siteId})`);
    return { success: true, message: 'サイト情報を更新しました' };
    
  } catch (error) {
    console.error('サイト更新エラー:', error);
    return { success: false, error: error.message };
  }
}

/**
 * VRT チェックを実行
 */
function runVrtCheck(siteId, mode = 'full') {
  try {
    if (!siteId) {
      throw new Error('サイトIDが指定されていません');
    }
    
    const sites = getSites();
    const site = sites.find(s => s.id === siteId);
    if (!site) {
      throw new Error('指定されたサイトが見つかりません');
    }
    
    // 実行状態を更新
    updateSiteStatus(siteId, 'running', '実行中...');
    
    const results = {
      siteId: siteId,
      siteName: site.name,
      mode: mode,
      startTime: new Date().toISOString(),
      steps: []
    };
    
    try {
      if (mode === 'full' || mode === 'baseline') {
        // Baseline 実行
        results.steps.push({ step: 'baseline', status: 'running', startTime: new Date().toISOString() });
        const baselineResult = callCloudRun('/crawl', {
          mode: 'baseline',
          url: site.url,
          siteId: siteId
        });
        
        if (!baselineResult.success) {
          throw new Error(`Baseline 実行エラー: ${baselineResult.error}`);
        }
        
        results.steps[results.steps.length - 1].status = 'completed';
        results.steps[results.steps.length - 1].endTime = new Date().toISOString();
        results.steps[results.steps.length - 1].result = baselineResult;
      }
      
      if (mode === 'full' || mode === 'after' || mode === 'after-and-compare') {
        // After 実行
        results.steps.push({ step: 'after', status: 'running', startTime: new Date().toISOString() });
        const afterResult = callCloudRun('/crawl', {
          mode: 'after',
          url: site.url,
          siteId: siteId
        });
        
        if (!afterResult.success) {
          throw new Error(`After 実行エラー: ${afterResult.error}`);
        }
        
        results.steps[results.steps.length - 1].status = 'completed';
        results.steps[results.steps.length - 1].endTime = new Date().toISOString();
        results.steps[results.steps.length - 1].result = afterResult;
      }
      
      if (mode === 'full' || mode === 'compare' || mode === 'after-and-compare') {
        // 比較実行
        results.steps.push({ step: 'compare', status: 'running', startTime: new Date().toISOString() });
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const compareResult = callCloudRun('/compare', {
          siteId: siteId,
          date: date
        }, 'POST');
        
        if (!compareResult.success) {
          throw new Error(`比較実行エラー: ${compareResult.error}`);
        }
        
        results.steps[results.steps.length - 1].status = 'completed';
        results.steps[results.steps.length - 1].endTime = new Date().toISOString();
        results.steps[results.steps.length - 1].result = compareResult;
        
        // 結果に基づいてステータス更新
        const ngCount = compareResult.ngCount || 0;
        const status = ngCount > 0 ? 'ng' : 'ok';
        const message = ngCount > 0 ? 
          `完了 (${ngCount}件の差分を検出)` : 
          '完了 (差分なし)';
        
        updateSiteStatus(siteId, status, message);
        results.finalStatus = status;
        results.ngCount = ngCount;
      } else {
        if (mode === 'baseline') {
          updateSiteStatus(siteId, 'ready', '更新前キャプチャー完了');
          updateSiteBaselineStatus(siteId, 'completed');
        } else {
          updateSiteStatus(siteId, 'completed', '実行完了');
        }
        results.finalStatus = 'completed';
      }
      
      results.endTime = new Date().toISOString();
      results.success = true;
      
      Logger.log(`VRT チェック完了: ${site.name} (${mode})`);
      return results;
      
    } catch (error) {
      updateSiteStatus(siteId, 'error', error.message);
      results.success = false;
      results.error = error.message;
      results.endTime = new Date().toISOString();
      throw error;
    }
    
  } catch (error) {
    console.error('VRT チェックエラー:', error);
    updateSiteStatus(siteId, 'error', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * サイトのステータスを更新
 */
function updateSiteStatus(siteId, status, message = '') {
  try {
    const sheet = getOrCreateSitesSheet();
    const data = sheet.getDataRange().getValues();
    
    const rowIndex = data.findIndex(row => row[0] === siteId);
    if (rowIndex === -1) {
      return;
    }
    
    const now = new Date().toLocaleString('ja-JP');
    sheet.getRange(rowIndex + 1, 4).setValue(now); // lastRun
    sheet.getRange(rowIndex + 1, 5).setValue(status); // status
    
    Logger.log(`サイトステータス更新: ${siteId} -> ${status} (${message})`);
    
  } catch (error) {
    console.error('サイトステータス更新エラー:', error);
  }
}

/**
 * サイトのベースライン状態を更新
 */
function updateSiteBaselineStatus(siteId, baselineStatus) {
  try {
    const sheet = getOrCreateSitesSheet();
    const data = sheet.getDataRange().getValues();
    
    const rowIndex = data.findIndex(row => row[0] === siteId);
    if (rowIndex === -1) {
      return;
    }
    
    // ベースライン状態を8列目に保存
    sheet.getRange(rowIndex + 1, 8).setValue(baselineStatus);
    
    Logger.log(`ベースライン状態更新: ${siteId} -> ${baselineStatus}`);
    
  } catch (error) {
    console.error('ベースライン状態更新エラー:', error);
  }
}

/**
 * Cloud Run API を呼び出し
 */
function callCloudRun(endpoint, params, method = 'GET') {
  try {
    const token = getAccessToken();
    const url = CLOUD_RUN_URL + endpoint;
    
    const options = {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };
    
    if (method === 'GET') {
      const paramString = Object.keys(params)
        .map(key => `${key}=${encodeURIComponent(params[key])}`)
        .join('&');
      const fullUrl = `${url}?${paramString}`;
      
      Logger.log(`Cloud Run GET: ${fullUrl}`);
      const response = UrlFetchApp.fetch(fullUrl, options);
      
    } else {
      options.payload = JSON.stringify(params);
      Logger.log(`Cloud Run ${method}: ${url}`, params);
      var response = UrlFetchApp.fetch(url, options);
    }
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log(`Cloud Run Response: ${responseCode}`, responseText);
    
    if (responseCode !== 200) {
      throw new Error(`HTTP ${responseCode}: ${responseText}`);
    }
    
    return JSON.parse(responseText);
    
  } catch (error) {
    console.error('Cloud Run API エラー:', error);
    throw new Error(`Cloud Run API 呼び出し失敗: ${error.message}`);
  }
}

/**
 * アクセストークンを取得
 */
function getAccessToken() {
  try {
    return ScriptApp.getOAuthToken();
  } catch (error) {
    console.error('アクセストークン取得エラー:', error);
    throw new Error('認証エラーが発生しました');
  }
}

/**
 * Sites シートを取得または作成
 */
function getOrCreateSitesSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('sites');
  
  if (!sheet) {
    sheet = ss.insertSheet('sites');
    sheet.appendRow([
      'ID',
      'サイト名',
      'URL',
      '最終実行',
      'ステータス',
      '説明',
      '作成日時',
      'ベースライン状態'
    ]);
    
    // ヘッダー行をフォーマット
    const headerRange = sheet.getRange(1, 1, 1, 8);
    headerRange.setBackground('#f0f0f0');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
  }
  
  return sheet;
}

/**
 * URL を正規化
 */
function normalizeUrl(url) {
  if (!url) return '';
  
  // プロトコルが指定されていない場合は https を追加
  if (!url.match(/^https?:\/\//)) {
    url = 'https://' + url;
  }
  
  // 末尾のスラッシュを除去
  url = url.replace(/\/$/, '');
  
  return url;
}

/**
 * URL のバリデーション
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return url.match(/^https?:\/\/.+\..+/);
  } catch (e) {
    return false;
  }
}

/**
 * 設定情報を取得
 */
function getConfig() {
  return {
    cloudRunUrl: CLOUD_RUN_URL,
    sheetId: SHEET_ID,
    version: '1.0.0',
    lastUpdate: new Date().toISOString()
  };
}

/**
 * ヘルスチェック
 */
function healthCheck() {
  try {
    const result = callCloudRun('/health');
    return {
      gasStatus: 'ok',
      cloudRunStatus: result.status,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      gasStatus: 'ok',
      cloudRunStatus: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}