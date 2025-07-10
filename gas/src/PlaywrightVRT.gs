/**
 * 🚀 WordPress VRT with Playwright - Google Apps Script版
 * 高精度スクリーンショット比較システム（Cloud Functions連携）
 */

// Cloud Functions設定
const CLOUD_FUNCTION_URL = 'https://us-central1-urlsearch-423209.cloudfunctions.net/wordpress-vrt';

// 設定
const CONFIG = {
  DIFF_THRESHOLD: 2.0,
  MAX_URLS: 100,
  DEVICES: ['desktop', 'mobile'],
  SCREENSHOT: {
    desktop: { width: 1920, height: 1080 },
    mobile: { width: 375, height: 667 }
  }
};

/**
 * 🎯 初期セットアップ（Playwright版）
 */
function setupPlaywrightVRT() {
  try {
    console.log('🚀 Playwright WordPress VRT セットアップ開始...');
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. サイト管理シート作成（拡張版）
    createAdvancedSiteManagementSheet(sheet);
    
    // 2. VRT結果シート作成（詳細版）
    createAdvancedResultsSheet(sheet);
    
    // 3. 差分詳細シート作成
    createDiffDetailsSheet(sheet);
    
    // 4. 設定シート作成（Playwright版）
    createPlaywrightConfigSheet(sheet);
    
    // 5. ダッシュボードシート作成
    createDashboardSheet(sheet);
    
    // 6. 設定保存
    PropertiesService.getScriptProperties().setProperties({
      'PLAYWRIGHT_VRT_SETUP': 'true',
      'SETUP_DATE': new Date().toISOString(),
      'CLOUD_FUNCTION_URL': CLOUD_FUNCTION_URL
    });
    
    // 7. 完了メッセージ
    Browser.msgBox(
      '🎉 Playwright WordPress VRT セットアップ完了！',
      '✅ 高精度画像比較システムが利用可能になりました\\n\\n' +
      '📋 新機能:\\n' +
      '・ピクセル単位での精密差分検出\\n' +
      '・デスクトップ＋モバイル対応\\n' +
      '・WordPress特化の最適化\\n' +
      '・差分画像の自動生成\\n' +
      '・リアルタイム通知\\n\\n' +
      '🚀 次のステップ:\\n' +
      '1. サイト管理シートでサイト情報を入力\\n' +
      '2. runHighPrecisionVRT()でテスト実行\\n' +
      '3. ダッシュボードで結果確認',
      Browser.Buttons.OK
    );
    
    console.log('✅ Playwright VRT セットアップ完了');
    
  } catch (error) {
    console.error('❌ セットアップエラー:', error);
    Browser.msgBox('エラー', 'セットアップ中にエラーが発生しました:\\n' + error.message, Browser.Buttons.OK);
  }
}

/**
 * 🎯 高精度VRTチェック実行
 */
function runHighPrecisionVRT() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const siteSheet = sheet.getSheetByName('サイト管理');
    
    if (!siteSheet) {
      Browser.msgBox('エラー', '先にsetupPlaywrightVRT()を実行してください。', Browser.Buttons.OK);
      return;
    }
    
    // アクティブな行のサイト情報を取得
    const activeRange = siteSheet.getActiveRange();
    const row = activeRange.getRow();
    
    if (row < 2) {
      Browser.msgBox('使い方', 'チェックしたいサイトの行を選択してから実行してください。', Browser.Buttons.OK);
      return;
    }
    
    const siteData = getAdvancedSiteData(siteSheet, row);
    if (!siteData.url) {
      Browser.msgBox('エラー', '有効なURLが入力されていません。', Browser.Buttons.OK);
      return;
    }
    
    Browser.msgBox('開始', 
      `🎯 高精度WordPress VRTを開始します\\n\\n` +
      `📊 実行内容:\\n` +
      `・サイト: ${siteData.name}\\n` +
      `・URL: ${siteData.url}\\n` +
      `・デバイス: ${siteData.devices.join(', ')}\\n\\n` +
      `⏱ 処理時間: 約2-5分\\n` +
      `💡 進行状況は「VRT結果」シートで確認できます`, 
      Browser.Buttons.OK);
    
    // Cloud FunctionsでフルVRT実行
    const result = callCloudFunction('full-vrt', {
      url: siteData.url,
      siteId: siteData.id,
      devices: siteData.devices
    });
    
    // 結果をシートに保存
    updateAdvancedResultsSheet(sheet, siteData, result);
    
    // 差分詳細を保存
    if (result.results) {
      updateDiffDetailsSheet(sheet, result);
    }
    
    // ダッシュボード更新
    updateDashboard(sheet);
    
    // 結果表示
    const ngCount = result.summary ? result.summary.ng : 0;
    const totalCount = result.summary ? result.summary.total : 0;
    
    const message = `🎉 高精度VRT完了！\\n\\n` +
      `📊 結果サマリー:\\n` +
      `・チェック対象: ${totalCount} デバイス\\n` +
      `・差分検出: ${ngCount} 件\\n` +
      `・判定: ${ngCount > 0 ? '⚠️ NG (要確認)' : '✅ OK'}\\n\\n` +
      `📁 詳細確認:\\n` +
      `・VRT結果シート: 実行履歴\\n` +
      `・差分詳細シート: ピクセル単位詳細\\n` +
      `・ダッシュボード: 総合状況\\n\\n` +
      `${ngCount > 0 ? '⚠️ 差分画像はCloud Storageで確認可能' : ''}`;
    
    Browser.msgBox('完了', message, Browser.Buttons.OK);
    
  } catch (error) {
    console.error('❌ 高精度VRTエラー:', error);
    Browser.msgBox('エラー', 'VRTチェック中にエラーが発生しました:\\n' + error.message, Browser.Buttons.OK);
  }
}

/**
 * 🎯 ベースライン撮影（高精度版）
 */
function takeHighPrecisionBaseline() {
  executePlaywrightMode('baseline', 'ベースライン撮影（高精度）');
}

/**
 * 🎯 アフター撮影（高精度版）
 */
function takeHighPrecisionAfter() {
  executePlaywrightMode('after', 'アフター撮影（高精度）');
}

/**
 * 🎯 高精度比較のみ
 */
function compareHighPrecision() {
  executePlaywrightMode('compare', '高精度比較');
}

/**
 * 🎯 バッチVRT実行
 */
function runBatchHighPrecisionVRT() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const siteSheet = sheet.getSheetByName('サイト管理');
    
    // 全サイトのデータを取得
    const sites = getAllSiteData(siteSheet);
    
    if (sites.length === 0) {
      Browser.msgBox('エラー', '実行対象のサイトがありません。', Browser.Buttons.OK);
      return;
    }
    
    const confirmed = Browser.msgBox('確認', 
      `🔄 バッチVRTを実行します\\n\\n` +
      `📊 対象サイト: ${sites.length} 件\\n` +
      `⏱ 予想時間: 約${Math.ceil(sites.length * 3)} 分\\n\\n` +
      `実行しますか？`, 
      Browser.Buttons.YES_NO);
    
    if (confirmed !== Browser.Buttons.YES) return;
    
    Browser.msgBox('開始', 'バッチVRTを開始します。\\n処理完了まで他の操作を控えてください。', Browser.Buttons.OK);
    
    // Cloud Functionsでバッチ実行
    const result = callCloudFunction('batch-vrt', { sites });
    
    // 結果を一括更新
    updateBatchResults(sheet, result);
    updateDashboard(sheet);
    
    const message = `🎉 バッチVRT完了！\\n\\n` +
      `📊 実行結果:\\n` +
      `・処理サイト数: ${result.totalSites}\\n` +
      `・成功: ${result.summary.success}\\n` +
      `・エラー: ${result.summary.error}\\n` +
      `・NG検出: ${result.summary.ng}\\n\\n` +
      `📈 詳細はダッシュボードで確認してください`;
    
    Browser.msgBox('完了', message, Browser.Buttons.OK);
    
  } catch (error) {
    console.error('❌ バッチVRTエラー:', error);
    Browser.msgBox('エラー', 'バッチVRT中にエラーが発生しました:\\n' + error.message, Browser.Buttons.OK);
  }
}

/**
 * Playwright特定モード実行
 */
function executePlaywrightMode(mode, modeName) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const siteSheet = sheet.getSheetByName('サイト管理');
    const activeRange = siteSheet.getActiveRange();
    const row = activeRange.getRow();
    
    if (row < 2) {
      Browser.msgBox('使い方', 'チェックしたいサイトの行を選択してから実行してください。', Browser.Buttons.OK);
      return;
    }
    
    const siteData = getAdvancedSiteData(siteSheet, row);
    if (!siteData.url) {
      Browser.msgBox('エラー', '有効なURLが入力されていません。', Browser.Buttons.OK);
      return;
    }
    
    Browser.msgBox('開始', `${modeName}を開始します。\\nデバイス: ${siteData.devices.join(', ')}`, Browser.Buttons.OK);
    
    let result;
    if (mode === 'compare') {
      // 比較のみの場合は既存の画像を使用
      result = callCloudFunction('compare', {
        siteId: siteData.id,
        devices: siteData.devices
      });
    } else {
      // スクリーンショット撮影
      result = callCloudFunction('screenshot', {
        url: siteData.url,
        siteId: siteData.id,
        type: mode,
        devices: siteData.devices
      });
    }
    
    updateAdvancedResultsSheet(sheet, siteData, { mode, ...result });
    
    let message = `✅ ${modeName}完了！`;
    if (mode === 'compare' && result.comparisons) {
      const ngCount = result.comparisons.filter(c => c.status === 'NG').length;
      message += `\\n・差分検出: ${ngCount} 件\\n・判定: ${ngCount > 0 ? 'NG' : 'OK'}`;
    }
    
    Browser.msgBox('完了', message, Browser.Buttons.OK);
    
  } catch (error) {
    Browser.msgBox('エラー', `${modeName}中にエラーが発生しました:\\n${error.message}`, Browser.Buttons.OK);
  }
}

/**
 * Cloud Functions呼び出し
 */
function callCloudFunction(action, params) {
  const url = PropertiesService.getScriptProperties().getProperty('CLOUD_FUNCTION_URL') || CLOUD_FUNCTION_URL;
  
  const payload = {
    action: action,
    ...params
  };
  
  console.log(`☁️ Cloud Functions呼び出し: ${action}`, payload);
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const responseText = response.getContentText();
  
  if (response.getResponseCode() !== 200) {
    throw new Error(`Cloud Functions エラー (${response.getResponseCode()}): ${responseText}`);
  }
  
  const result = JSON.parse(responseText);
  if (!result.success) {
    throw new Error(`VRT処理エラー: ${result.error}`);
  }
  
  console.log('✅ Cloud Functions呼び出し成功');
  return result.result;
}

/**
 * 拡張サイト管理シート作成
 */
function createAdvancedSiteManagementSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('サイト管理');
  if (sheet) {
    sheet.clear();
  } else {
    sheet = spreadsheet.insertSheet('サイト管理', 0);
  }
  
  // ヘッダー設定（拡張版）
  const headers = [
    'サイトID', 'サイト名', 'URL', 'デバイス', 
    '最終チェック', 'ステータス', '差分検出数', '閾値(%)', '備考'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#1a73e8');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  
  // サンプルデータ（拡張版）
  const sampleData = [
    ['site001', '会社サイト', 'https://example.com', 'desktop,mobile', '', '', '', '2.0', 'メインサイト'],
    ['site002', 'ブログ', 'https://blog.example.com', 'desktop', '', '', '', '2.0', 'ブログサイト'],
    ['site003', 'ECサイト', 'https://shop.example.com', 'desktop,mobile', '', '', '', '1.0', 'ECサイト（厳格チェック）']
  ];
  sheet.getRange(2, 1, sampleData.length, sampleData[0].length).setValues(sampleData);
  
  // 列幅調整
  const columnWidths = [100, 150, 250, 120, 150, 100, 100, 80, 200];
  columnWidths.forEach((width, index) => {
    sheet.setColumnWidth(index + 1, width);
  });
  
  // データ検証（デバイス選択）
  const deviceValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(['desktop', 'mobile', 'desktop,mobile'])
    .setAllowInvalid(false)
    .setHelpText('desktop, mobile, または desktop,mobile を選択')
    .build();
  sheet.getRange('D:D').setDataValidation(deviceValidation);
  
  // 境界線
  sheet.getRange(1, 1, sheet.getLastRow() || 10, headers.length).setBorder(true, true, true, true, true, true);
  
  console.log('✅ 拡張サイト管理シート作成完了');
}

/**
 * 拡張VRT結果シート作成
 */
function createAdvancedResultsSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('VRT結果');
  if (sheet) {
    sheet.clear();
  } else {
    sheet = spreadsheet.insertSheet('VRT結果', 1);
  }
  
  const headers = [
    '実行日時', 'サイトID', 'サイト名', 'URL', 'モード', 'デバイス',
    'ステータス', '差分率(%)', '差分ピクセル数', '閾値(%)', '詳細'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#137333');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  
  // 列幅調整
  const columnWidths = [140, 100, 150, 200, 80, 100, 80, 100, 120, 80, 250];
  columnWidths.forEach((width, index) => {
    sheet.setColumnWidth(index + 1, width);
  });
  
  console.log('✅ 拡張VRT結果シート作成完了');
}

/**
 * 差分詳細シート作成
 */
function createDiffDetailsSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('差分詳細');
  if (sheet) {
    sheet.clear();
  } else {
    sheet = spreadsheet.insertSheet('差分詳細', 2);
  }
  
  const headers = [
    '日時', 'サイトID', 'デバイス', 'ベースライン画像', 'アフター画像', 
    '差分画像', '差分率(%)', '差分ピクセル数', '画像サイズ', 'ステータス'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#b45309');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  
  // 列幅調整
  const columnWidths = [140, 100, 80, 200, 200, 200, 100, 120, 100, 80];
  columnWidths.forEach((width, index) => {
    sheet.setColumnWidth(index + 1, width);
  });
  
  console.log('✅ 差分詳細シート作成完了');
}

/**
 * Playwright設定シート作成
 */
function createPlaywrightConfigSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('Playwright設定');
  if (sheet) {
    sheet.clear();
  } else {
    sheet = spreadsheet.insertSheet('Playwright設定', 3);
  }
  
  const config = [
    ['設定項目', '値', '説明'],
    ['Cloud Functions URL', CLOUD_FUNCTION_URL, 'Playwright実行用Cloud Functions URL'],
    ['差分閾値（%）', CONFIG.DIFF_THRESHOLD, '差分と判定する閾値'],
    ['最大URL数', CONFIG.MAX_URLS, 'クロールする最大URL数'],
    ['デスクトップ解像度', `${CONFIG.SCREENSHOT.desktop.width}x${CONFIG.SCREENSHOT.desktop.height}`, 'デスクトップスクリーンショット解像度'],
    ['モバイル解像度', `${CONFIG.SCREENSHOT.mobile.width}x${CONFIG.SCREENSHOT.mobile.height}`, 'モバイルスクリーンショット解像度'],
    ['', '', ''],
    ['Slack Webhook URL', '', 'Slack通知用のWebhook URL'],
    ['Discord Webhook URL', '', 'Discord通知用のWebhook URL'],
    ['通知メール', '', '結果通知用のメールアドレス'],
    ['', '', ''],
    ['高精度モード', 'true', 'Playwright高精度モード有効/無効'],
    ['並列処理数', '3', '同時処理可能なサイト数'],
    ['タイムアウト(秒)', '60', 'ページ読み込みタイムアウト']
  ];
  
  sheet.getRange(1, 1, config.length, config[0].length).setValues(config);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  sheet.getRange(1, 1, 1, 3).setBackground('#9c27b0');
  sheet.getRange(1, 1, 1, 3).setFontColor('#ffffff');
  
  // 列幅調整
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 250);
  sheet.setColumnWidth(3, 350);
  
  console.log('✅ Playwright設定シート作成完了');
}

/**
 * ダッシュボードシート作成
 */
function createDashboardSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName('ダッシュボード');
  if (sheet) {
    sheet.clear();
  } else {
    sheet = spreadsheet.insertSheet('ダッシュボード', 4);
  }
  
  // タイトル
  sheet.getRange('A1').setValue('🎯 WordPress VRT ダッシュボード');
  sheet.getRange('A1').setFontSize(16).setFontWeight('bold');
  
  // サマリーセクション
  const summaryHeaders = [
    ['📊 サマリー', ''],
    ['総サイト数', '=COUNTA(サイト管理!A:A)-1'],
    ['今日の実行数', '=COUNTIF(VRT結果!A:A,TODAY())'],
    ['NG検出数', '=COUNTIF(VRT結果!G:G,"NG")'],
    ['平均差分率', '=AVERAGE(VRT結果!H:H)'],
    ['', ''],
    ['📱 デバイス別', ''],
    ['デスクトップOK', '=COUNTIFS(VRT結果!F:F,"desktop",VRT結果!G:G,"OK")'],
    ['デスクトップNG', '=COUNTIFS(VRT結果!F:F,"desktop",VRT結果!G:G,"NG")'],
    ['モバイルOK', '=COUNTIFS(VRT結果!F:F,"mobile",VRT結果!G:G,"OK")'],
    ['モバイルNG', '=COUNTIFS(VRT結果!F:F,"mobile",VRT結果!G:G,"NG")']
  ];
  
  sheet.getRange(3, 1, summaryHeaders.length, 2).setValues(summaryHeaders);
  
  // セクションヘッダーの装飾
  sheet.getRange('A3').setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange('A9').setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold');
  
  // 列幅調整
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 150);
  
  console.log('✅ ダッシュボードシート作成完了');
}

/**
 * ヘルパー関数群
 */
function getAdvancedSiteData(sheet, row) {
  const range = sheet.getRange(row, 1, 1, 9);
  const values = range.getValues()[0];
  
  return {
    id: values[0] || `site_${Date.now()}`,
    name: values[1] || '',
    url: values[2] || '',
    devices: (values[3] || 'desktop').split(',').map(d => d.trim()),
    lastCheck: values[4] || '',
    status: values[5] || '',
    diffCount: values[6] || 0,
    threshold: parseFloat(values[7]) || CONFIG.DIFF_THRESHOLD,
    note: values[8] || ''
  };
}

function getAllSiteData(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  const sites = [];
  for (let row = 2; row <= lastRow; row++) {
    const siteData = getAdvancedSiteData(sheet, row);
    if (siteData.url) {
      sites.push(siteData);
    }
  }
  return sites;
}

function updateAdvancedResultsSheet(spreadsheet, siteData, result) {
  const sheet = spreadsheet.getSheetByName('VRT結果');
  
  if (result.results) {
    // フルVRT結果の場合
    result.results.forEach(deviceResult => {
      const comparison = deviceResult.comparison;
      const newRow = [
        new Date(),
        siteData.id,
        siteData.name,
        siteData.url,
        'full',
        deviceResult.device,
        comparison.status,
        comparison.diffPercentage,
        comparison.diffPixels,
        comparison.threshold,
        `${comparison.diffPixels}px差分検出`
      ];
      sheet.appendRow(newRow);
      
      // ステータスに応じて色を設定
      const lastRow = sheet.getLastRow();
      const statusCell = sheet.getRange(lastRow, 7);
      if (comparison.status === 'OK') {
        statusCell.setBackground('#d9ead3');
      } else if (comparison.status === 'NG') {
        statusCell.setBackground('#f4cccc');
      }
    });
  } else {
    // 単一操作の場果
    const newRow = [
      new Date(),
      siteData.id,
      siteData.name,
      siteData.url,
      result.mode || 'unknown',
      siteData.devices.join(','),
      result.status || 'OK',
      '',
      '',
      siteData.threshold,
      result.error || '正常完了'
    ];
    sheet.appendRow(newRow);
  }
  
  console.log('✅ 拡張結果シート更新完了');
}

function updateDiffDetailsSheet(spreadsheet, result) {
  const sheet = spreadsheet.getSheetByName('差分詳細');
  
  if (result.results) {
    result.results.forEach(deviceResult => {
      const comparison = deviceResult.comparison;
      const newRow = [
        new Date(),
        result.siteId,
        deviceResult.device,
        comparison.baselineFile,
        comparison.afterFile,
        comparison.diffFile,
        comparison.diffPercentage,
        comparison.diffPixels,
        `${comparison.dimensions.width}x${comparison.dimensions.height}`,
        comparison.status
      ];
      sheet.appendRow(newRow);
    });
  }
  
  console.log('✅ 差分詳細シート更新完了');
}

function updateDashboard(spreadsheet) {
  // ダッシュボードは数式で自動更新されるため、特別な処理は不要
  console.log('✅ ダッシュボード更新完了');
}

function updateBatchResults(spreadsheet, batchResult) {
  batchResult.results.forEach(siteResult => {
    if (siteResult.results) {
      const siteData = { id: siteResult.siteId, name: siteResult.siteId, url: siteResult.url };
      updateAdvancedResultsSheet(spreadsheet, siteData, siteResult);
      updateDiffDetailsSheet(spreadsheet, siteResult);
    }
  });
  
  console.log('✅ バッチ結果更新完了');
}

/**
 * 🎯 使い方ガイド表示（Playwright版）
 */
function showPlaywrightGuide() {
  const message = `🎯 Playwright WordPress VRT 使い方ガイド\\n\\n` +
    `📋 基本的な使い方:\\n` +
    `1. setupPlaywrightVRT() - 初回セットアップ\\n` +
    `2. サイト管理シートでサイト情報を入力\\n` +
    `3. チェックしたいサイトの行を選択\\n` +
    `4. 以下の関数を実行:\\n\\n` +
    `🚀 高精度機能:\\n` +
    `・runHighPrecisionVRT() - フル高精度チェック\\n` +
    `・takeHighPrecisionBaseline() - 高精度ベースライン\\n` +
    `・takeHighPrecisionAfter() - 高精度アフター\\n` +
    `・compareHighPrecision() - 高精度比較\\n` +
    `・runBatchHighPrecisionVRT() - 全サイト一括\\n\\n` +
    `📊 結果確認:\\n` +
    `・ダッシュボード - 総合状況\\n` +
    `・VRT結果 - 実行履歴\\n` +
    `・差分詳細 - ピクセル単位詳細\\n\\n` +
    `🔄 推奨ワークフロー:\\n` +
    `1. takeHighPrecisionBaseline() - 更新前撮影\\n` +
    `2. WordPressを手動更新\\n` +
    `3. takeHighPrecisionAfter() - 更新後撮影\\n` +
    `4. compareHighPrecision() - 高精度比較`;
  
  Browser.msgBox('Playwright WordPress VRT ガイド', message, Browser.Buttons.OK);
}