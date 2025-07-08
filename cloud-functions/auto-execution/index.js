const functions = require('@google-cloud/functions-framework');
const { Firestore } = require('@google-cloud/firestore');

const firestore = new Firestore();
const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL;

/**
 * 自動でVRT実行を行うCloud Function
 */
functions.http('autoVrtExecution', async (req, res) => {
  console.log('Auto VRT execution triggered:', JSON.stringify(req.body, null, 2));
  
  try {
    const { siteId, siteUrl, mode, trigger } = req.body;
    
    if (!siteId || !mode) {
      return res.status(400).json({ error: 'siteId and mode are required' });
    }
    
    const results = [];
    const startTime = new Date();
    
    console.log(`Starting auto VRT: ${mode} for site ${siteId}`);
    
    if (mode === 'auto-baseline' || mode === 'auto-after-compare') {
      
      if (mode === 'auto-baseline' || mode === 'auto-after-compare') {
        // After スクリーンショット撮影
        console.log('Executing After capture...');
        const afterResult = await callCloudRun('/crawl', {
          mode: 'after',
          url: siteUrl,
          siteId: siteId
        });
        
        results.push({
          step: 'after',
          success: afterResult.success,
          result: afterResult,
          timestamp: new Date()
        });
        
        if (!afterResult.success) {
          throw new Error(`After capture failed: ${afterResult.error}`);
        }
      }
      
      if (mode === 'auto-after-compare') {
        // 比較実行
        console.log('Executing comparison...');
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const compareResult = await callCloudRun('/compare', {
          siteId: siteId,
          date: date
        }, 'POST');
        
        results.push({
          step: 'compare',
          success: compareResult.success,
          result: compareResult,
          timestamp: new Date()
        });
        
        if (!compareResult.success) {
          throw new Error(`Comparison failed: ${compareResult.error}`);
        }
        
        // 結果を通知
        await sendAutoNotification(siteId, siteUrl, compareResult, trigger);
      }
    }
    
    // 実行履歴を保存
    await firestore.collection('auto_executions').add({
      siteId,
      siteUrl,
      mode,
      trigger,
      results,
      success: true,
      startTime,
      endTime: new Date(),
      duration: Date.now() - startTime.getTime()
    });
    
    console.log(`Auto VRT completed successfully for ${siteId}`);
    
    res.json({
      success: true,
      siteId,
      mode,
      trigger,
      results: results.map(r => ({
        step: r.step,
        success: r.success,
        timestamp: r.timestamp
      }))
    });
    
  } catch (error) {
    console.error('Auto VRT execution error:', error);
    
    // エラーを記録
    if (req.body.siteId) {
      await firestore.collection('auto_executions').add({
        siteId: req.body.siteId,
        siteUrl: req.body.siteUrl,
        mode: req.body.mode,
        trigger: req.body.trigger,
        success: false,
        error: error.message,
        timestamp: new Date()
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 定期Baseline撮影
 */
functions.http('autoBaselineCapture', async (req, res) => {
  console.log('Auto baseline capture triggered');
  
  try {
    // 全サイトを取得
    const sitesSnapshot = await firestore.collection('sites').get();
    const sites = sitesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`Found ${sites.length} sites for baseline capture`);
    
    const results = [];
    
    // 並列実行（最大3つまで）
    const batchSize = 3;
    for (let i = 0; i < sites.length; i += batchSize) {
      const batch = sites.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (site) => {
        try {
          console.log(`Capturing baseline for ${site.name} (${site.url})`);
          
          const result = await callCloudRun('/crawl', {
            mode: 'baseline',
            url: site.url,
            siteId: site.id
          });
          
          return {
            siteId: site.id,
            siteName: site.name,
            success: result.success,
            error: result.error || null,
            timestamp: new Date()
          };
          
        } catch (error) {
          console.error(`Baseline capture failed for ${site.name}:`, error);
          return {
            siteId: site.id,
            siteName: site.name,
            success: false,
            error: error.message,
            timestamp: new Date()
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // バッチ間で少し待機
      if (i + batchSize < sites.length) {
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30秒待機
      }
    }
    
    // 結果を保存
    await firestore.collection('auto_baseline_runs').add({
      totalSites: sites.length,
      successCount: results.filter(r => r.success).length,
      errorCount: results.filter(r => !r.success).length,
      results,
      timestamp: new Date()
    });
    
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    
    console.log(`Auto baseline completed: ${successCount} success, ${errorCount} errors`);
    
    res.json({
      success: true,
      totalSites: sites.length,
      successCount,
      errorCount,
      results: results.slice(0, 10) // 最初の10件のみ返す
    });
    
  } catch (error) {
    console.error('Auto baseline capture error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Cloud Run API呼び出し
 */
async function callCloudRun(endpoint, params, method = 'GET') {
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(CLOUD_RUN_URL);
  
  const url = CLOUD_RUN_URL + endpoint;
  
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  if (method === 'GET') {
    const paramString = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');
    const fullUrl = `${url}?${paramString}`;
    
    const response = await client.request({ url: fullUrl, ...options });
    return response.data;
    
  } else {
    options.data = params;
    const response = await client.request({ url, ...options });
    return response.data;
  }
}

/**
 * 自動実行の結果通知
 */
async function sendAutoNotification(siteId, siteUrl, compareResult, trigger) {
  const ngCount = compareResult.ngCount || 0;
  
  if (ngCount === 0) {
    // 差分がない場合は通知しない（オプション）
    return;
  }
  
  const triggerNames = {
    'wordpress-update': 'WordPress更新',
    'scheduled': '定期実行',
    'manual': '手動実行'
  };
  
  const message = `🚨 自動検知: ${siteUrl}\n` +
    `🔄 トリガー: ${triggerNames[trigger] || trigger}\n` +
    `⚠️ ${ngCount} 件の差分が検出されました\n` +
    `📊 詳細: https://docs.google.com/spreadsheets/d/${process.env.SHEET_ID}`;
  
  const promises = [];
  
  // Slack通知
  if (process.env.SLACK_WEBHOOK_URL) {
    promises.push(
      fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          username: 'WordPress VRT Auto Bot',
          icon_emoji: ':robot_face:'
        })
      }).catch(console.error)
    );
  }
  
  // Discord通知
  if (process.env.DISCORD_WEBHOOK_URL) {
    promises.push(
      fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: message,
          username: 'WordPress VRT Auto Bot'
        })
      }).catch(console.error)
    );
  }
  
  await Promise.all(promises);
  console.log(`Auto notification sent for ${siteId}: ${ngCount} diffs detected`);
}