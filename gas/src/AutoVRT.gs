/**
 * 設定不要の自動VRTシステム
 * GASに追加するだけで動作する簡単自動化
 */

/**
 * 自動VRT実行の初期設定（1回だけ実行）
 */
function setupAutoVRT() {
  // 既存のトリガーをクリア
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  // 毎日午前3時にBaseline撮影
  ScriptApp.newTrigger('autoTakeBaseline')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();
  
  // 毎日午前9時にAfter撮影＋比較
  ScriptApp.newTrigger('autoTakeAfterAndCompare')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
  
  // 毎週日曜日午前10時に週次レポート
  ScriptApp.newTrigger('autoWeeklyReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(10)
    .create();
  
  console.log('自動VRTが設定されました');
  console.log('- 毎日3時: Baseline撮影');
  console.log('- 毎日9時: After撮影＋比較');
  console.log('- 毎週日曜10時: 週次レポート');
}

/**
 * 自動Baseline撮影（毎日3時実行）
 */
function autoTakeBaseline() {
  try {
    console.log('自動Baseline撮影を開始');
    
    const sites = getSiteList();
    const results = [];
    
    for (const site of sites) {
      try {
        // Baseline撮影を実行
        const result = triggerVRTCheck(site.id, 'baseline');
        results.push({
          siteId: site.id,
          siteName: site.name,
          status: result.success ? 'SUCCESS' : 'FAILED',
          urls: result.urls || 0
        });
        
        // API制限を避けるため少し待機
        Utilities.sleep(5000);
        
      } catch (error) {
        console.error(`Baseline撮影失敗: ${site.name}`, error);
        results.push({
          siteId: site.id,
          siteName: site.name,
          status: 'ERROR',
          error: error.message
        });
      }
    }
    
    // 結果をログに記録
    logAutoVRTResult('baseline', results);
    
    console.log(`自動Baseline撮影完了: ${results.length}サイト`);
    
  } catch (error) {
    console.error('自動Baseline撮影でエラー:', error);
    notifyError('自動Baseline撮影', error.message);
  }
}

/**
 * 自動After撮影＋比較（毎日9時実行）
 */
function autoTakeAfterAndCompare() {
  try {
    console.log('自動After撮影＋比較を開始');
    
    const sites = getSiteList();
    const results = [];
    const ngSites = [];
    
    for (const site of sites) {
      try {
        // After撮影を実行
        const afterResult = triggerVRTCheck(site.id, 'after');
        
        // 少し待機してから比較実行
        Utilities.sleep(30000);
        
        // 比較実行
        const compareResult = triggerVRTCheck(site.id, 'compare');
        
        const result = {
          siteId: site.id,
          siteName: site.name,
          afterStatus: afterResult.success ? 'SUCCESS' : 'FAILED',
          compareStatus: compareResult.success ? 'SUCCESS' : 'FAILED',
          ngCount: compareResult.ngCount || 0,
          totalUrls: compareResult.totalUrls || 0
        };
        
        results.push(result);
        
        // NGがある場合は通知対象に追加
        if (result.ngCount > 0) {
          ngSites.push(result);
        }
        
        // API制限を避けるため少し待機
        Utilities.sleep(5000);
        
      } catch (error) {
        console.error(`After撮影＋比較失敗: ${site.name}`, error);
        results.push({
          siteId: site.id,
          siteName: site.name,
          status: 'ERROR',
          error: error.message
        });
      }
    }
    
    // 結果をログに記録
    logAutoVRTResult('after_compare', results);
    
    // NGがある場合は通知
    if (ngSites.length > 0) {
      notifyNGResults(ngSites);
    }
    
    console.log(`自動After撮影＋比較完了: ${results.length}サイト (NG: ${ngSites.length})`);
    
  } catch (error) {
    console.error('自動After撮影＋比較でエラー:', error);
    notifyError('自動After撮影＋比較', error.message);
  }
}

/**
 * 週次レポート生成（毎週日曜10時実行）
 */
function autoWeeklyReport() {
  try {
    console.log('週次レポート生成を開始');
    
    // 過去7日分の結果を集計
    const weeklyData = getWeeklyVRTData();
    
    // レポートを生成
    const report = generateWeeklyReport(weeklyData);
    
    // Slack/Discord通知
    notifyWeeklyReport(report);
    
    console.log('週次レポート生成完了');
    
  } catch (error) {
    console.error('週次レポート生成でエラー:', error);
    notifyError('週次レポート生成', error.message);
  }
}

/**
 * 手動で即座に全サイトチェック実行
 */
function runFullAutoCheck() {
  try {
    console.log('手動フルチェックを開始');
    
    const sites = getSiteList();
    const results = [];
    
    for (const site of sites) {
      try {
        // Full実行（Baseline → After → Compare）
        const result = triggerVRTCheck(site.id, 'full');
        
        results.push({
          siteId: site.id,
          siteName: site.name,
          status: result.success ? 'SUCCESS' : 'FAILED',
          ngCount: result.ngCount || 0,
          totalUrls: result.totalUrls || 0
        });
        
        // サイト間で少し待機
        Utilities.sleep(10000);
        
      } catch (error) {
        console.error(`フルチェック失敗: ${site.name}`, error);
        results.push({
          siteId: site.id,
          siteName: site.name,
          status: 'ERROR',
          error: error.message
        });
      }
    }
    
    // 結果の通知
    const ngSites = results.filter(r => r.ngCount > 0);
    if (ngSites.length > 0) {
      notifyNGResults(ngSites);
    }
    
    console.log(`手動フルチェック完了: ${results.length}サイト (NG: ${ngSites.length})`);
    return results;
    
  } catch (error) {
    console.error('手動フルチェックでエラー:', error);
    notifyError('手動フルチェック', error.message);
    throw error;
  }
}

/**
 * 自動VRT結果のログ記録
 */
function logAutoVRTResult(type, results) {
  const sheet = getSheet('自動実行ログ');
  if (!sheet) return;
  
  const timestamp = new Date();
  
  for (const result of results) {
    sheet.appendRow([
      timestamp,
      type,
      result.siteId,
      result.siteName,
      result.status,
      result.ngCount || 0,
      result.totalUrls || 0,
      result.error || ''
    ]);
  }
}

/**
 * NG結果の通知
 */
function notifyNGResults(ngSites) {
  const message = createNGNotificationMessage(ngSites);
  
  // Slack通知
  const slackUrl = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
  if (slackUrl) {
    sendSlackNotification(slackUrl, message);
  }
  
  // Discord通知
  const discordUrl = PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK_URL');
  if (discordUrl) {
    sendDiscordNotification(discordUrl, message);
  }
  
  // メール通知
  const email = PropertiesService.getScriptProperties().getProperty('NOTIFICATION_EMAIL');
  if (email) {
    MailApp.sendEmail({
      to: email,
      subject: '【WordPress VRT】差分検出アラート',
      body: message.text,
      htmlBody: createEmailHTML(ngSites)
    });
  }
}

/**
 * エラー通知
 */
function notifyError(operation, errorMessage) {
  const message = {
    text: `🚨 WordPress VRT エラー`,
    attachments: [{
      color: 'danger',
      fields: [
        { title: '操作', value: operation, short: true },
        { title: 'エラー', value: errorMessage, short: false },
        { title: '時刻', value: new Date().toLocaleString('ja-JP'), short: true }
      ]
    }]
  };
  
  // 通知送信
  const slackUrl = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
  if (slackUrl) {
    sendSlackNotification(slackUrl, message);
  }
}

/**
 * NG通知メッセージの作成
 */
function createNGNotificationMessage(ngSites) {
  const totalNG = ngSites.reduce((sum, site) => sum + site.ngCount, 0);
  
  return {
    text: `⚠️ WordPress VRT 差分検出`,
    attachments: [{
      color: 'warning',
      fields: [
        { title: 'NG サイト数', value: ngSites.length.toString(), short: true },
        { title: '総差分ページ数', value: totalNG.toString(), short: true },
        { title: '詳細', value: ngSites.map(site => `${site.siteName}: ${site.ngCount}件`).join('\n'), short: false }
      ]
    }]
  };
}

/**
 * 過去7日分のVRTデータ取得
 */
function getWeeklyVRTData() {
  const sheet = getSheet('自動実行ログ');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  return rows.filter(row => {
    const timestamp = new Date(row[0]);
    return timestamp >= weekAgo;
  });
}

/**
 * 週次レポート生成
 */
function generateWeeklyReport(weeklyData) {
  const totalChecks = weeklyData.length;
  const errorCount = weeklyData.filter(row => row[4] === 'ERROR').length;
  const ngCount = weeklyData.filter(row => row[5] > 0).length;
  
  return {
    totalChecks,
    errorCount,
    ngCount,
    successRate: ((totalChecks - errorCount) / totalChecks * 100).toFixed(1)
  };
}

/**
 * 週次レポート通知
 */
function notifyWeeklyReport(report) {
  const message = {
    text: `📊 WordPress VRT 週次レポート`,
    attachments: [{
      color: 'good',
      fields: [
        { title: '総実行回数', value: report.totalChecks.toString(), short: true },
        { title: '成功率', value: `${report.successRate}%`, short: true },
        { title: 'エラー回数', value: report.errorCount.toString(), short: true },
        { title: 'NG検出回数', value: report.ngCount.toString(), short: true }
      ]
    }]
  };
  
  // 通知送信
  const slackUrl = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
  if (slackUrl) {
    sendSlackNotification(slackUrl, message);
  }
}

/**
 * Slack通知送信
 */
function sendSlackNotification(webhookUrl, message) {
  try {
    UrlFetchApp.fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(message)
    });
  } catch (error) {
    console.error('Slack通知送信エラー:', error);
  }
}

/**
 * Discord通知送信
 */
function sendDiscordNotification(webhookUrl, message) {
  try {
    const discordMessage = {
      content: message.text,
      embeds: message.attachments.map(att => ({
        color: att.color === 'warning' ? 0xFFA500 : att.color === 'danger' ? 0xFF0000 : 0x00FF00,
        fields: att.fields.map(field => ({
          name: field.title,
          value: field.value,
          inline: field.short
        }))
      }))
    };
    
    UrlFetchApp.fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(discordMessage)
    });
  } catch (error) {
    console.error('Discord通知送信エラー:', error);
  }
}

/**
 * メール用HTML作成
 */
function createEmailHTML(ngSites) {
  let html = '<h2>WordPress VRT 差分検出レポート</h2>';
  html += '<table border="1" style="border-collapse: collapse;">';
  html += '<tr><th>サイト名</th><th>差分ページ数</th><th>総ページ数</th></tr>';
  
  for (const site of ngSites) {
    html += `<tr><td>${site.siteName}</td><td>${site.ngCount}</td><td>${site.totalUrls}</td></tr>`;
  }
  
  html += '</table>';
  html += `<p>詳細は<a href="${getSheetUrl()}">Google Sheets</a>をご確認ください。</p>`;
  
  return html;
}