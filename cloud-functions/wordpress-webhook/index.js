const functions = require('@google-cloud/functions-framework');
const { Firestore } = require('@google-cloud/firestore');

const firestore = new Firestore();

/**
 * WordPress からの更新通知を受信して自動で After + 比較を実行
 */
functions.http('wordpressWebhook', async (req, res) => {
  console.log('WordPress webhook received:', JSON.stringify(req.body, null, 2));
  
  try {
    // WordPress からの通知内容を解析
    const { site_url, action, plugin_info, theme_info } = req.body;
    
    if (!site_url) {
      return res.status(400).json({ error: 'site_url is required' });
    }
    
    // 更新情報をログ
    console.log(`WordPress update detected: ${action} at ${site_url}`);
    if (plugin_info) {
      console.log('Plugin updates:', plugin_info);
    }
    if (theme_info) {
      console.log('Theme updates:', theme_info);
    }
    
    // サイトIDを取得（URLから逆引き）
    const siteId = await findSiteIdByUrl(site_url);
    if (!siteId) {
      console.log(`Site not registered: ${site_url}`);
      return res.json({ 
        message: 'Site not registered in VRT system',
        site_url 
      });
    }
    
    // 更新情報をFirestoreに記録
    await firestore.collection('wordpress_updates').add({
      siteId,
      siteUrl: site_url,
      action,
      pluginInfo: plugin_info || null,
      themeInfo: theme_info || null,
      timestamp: new Date(),
      status: 'pending'
    });
    
    // 5分後に After + 比較を自動実行（WordPress 更新の完了を待つ）
    await scheduleAutoComparison(siteId, site_url);
    
    res.json({ 
      success: true, 
      message: 'VRT scheduled automatically',
      siteId,
      scheduledIn: '5 minutes'
    });
    
  } catch (error) {
    console.error('WordPress webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * URLからサイトIDを検索
 */
async function findSiteIdByUrl(url) {
  try {
    const normalizedUrl = normalizeUrl(url);
    
    // sites コレクションから検索
    const snapshot = await firestore
      .collection('sites')
      .where('url', '==', normalizedUrl)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      // 部分一致でも検索
      const allSites = await firestore.collection('sites').get();
      for (const doc of allSites.docs) {
        const siteData = doc.data();
        if (siteData.url && normalizedUrl.includes(siteData.url.replace(/^https?:\/\//, ''))) {
          return doc.id;
        }
      }
      return null;
    }
    
    return snapshot.docs[0].id;
    
  } catch (error) {
    console.error('Error finding site ID:', error);
    return null;
  }
}

/**
 * 自動比較の実行をスケジュール
 */
async function scheduleAutoComparison(siteId, siteUrl) {
  const { CloudTasksClient } = require('@google-cloud/tasks');
  const client = new CloudTasksClient();
  
  const project = process.env.GCP_PROJECT_ID;
  const queue = 'auto-vrt-queue';
  const location = 'asia-northeast1';
  const parent = client.queuePath(project, location, queue);
  
  // 5分後に実行
  const scheduleTime = new Date();
  scheduleTime.setMinutes(scheduleTime.getMinutes() + 5);
  
  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url: `https://${location}-${project}.cloudfunctions.net/autoVrtExecution`,
      headers: {
        'Content-Type': 'application/json'
      },
      body: Buffer.from(JSON.stringify({
        siteId,
        siteUrl,
        mode: 'auto-after-compare',
        trigger: 'wordpress-update'
      }))
    },
    scheduleTime: {
      seconds: Math.floor(scheduleTime.getTime() / 1000)
    }
  };
  
  await client.createTask({ parent, task });
  console.log(`Scheduled auto VRT for ${siteId} at ${scheduleTime.toISOString()}`);
}

/**
 * URL正規化
 */
function normalizeUrl(url) {
  if (!url) return '';
  
  // プロトコル追加
  if (!url.match(/^https?:\/\//)) {
    url = 'https://' + url;
  }
  
  // 末尾スラッシュ除去
  url = url.replace(/\/$/, '');
  
  return url;
}

module.exports = { findSiteIdByUrl, scheduleAutoComparison };