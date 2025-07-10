/**
 * 🚀 WordPress VRT - 完全版
 * このコードをGoogle Apps Scriptにコピペしてください
 */

// 設定
const CONFIG = {
  DIFF_THRESHOLD: 2,
  MAX_URLS: 50,
  SCREENSHOT: {
    width: 1200,
    height: 800,
    device: 'desktop'
  }
};

/**
 * 🎯 メイン関数 - 初回セットアップ
 */
function setupWordPressVRT() {
  try {
    console.log('🚀 WordPress VRT セットアップ開始...');
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. サイト管理シート作成
    createSiteManagementSheet(sheet);
    
    // 2. VRT結果シート作成
    createResultsSheet(sheet);
    
    // 3. 設定シート作成
    createConfigSheet(sheet);
    
    // 4. Google Driveフォルダ作成
    const folder = DriveApp.createFolder('WordPress VRT Screenshots - ' + Utilities.formatDate(new Date(), 'JST', 'yyyyMMdd'));
    const folderId = folder.getId();
    
    // 5. 設定保存
    PropertiesService.getScriptProperties().setProperties({
      'VRT_FOLDER_ID': folderId,
      'SETUP_COMPLETED': 'true',
      'SETUP_DATE': new Date().toISOString()
    });
    
    // 6. 完了メッセージ
    Browser.msgBox(
      '🎉 WordPress VRT セットアップ完了！',
      '✅ サイト管理シート作成完了\\n' +
      '✅ VRT結果シート作成完了\\n' +
      '✅ 設定シート作成完了\\n' +
      '✅ Google Driveフォルダ作成完了\\n\\n' +
      '📋 次のステップ:\\n' +
      '1. サイト管理シートでサイト情報を入力\\n' +
      '2. runFullVRTCheck()を実行してテスト\\n\\n' +
      '🔗 Driveフォルダ: ' + folder.getUrl(),
      Browser.Buttons.OK
    );
    
    console.log('✅ セットアップ完了: ' + folder.getUrl());
    
  } catch (error) {
    console.error('❌ セットアップエラー:', error);
    Browser.msgBox('エラー', 'セットアップ中にエラーが発生しました:\\n' + error.message, Browser.Buttons.OK);
  }
}

/**
 * 🎯 フルVRTチェック実行
 */
function runFullVRTCheck() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const siteSheet = sheet.getSheetByName('サイト管理');
    
    if (!siteSheet) {
      Browser.msgBox('エラー', '先にsetupWordPressVRT()を実行してください。', Browser.Buttons.OK);
      return;
    }
    
    // アクティブな行のサイト情報を取得
    const activeRange = siteSheet.getActiveRange();
    const row = activeRange.getRow();
    
    if (row < 2) {
      Browser.msgBox('使い方', 'チェックしたいサイトの行を選択してから実行してください。', Browser.Buttons.OK);
      return;
    }
    
    const siteData = getSiteData(siteSheet, row);
    if (!siteData.url) {
      Browser.msgBox('エラー', '有効なURLが入力されていません。', Browser.Buttons.OK);
      return;
    }
    
    Browser.msgBox('開始', 'WordPress VRTチェックを開始します。\\n処理に時間がかかる場合があります。', Browser.Buttons.OK);
    
    // VRTチェック実行
    const result = performVRTCheck(siteData, 'full');
    
    // 結果をシートに保存
    updateResultsSheet(sheet, siteData, result);
    
    // 結果表示
    const message = `🎉 VRTチェック完了！\\n\\n` +
      `📊 チェック結果:\\n` +
      `・サイト: ${siteData.name}\\n` +
      `・URL: ${siteData.url}\\n` +
      `・チェックページ数: ${result.totalPages}\\n` +
      `・差分検出ページ数: ${result.diffPages}\\n` +
      `・結果: ${result.status}\\n\\n` +
      `📁 詳細は「VRT結果」シートで確認できます。`;
    
    Browser.msgBox('完了', message, Browser.Buttons.OK);
    
  } catch (error) {
    console.error('❌ VRTチェックエラー:', error);
    Browser.msgBox('エラー', 'VRTチェック中にエラーが発生しました:\\n' + error.message, Browser.Buttons.OK);
  }
}

/**
 * 🎯 ベースライン撮影のみ
 */
function takeBaseline() {
  executeSpecificMode('baseline', 'ベースライン撮影');
}

/**
 * 🎯 アフター撮影のみ
 */
function takeAfter() {
  executeSpecificMode('after', 'アフター撮影');
}

/**
 * 🎯 差分比較のみ
 */
function compareOnly() {
  executeSpecificMode('compare', '差分比較');
}

/**
 * 特定モード実行
 */
function executeSpecificMode(mode, modeName) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const siteSheet = sheet.getSheetByName('サイト管理');
    const activeRange = siteSheet.getActiveRange();
    const row = activeRange.getRow();
    
    if (row < 2) {
      Browser.msgBox('使い方', 'チェックしたいサイトの行を選択してから実行してください。', Browser.Buttons.OK);
      return;
    }
    
    const siteData = getSiteData(siteSheet, row);
    if (!siteData.url) {
      Browser.msgBox('エラー', '有効なURLが入力されていません。', Browser.Buttons.OK);
      return;
    }
    
    Browser.msgBox('開始', `${modeName}を開始します。`, Browser.Buttons.OK);
    
    const result = performVRTCheck(siteData, mode);
    updateResultsSheet(sheet, siteData, result);
    
    let message = `✅ ${modeName}完了！\\n・ページ数: ${result.totalPages}`;
    if (mode === 'compare') {
      message += `\\n・差分ページ数: ${result.diffPages}\\n・結果: ${result.status}`;
    }
    
    Browser.msgBox('完了', message, Browser.Buttons.OK);
    
  } catch (error) {
    Browser.msgBox('エラー', `${modeName}中にエラーが発生しました:\\n${error.message}`, Browser.Buttons.OK);
  }
}

/**
 * VRTチェック実行
 */
function performVRTCheck(siteData, mode = 'full') {
  const folderId = PropertiesService.getScriptProperties().getProperty('VRT_FOLDER_ID');
  const folder = DriveApp.getFolderById(folderId);
  
  // サイト用フォルダ作成
  const siteFolderName = siteData.name.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');
  let siteFolder;
  const existingFolders = folder.getFoldersByName(siteFolderName);
  if (existingFolders.hasNext()) {
    siteFolder = existingFolders.next();
  } else {
    siteFolder = folder.createFolder(siteFolderName);
  }
  
  const result = {
    totalPages: 0,
    diffPages: 0,
    status: 'OK',
    timestamp: new Date().toISOString(),
    mode: mode,
    details: []
  };
  
  try {
    console.log(`🔍 ${siteData.name} のVRTチェック開始 (${mode})`);
    
    // URLクロール
    const urls = crawlSite(siteData.url);
    result.totalPages = urls.length;
    console.log(`📝 ${urls.length}個のURLを発見`);
    
    if (mode === 'full' || mode === 'baseline') {
      console.log('📸 ベースライン撮影中...');
      takeScreenshots(urls, siteFolder, 'baseline');
    }
    
    if (mode === 'full' || mode === 'after') {
      console.log('📸 アフター撮影中...');
      takeScreenshots(urls, siteFolder, 'after');
    }
    
    if (mode === 'full' || mode === 'compare') {
      console.log('🔍 差分比較中...');
      const diffResults = compareImages(urls, siteFolder);
      result.diffPages = diffResults.filter(r => r.isDifferent).length;
      result.status = result.diffPages > 0 ? 'NG' : 'OK';
      result.details = diffResults;
    }
    
    console.log(`✅ VRTチェック完了: ${result.status}`);
    return result;
    
  } catch (error) {
    console.error('❌ VRTチェックエラー:', error);
    result.status = 'ERROR';
    result.error = error.message;
    return result;
  }
}

/**
 * サイトクロール
 */
function crawlSite(baseUrl) {
  const urls = [baseUrl];
  
  try {
    console.log(`🕷️ ${baseUrl} をクロール中...`);
    
    // サイトマップから追加URL取得
    const sitemapUrl = baseUrl + '/sitemap.xml';
    try {
      const sitemapResponse = UrlFetchApp.fetch(sitemapUrl, { 
        muteHttpExceptions: true,
        followRedirects: true,
        timeout: 10000
      });
      
      if (sitemapResponse.getResponseCode() === 200) {
        const sitemapXml = sitemapResponse.getContentText();
        const urlMatches = sitemapXml.match(/<loc>(.*?)<\/loc>/g);
        
        if (urlMatches) {
          urlMatches.forEach(match => {
            const url = match.replace(/<\/?loc>/g, '').trim();
            if (url.startsWith(baseUrl) && urls.length < CONFIG.MAX_URLS && !urls.includes(url)) {
              urls.push(url);
            }
          });
        }
        console.log(`📄 サイトマップから ${urlMatches ? urlMatches.length : 0} 個のURLを取得`);
      }
    } catch (e) {
      console.log('⚠️ サイトマップにアクセスできません:', e.message);
    }
    
    // 重複除去とフィルタリング
    const uniqueUrls = [...new Set(urls)]
      .filter(url => url && url.startsWith('http'))
      .slice(0, CONFIG.MAX_URLS);
    
    console.log(`✅ ${uniqueUrls.length} 個のURLを選択`);
    return uniqueUrls;
    
  } catch (error) {
    console.error('❌ クロールエラー:', error);
    return [baseUrl];
  }
}

/**
 * スクリーンショット撮影（HTML保存版）
 */
function takeScreenshots(urls, folder, type) {
  const timestamp = Utilities.formatDate(new Date(), 'JST', 'yyyyMMdd');
  const typeFolder = getOrCreateFolder(folder, type);
  const dateFolder = getOrCreateFolder(typeFolder, timestamp);
  
  console.log(`📸 ${type} 撮影開始: ${urls.length} ページ`);
  
  urls.forEach((url, index) => {
    try {
      const filename = `page_${String(index + 1).padStart(3, '0')}_${encodeURIComponent(url).substring(0, 100)}.html`;
      
      // HTMLコンテンツを取得
      const response = UrlFetchApp.fetch(url, { 
        muteHttpExceptions: true,
        followRedirects: true,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (response.getResponseCode() === 200) {
        const content = response.getContentText();
        const blob = Utilities.newBlob(content, 'text/html', filename);
        dateFolder.createFile(blob);
        console.log(`✅ 保存完了: ${filename}`);
      } else {
        console.log(`⚠️ 取得失敗 (${response.getResponseCode()}): ${url}`);
      }
      
    } catch (error) {
      console.error(`❌ スクリーンショット失敗 ${url}:`, error.message);
    }
  });
  
  console.log(`✅ ${type} 撮影完了`);
}

/**
 * 画像比較（HTML差分版）
 */
function compareImages(urls, folder) {
  const results = [];
  console.log(`🔍 ${urls.length} ページの差分比較開始`);
  
  try {
    const baselineFolders = folder.getFoldersByName('baseline');
    const afterFolders = folder.getFoldersByName('after');
    
    if (!baselineFolders.hasNext() || !afterFolders.hasNext()) {
      console.log('⚠️ ベースラインまたはアフターフォルダが見つかりません');
      return results;
    }
    
    const baselineFolder = baselineFolders.next();
    const afterFolder = afterFolders.next();
    
    urls.forEach((url, index) => {
      const filename = `page_${String(index + 1).padStart(3, '0')}_${encodeURIComponent(url).substring(0, 100)}.html`;
      
      try {
        // 最新の日付フォルダから比較
        const baselineFiles = getLatestFileFromFolder(baselineFolder, filename);
        const afterFiles = getLatestFileFromFolder(afterFolder, filename);
        
        if (baselineFiles && afterFiles) {
          const baselineContent = baselineFiles.getBlob().getDataAsString();
          const afterContent = afterFiles.getBlob().getDataAsString();
          
          // 簡易的な差分計算
          const isDifferent = baselineContent !== afterContent;
          const diffPercent = isDifferent ? calculateSimpleDiff(baselineContent, afterContent) : 0;
          
          const status = diffPercent > CONFIG.DIFF_THRESHOLD ? 'NG' : 'OK';
          
          results.push({
            url,
            isDifferent,
            diffPercent: Math.round(diffPercent * 100) / 100,
            status
          });
          
          console.log(`${status === 'NG' ? '⚠️' : '✅'} ${url}: ${diffPercent.toFixed(1)}%`);
          
        } else {
          results.push({
            url,
            isDifferent: false,
            diffPercent: 0,
            status: 'SKIP',
            error: 'ファイルが見つかりません'
          });
        }
        
      } catch (error) {
        console.error(`❌ 比較エラー ${url}:`, error.message);
        results.push({
          url,
          isDifferent: false,
          diffPercent: 0,
          status: 'ERROR',
          error: error.message
        });
      }
    });
    
  } catch (error) {
    console.error('❌ 比較処理エラー:', error);
  }
  
  const ngCount = results.filter(r => r.status === 'NG').length;
  console.log(`✅ 差分比較完了: ${ngCount}/${results.length} ページで差分検出`);
  
  return results;
}

/**
 * 簡易差分計算
 */
function calculateSimpleDiff(content1, content2) {
  if (content1 === content2) return 0;
  
  // 文字数ベースの簡易計算
  const len1 = content1.length;
  const len2 = content2.length;
  const maxLen = Math.max(len1, len2);
  
  if (maxLen === 0) return 0;
  
  // 文字数差分を計算
  const diffRatio = Math.abs(len1 - len2) / maxLen;
  
  // HTMLタグを除去して内容を比較
  const text1 = content1.replace(/<[^>]*>/g, '').trim();
  const text2 = content2.replace(/<[^>]*>/g, '').trim();
  
  if (text1 === text2) {
    return Math.min(diffRatio * 100, 1); // HTMLのみの変更は軽微
  }
  
  return Math.max(diffRatio * 100, 5); // 内容変更は最低5%
}

/**
 * 最新ファイル取得
 */
function getLatestFileFromFolder(parentFolder, filename) {
  const folders = parentFolder.getFolders();
  let latestFile = null;
  let latestDate = new Date(0);
  
  while (folders.hasNext()) {
    const dateFolder = folders.next();
    const files = dateFolder.getFilesByName(filename);
    
    if (files.hasNext()) {
      const file = files.next();
      const folderDate = new Date(dateFolder.getName().replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
      
      if (folderDate > latestDate) {
        latestDate = folderDate;
        latestFile = file;
      }
    }
  }
  
  return latestFile;
}

/**
 * サイト管理シート作成
 */
function createSiteManagementSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('サイト管理');
  if (sheet) {
    sheet.clear();
  } else {
    sheet = spreadsheet.insertSheet('サイト管理', 0);
  }
  
  // ヘッダー設定
  const headers = ['サイト名', 'URL', '最終チェック', 'ステータス', '備考'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#4285f4');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  
  // サンプルデータ
  const sampleData = [
    ['会社サイト', 'https://example.com', '', '', 'メインサイト'],
    ['ブログ', 'https://blog.example.com', '', '', 'ブログサイト']
  ];
  sheet.getRange(2, 1, sampleData.length, sampleData[0].length).setValues(sampleData);
  
  // 列幅調整
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 250);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 200);
  
  // 境界線
  sheet.getRange(1, 1, sheet.getLastRow() || 10, headers.length).setBorder(true, true, true, true, true, true);
  
  console.log('✅ サイト管理シート作成完了');
}

/**
 * VRT結果シート作成
 */
function createResultsSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('VRT結果');
  if (sheet) {
    sheet.clear();
  } else {
    sheet = spreadsheet.insertSheet('VRT結果', 1);
  }
  
  const headers = ['実行日時', 'サイト名', 'URL', 'モード', 'チェックページ数', '差分ページ数', 'ステータス', '詳細'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#34a853');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  
  // 列幅調整
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 80);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 120);
  sheet.setColumnWidth(7, 100);
  sheet.setColumnWidth(8, 250);
  
  console.log('✅ VRT結果シート作成完了');
}

/**
 * 設定シート作成
 */
function createConfigSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('設定');
  if (sheet) {
    sheet.clear();
  } else {
    sheet = spreadsheet.insertSheet('設定', 2);
  }
  
  const config = [
    ['設定項目', '値', '説明'],
    ['差分閾値（%）', CONFIG.DIFF_THRESHOLD, '差分と判定する閾値（この値以上で NG）'],
    ['最大URL数', CONFIG.MAX_URLS, 'クロールする最大URL数'],
    ['画面幅', CONFIG.SCREENSHOT.width, 'スクリーンショットの幅（px）'],
    ['画面高さ', CONFIG.SCREENSHOT.height, 'スクリーンショットの高さ（px）'],
    ['', '', ''],
    ['Slack Webhook URL', '', 'Slack通知用のWebhook URL（任意）'],
    ['Discord Webhook URL', '', 'Discord通知用のWebhook URL（任意）'],
    ['通知メール', '', '結果通知用のメールアドレス（任意）']
  ];
  
  sheet.getRange(1, 1, config.length, config[0].length).setValues(config);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  sheet.getRange(1, 1, 1, 3).setBackground('#ff9900');
  sheet.getRange(1, 1, 1, 3).setFontColor('#ffffff');
  
  // 列幅調整
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 350);
  
  console.log('✅ 設定シート作成完了');
}

/**
 * ヘルパー関数
 */
function getSiteData(sheet, row) {
  const range = sheet.getRange(row, 1, 1, 5);
  const values = range.getValues()[0];
  
  return {
    name: values[0] || '',
    url: values[1] || '',
    lastCheck: values[2] || '',
    status: values[3] || '',
    note: values[4] || ''
  };
}

function getOrCreateFolder(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(name);
  }
}

function updateResultsSheet(spreadsheet, siteData, result) {
  const sheet = spreadsheet.getSheetByName('VRT結果');
  const details = result.error || (result.details ? `${result.details.filter(d => d.status === 'NG').length} ページで差分検出` : '正常完了');
  
  const newRow = [
    new Date(),
    siteData.name,
    siteData.url,
    result.mode,
    result.totalPages,
    result.diffPages,
    result.status,
    details
  ];
  
  sheet.appendRow(newRow);
  
  // ステータスに応じて色を設定
  const lastRow = sheet.getLastRow();
  const statusCell = sheet.getRange(lastRow, 7);
  if (result.status === 'OK') {
    statusCell.setBackground('#d9ead3');
  } else if (result.status === 'NG') {
    statusCell.setBackground('#f4cccc');
  } else {
    statusCell.setBackground('#fff2cc');
  }
  
  // サイト管理シートも更新
  const siteSheet = spreadsheet.getSheetByName('サイト管理');
  const activeRange = siteSheet.getActiveRange();
  const row = activeRange.getRow();
  
  if (row >= 2) {
    siteSheet.getRange(row, 3).setValue(new Date());
    siteSheet.getRange(row, 4).setValue(result.status);
  }
  
  console.log('✅ 結果シート更新完了');
}

/**
 * 🎯 使い方ガイド表示
 */
function showUsageGuide() {
  const message = `🎯 WordPress VRT 使い方ガイド\\n\\n` +
    `📋 基本的な使い方:\\n` +
    `1. setupWordPressVRT() - 初回セットアップ\\n` +
    `2. サイト管理シートでサイト情報を入力\\n` +
    `3. チェックしたいサイトの行を選択\\n` +
    `4. 以下の関数を実行:\\n\\n` +
    `🚀 メイン機能:\\n` +
    `・runFullVRTCheck() - フルVRTチェック\\n` +
    `・takeBaseline() - ベースライン撮影のみ\\n` +
    `・takeAfter() - アフター撮影のみ\\n` +
    `・compareOnly() - 差分比較のみ\\n\\n` +
    `📊 結果確認:\\n` +
    `・VRT結果シート - 実行履歴\\n` +
    `・Google Drive - スクリーンショット\\n\\n` +
    `🔄 推奨ワークフロー:\\n` +
    `1. takeBaseline() - 更新前撮影\\n` +
    `2. WordPressを手動更新\\n` +
    `3. takeAfter() - 更新後撮影\\n` +
    `4. compareOnly() - 差分確認`;
  
  Browser.msgBox('WordPress VRT 使い方ガイド', message, Browser.Buttons.OK);
}