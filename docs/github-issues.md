# GitHub Issues for WordPress Visual Diff Checker

## Issue 一覧

| # | タイトル | 完了条件抜粋 | ラベル | 優先度 |
|---|-----------|-------------|--------|--------|
| 1 | リポジトリ初期化 & 権限シークレット登録 | main ブランチ、CI ベースライン確認 | setup, infrastructure | High |
| 2 | Cloud Run コンテナ & スクショ実装 | `/crawl?mode=baseline\|after` で PNG 生成成功 | backend, cloud-run | High |
| 3 | pixelmatch 差分 & Drive アップロード | diff%.json が Firestore に保存 | backend, integration | High |
| 4 | Firestore → Sheets sync Function | シート行追加 & 条件付き書式自動適用 | backend, cloud-functions | High |
| 5 | GAS UI (サイト管理 + 実行ボタン) | ワンクリックで Cloud Run 起動 & Webhook 通知 | frontend, gas | High |
| 6 | CI/CD Pipeline 構築 | Push → 本番デプロイ → SmokeTest 通過 | devops, github-actions | High |
| 7 | エラー監視 & 古いデータ整理 | 90 日以上前の Drive フォルダ自動削除 | monitoring, maintenance | Medium |
| 8 | README / 操作マニュアル（日本語） | Onboarding 手順 10 分以内 | documentation | Medium |
| 9 | 法的確認 & robots 対応 | robots.txt に従う or 例外リスト管理 | compliance, legal | Medium |
| 10 | パフォーマンステスト & コスト試算 | 300 URL × 30 サイト ≦ ¥ <上限> /月 | testing, optimization | Medium |

---

## Issue #1: リポジトリ初期化 & 権限シークレット登録

### 説明
プロジェクトの基盤となるリポジトリの初期化と、必要な権限・シークレットの設定を行います。

### タスク
- [ ] GitHub リポジトリ作成
- [ ] main ブランチ保護設定
- [ ] 必要なシークレット登録
  - [ ] `GH_PAT`
  - [ ] `GOOGLE_APPLICATION_CREDENTIALS_JSON`
  - [ ] `OAUTH_ID` / `OAUTH_SECRET`
  - [ ] `DRIVE_ROOT`
  - [ ] `SHEET_ID`
  - [ ] `SLACK_WEBHOOK_URL`
  - [ ] `DISCORD_WEBHOOK_URL`
- [ ] 基本的な GitHub Actions ワークフロー作成
- [ ] CI ベースライン動作確認

### 完了条件
- main ブランチが保護されている
- 全てのシークレットが登録されている
- CI が正常に動作する

---

## Issue #2: Cloud Run コンテナ & スクショ実装

### 説明
WordPress サイトをクロールし、スクリーンショットを撮影する Cloud Run サービスを実装します。

### タスク
- [ ] Dockerfile 作成（Puppeteer 環境）
- [ ] クローラー実装（internal link BFS）
- [ ] スクリーンショット機能実装
- [ ] Cloud Run サービス設定
  - [ ] メモリ: 512 MiB
  - [ ] CPU: 1
  - [ ] タイムアウト: 900s
  - [ ] max-instances: 3
- [ ] エンドポイント実装
  - [ ] `/crawl?mode=baseline&url=...`
  - [ ] `/crawl?mode=after&url=...`

### 完了条件
- `/crawl` エンドポイントで PNG が生成される
- baseline/after 両モードが動作する
- Drive に正しくアップロードされる

### 実装ファイル

```dockerfile
# cloud-run/Dockerfile
FROM node:20-slim

# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8080

CMD ["node", "src/index.js"]
```

```javascript
// cloud-run/src/index.js
const express = require('express');
const puppeteer = require('puppeteer');
const { Storage } = require('@google-cloud/storage');
const { Firestore } = require('@google-cloud/firestore');
const crawler = require('./crawler');
const screenshot = require('./screenshot');

const app = express();
const storage = new Storage();
const firestore = new Firestore();

app.get('/crawl', async (req, res) => {
  const { mode, url, siteId } = req.query;
  
  if (!mode || !url || !siteId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const urls = await crawler.crawl(browser, url, { maxUrls: 300 });
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    
    const results = [];
    for (const pageUrl of urls) {
      const screenshotPath = await screenshot.capture(browser, pageUrl, {
        viewport: { width: 1920, height: 1080 },
        waitUntil: 'networkidle0'
      });
      
      const destination = `${mode}/${dateStr}/${siteId}/${encodeURIComponent(pageUrl)}.png`;
      await storage.bucket(process.env.DRIVE_ROOT).upload(screenshotPath, {
        destination
      });
      
      results.push({ url: pageUrl, path: destination });
    }
    
    await browser.close();
    
    await firestore.collection('crawls').doc(`${siteId}_${dateStr}_${mode}`).set({
      siteId,
      mode,
      date: dateStr,
      urls: results,
      timestamp: new Date()
    });
    
    res.json({ success: true, count: results.length });
  } catch (error) {
    console.error('Crawl error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`VRT Runner listening on port ${PORT}`);
});
```

---

## Issue #3: pixelmatch 差分 & Drive アップロード

### 説明
baseline と after のスクリーンショットを比較し、差分画像と差分率を計算して保存します。

### タスク
- [ ] pixelmatch ライブラリ導入
- [ ] 差分計算ロジック実装
- [ ] 差分画像生成
- [ ] Drive アップロード機能
- [ ] Firestore への結果保存

### 完了条件
- diff%.json が Firestore に保存される
- 差分画像が Drive に保存される
- 2% 以上で NG 判定される

### 実装ファイル

```javascript
// cloud-run/src/diff.js
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');
const { Firestore } = require('@google-cloud/firestore');

const storage = new Storage();
const firestore = new Firestore();

async function compareSiteScreenshots(siteId, date) {
  const bucket = storage.bucket(process.env.DRIVE_ROOT);
  const baselinePrefix = `baseline/${date}/${siteId}/`;
  const afterPrefix = `after/${date}/${siteId}/`;
  
  const [baselineFiles] = await bucket.getFiles({ prefix: baselinePrefix });
  const results = [];
  
  for (const baselineFile of baselineFiles) {
    const url = decodeURIComponent(
      baselineFile.name.replace(baselinePrefix, '').replace('.png', '')
    );
    
    const afterPath = baselineFile.name.replace('baseline', 'after');
    const [afterExists] = await bucket.file(afterPath).exists();
    
    if (!afterExists) continue;
    
    const [baselineBuffer] = await baselineFile.download();
    const [afterBuffer] = await bucket.file(afterPath).download();
    
    const baseline = PNG.sync.read(baselineBuffer);
    const after = PNG.sync.read(afterBuffer);
    const { width, height } = baseline;
    const diff = new PNG({ width, height });
    
    const numDiffPixels = pixelmatch(
      baseline.data,
      after.data,
      diff.data,
      width,
      height,
      { threshold: 0.1, alpha: 0.5 }
    );
    
    const totalPixels = width * height;
    const diffPercent = (numDiffPixels / totalPixels) * 100;
    const status = diffPercent < 2 ? 'OK' : 'NG';
    
    const diffPath = `diff/${date}/${siteId}/${encodeURIComponent(url)}.png`;
    const diffBuffer = PNG.sync.write(diff);
    
    await bucket.file(diffPath).save(diffBuffer, {
      metadata: { contentType: 'image/png' }
    });
    
    results.push({
      url,
      baselinePath: baselineFile.name,
      afterPath,
      diffPath,
      diffPercent,
      status,
      timestamp: new Date()
    });
  }
  
  await firestore.collection('comparisons').doc(`${siteId}_${date}`).set({
    siteId,
    date,
    results,
    totalUrls: results.length,
    ngCount: results.filter(r => r.status === 'NG').length,
    timestamp: new Date()
  });
  
  return results;
}

module.exports = { compareSiteScreenshots };
```

---

## Issue #4: Firestore → Sheets sync Function

### 説明
Firestore に保存された比較結果を Google Sheets に同期する Cloud Functions を実装します。

### タスク
- [ ] Cloud Functions Gen2 セットアップ
- [ ] Firestore トリガー設定
- [ ] Sheets API 連携
- [ ] 条件付き書式の自動適用
- [ ] エラーハンドリング

### 完了条件
- Firestore 更新時に自動でシートに反映
- NG 行が赤色でハイライトされる
- 列が正しく配置される

### 実装ファイル

```javascript
// cloud-functions/sheets-sync/index.js
const functions = require('@google-cloud/functions-framework');
const { google } = require('googleapis');

const SHEET_ID = process.env.SHEET_ID;

async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return auth.getClient();
}

functions.cloudEvent('syncToSheets', async (cloudEvent) => {
  const data = cloudEvent.data;
  const siteId = data.value.fields.siteId.stringValue;
  const date = data.value.fields.date.stringValue;
  const results = JSON.parse(data.value.fields.results.stringValue);
  
  const authClient = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  
  // サイトごとのタブを取得または作成
  let sheetName = siteId;
  try {
    await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      ranges: [sheetName]
    });
  } catch (e) {
    // タブが存在しない場合は作成
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: {
        requests: [{
          addSheet: {
            properties: { title: sheetName }
          }
        }]
      }
    });
    
    // ヘッダー行を追加
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A1:G1`,
      valueInputOption: 'RAW',
      resource: {
        values: [['Date', 'URL', 'Baseline', 'After', 'Diff', 'Diff%', 'Status']]
      }
    });
  }
  
  // データ行を追加
  const rows = results.map(r => [
    date,
    r.url,
    r.baselinePath,
    r.afterPath,
    r.diffPath,
    r.diffPercent.toFixed(2),
    r.status
  ]);
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:G`,
    valueInputOption: 'RAW',
    resource: { values: rows }
  });
  
  // 条件付き書式を適用（NG行を赤色に）
  const sheetId = (await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID
  })).data.sheets.find(s => s.properties.title === sheetName).properties.sheetId;
  
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    resource: {
      requests: [{
        addConditionalFormatRule: {
          rule: {
            ranges: [{
              sheetId,
              startRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 7
            }],
            booleanRule: {
              condition: {
                type: 'TEXT_EQ',
                values: [{ userEnteredValue: 'NG' }]
              },
              format: {
                backgroundColor: { red: 1, green: 0.8, blue: 0.8 }
              }
            }
          }
        }
      }]
    }
  });
});
```

---

## Issue #5: GAS UI (サイト管理 + 実行ボタン)

### 説明
Google Apps Script で日本語のサイト管理 UI を作成し、ワンクリックで差分チェックを実行できるようにします。

### タスク
- [ ] HTML/CSS による UI 作成
- [ ] サイト追加/削除機能
- [ ] 実行ボタン実装
- [ ] Cloud Run API 呼び出し
- [ ] Webhook 通知機能

### 完了条件
- 日本語 UI でサイト管理可能
- ワンクリックで差分チェック実行
- 実行結果が Slack/Discord に通知される

### 実装ファイル

```javascript
// gas/src/Code.gs
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setTitle('WordPress Visual Diff Checker');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getSites() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('sites');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  return data.slice(1).map(row => ({
    id: row[0],
    name: row[1],
    url: row[2],
    lastRun: row[3],
    status: row[4]
  }));
}

function addSite(name, url) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('sites');
  const id = Utilities.getUuid();
  sheet.appendRow([id, name, url, '', 'pending']);
  return id;
}

function deleteSite(id) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('sites');
  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex(row => row[0] === id);
  if (rowIndex > 0) {
    sheet.deleteRow(rowIndex + 1);
  }
}

function runCheck(siteId) {
  const site = getSites().find(s => s.id === siteId);
  if (!site) throw new Error('サイトが見つかりません');
  
  const cloudRunUrl = `https://vrt-runner-xxxxx-an.a.run.app`;
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
  // Baseline 実行
  const baselineResponse = UrlFetchApp.fetch(`${cloudRunUrl}/crawl`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getAccessToken()}` },
    muteHttpExceptions: true,
    params: {
      mode: 'baseline',
      url: site.url,
      siteId: siteId
    }
  });
  
  if (baselineResponse.getResponseCode() !== 200) {
    throw new Error('Baseline 実行に失敗しました');
  }
  
  // After 実行
  const afterResponse = UrlFetchApp.fetch(`${cloudRunUrl}/crawl`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getAccessToken()}` },
    muteHttpExceptions: true,
    params: {
      mode: 'after',
      url: site.url,
      siteId: siteId
    }
  });
  
  if (afterResponse.getResponseCode() !== 200) {
    throw new Error('After 実行に失敗しました');
  }
  
  // 比較実行
  const compareResponse = UrlFetchApp.fetch(`${cloudRunUrl}/compare`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ siteId, date })
  });
  
  // ステータス更新
  updateSiteStatus(siteId, date, 'completed');
  
  // 通知送信
  const results = JSON.parse(compareResponse.getContentText());
  sendNotifications(site, results);
  
  return results;
}

function sendNotifications(site, results) {
  const ngResults = results.filter(r => r.status === 'NG');
  if (ngResults.length === 0) return;
  
  const message = `🚨 ${site.name} で ${ngResults.length} 件の差分が検出されました\n` +
    ngResults.map(r => `- ${r.url} (${r.diffPercent.toFixed(2)}%)`).join('\n');
  
  // Slack 通知
  if (SLACK_WEBHOOK_URL) {
    UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({ text: message })
    });
  }
  
  // Discord 通知
  if (DISCORD_WEBHOOK_URL) {
    UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({ content: message })
    });
  }
}
```

```html
<!-- gas/src/index.html -->
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <?!= include('styles'); ?>
</head>
<body>
  <div class="container">
    <h1>WordPress Visual Diff Checker</h1>
    
    <div class="add-site-form">
      <h2>新規サイト追加</h2>
      <input type="text" id="siteName" placeholder="サイト名">
      <input type="url" id="siteUrl" placeholder="URL">
      <button onclick="addSite()">追加</button>
    </div>
    
    <div class="sites-list">
      <h2>登録サイト一覧</h2>
      <table id="sitesTable">
        <thead>
          <tr>
            <th>サイト名</th>
            <th>URL</th>
            <th>最終実行</th>
            <th>ステータス</th>
            <th>アクション</th>
          </tr>
        </thead>
        <tbody id="sitesBody">
        </tbody>
      </table>
    </div>
  </div>
  
  <?!= include('script'); ?>
</body>
</html>
```

---

## Issue #6: CI/CD Pipeline 構築

### 説明
GitHub Actions を使用して、自動デプロイとテストのパイプラインを構築します。

### タスク
- [ ] Cloud Run デプロイワークフロー
- [ ] GAS デプロイワークフロー
- [ ] E2E テストワークフロー
- [ ] Smoke テスト実装
- [ ] ブランチ保護ルール設定

### 完了条件
- main push で自動デプロイ
- テスト成功後のみデプロイ
- Smoke テストが通過する

### 実装ファイル

```yaml
# .github/workflows/deploy-cloud-run.yml
name: Deploy Cloud Run

on:
  push:
    branches: [main]
    paths:
      - 'cloud-run/**'
      - '.github/workflows/deploy-cloud-run.yml'

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  SERVICE_NAME: vrt-runner
  REGION: asia-northeast1

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GOOGLE_APPLICATION_CREDENTIALS_JSON }}
      
      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2
      
      - name: Configure Docker
        run: gcloud auth configure-docker
      
      - name: Build and Push Container
        run: |
          cd cloud-run
          docker build -t gcr.io/$PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA .
          docker push gcr.io/$PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA
      
      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy $SERVICE_NAME \
            --image gcr.io/$PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA \
            --platform managed \
            --region $REGION \
            --memory 512Mi \
            --cpu 1 \
            --timeout 900 \
            --max-instances 3 \
            --set-env-vars "DRIVE_ROOT=${{ secrets.DRIVE_ROOT }},SHEET_ID=${{ secrets.SHEET_ID }}"
      
      - name: Run Smoke Test
        run: |
          SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
          response=$(curl -s -o /dev/null -w "%{http_code}" $SERVICE_URL/health)
          if [ $response != "200" ]; then
            echo "Smoke test failed"
            exit 1
          fi
```

```yaml
# .github/workflows/deploy-gas.yml
name: Deploy GAS

on:
  push:
    branches: [main]
    paths:
      - 'gas/**'
      - '.github/workflows/deploy-gas.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install clasp
        run: npm install -g @google/clasp
      
      - name: Setup clasp authentication
        run: |
          echo '${{ secrets.CLASP_CREDENTIALS }}' > ~/.clasprc.json
      
      - name: Push to GAS
        run: |
          cd gas
          clasp push --force
      
      - name: Deploy new version
        run: |
          cd gas
          VERSION=$(clasp version "Deploy from GitHub Actions")
          clasp deploy --versionNumber $VERSION --description "Automated deployment"
```

---

## Issue #7: エラー監視 & 古いデータ整理

### 説明
Cloud Logging のエラーを監視し、古いスクリーンショットを自動削除する仕組みを実装します。

### タスク
- [ ] Error Reporting 設定
- [ ] Cloud Scheduler 設定
- [ ] 削除用 Cloud Function 実装
- [ ] アラート設定
- [ ] ログ集約設定

### 完了条件
- エラーが Error Reporting に集約される
- 90日以上前のデータが自動削除される
- 重要なエラーがアラート通知される

### 実装ファイル

```javascript
// cloud-functions/cleanup/index.js
const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const { Firestore } = require('@google-cloud/firestore');

const storage = new Storage();
const firestore = new Firestore();

functions.http('cleanupOldData', async (req, res) => {
  const bucket = storage.bucket(process.env.DRIVE_ROOT);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  
  let deletedCount = 0;
  
  try {
    // 古いフォルダを検索
    const [files] = await bucket.getFiles();
    const foldersToDelete = new Set();
    
    for (const file of files) {
      const parts = file.name.split('/');
      if (parts.length >= 2) {
        const dateStr = parts[1];
        const fileDate = new Date(
          dateStr.substr(0, 4) + '-' + 
          dateStr.substr(4, 2) + '-' + 
          dateStr.substr(6, 2)
        );
        
        if (fileDate < cutoffDate) {
          foldersToDelete.add(`${parts[0]}/${parts[1]}`);
        }
      }
    }
    
    // フォルダごとに削除
    for (const folder of foldersToDelete) {
      const [folderFiles] = await bucket.getFiles({ prefix: folder });
      
      for (const file of folderFiles) {
        await file.delete();
        deletedCount++;
      }
      
      console.log(`Deleted folder: ${folder}`);
    }
    
    // Firestore のレコードも削除
    const snapshot = await firestore
      .collection('comparisons')
      .where('timestamp', '<', cutoffDate)
      .get();
    
    const batch = firestore.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    res.json({ 
      success: true, 
      deletedFiles: deletedCount,
      deletedRecords: snapshot.size
    });
    
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

```yaml
# cloud-scheduler/cleanup-job.yaml
name: cleanup-old-screenshots
schedule: "0 2 * * *"  # 毎日午前2時に実行
timeZone: "Asia/Tokyo"
httpTarget:
  uri: https://asia-northeast1-${PROJECT_ID}.cloudfunctions.net/cleanup
  httpMethod: GET
  oidcToken:
    serviceAccountEmail: ${SA_EMAIL}
```

---

## Issue #8: README / 操作マニュアル（日本語）

### 説明
プロジェクトの README と日本語の操作マニュアルを作成します。

### タスク
- [ ] README.md 作成
- [ ] 操作マニュアル作成
- [ ] アーキテクチャ図作成
- [ ] トラブルシューティングガイド
- [ ] FAQ セクション

### 完了条件
- 10分以内でセットアップ可能
- 画像付きの分かりやすい説明
- よくある質問への回答

---

## Issue #9: 法的確認 & robots 対応

### 説明
クロール対象サイトの robots.txt に従い、法的に問題のない実装を行います。

### タスク
- [ ] robots.txt パーサー実装
- [ ] クロール除外リスト機能
- [ ] User-Agent 設定
- [ ] クロール間隔設定
- [ ] 利用規約ドキュメント作成

### 完了条件
- robots.txt の規則に従う
- 除外リストが機能する
- 法的リスクが文書化される

### 実装ファイル

```javascript
// cloud-run/src/robots-checker.js
const robotsParser = require('robots-parser');
const fetch = require('node-fetch');

async function canCrawl(url) {
  try {
    const urlObj = new URL(url);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
    
    const response = await fetch(robotsUrl);
    if (!response.ok) return true; // robots.txt が存在しない場合は許可
    
    const robotsText = await response.text();
    const robots = robotsParser(robotsUrl, robotsText);
    
    return robots.isAllowed(url, 'WordPress-Visual-Diff-Bot');
  } catch (error) {
    console.error('Robots check error:', error);
    return true; // エラー時はデフォルトで許可
  }
}

module.exports = { canCrawl };
```

---

## Issue #10: パフォーマンステスト & コスト試算

### 説明
大規模な運用を想定したパフォーマンステストとコスト試算を行います。

### タスク
- [ ] 負荷テストシナリオ作成
- [ ] 300 URL × 30 サイトでのテスト
- [ ] リソース使用量測定
- [ ] コスト計算スプレッドシート
- [ ] 最適化提案

### 完了条件
- 想定負荷でエラーなし
- 月額コストが予算内
- ボトルネック特定と対策

### 実装ファイル

```javascript
// tests/performance/load-test.js
const { test, expect } = require('@playwright/test');

test.describe('Performance Tests', () => {
  test('should handle 30 concurrent site crawls', async ({ request }) => {
    const sites = Array(30).fill(null).map((_, i) => ({
      id: `test-site-${i}`,
      url: `https://example${i}.com`
    }));
    
    const promises = sites.map(site => 
      request.get('/crawl', {
        params: {
          mode: 'baseline',
          url: site.url,
          siteId: site.id
        }
      })
    );
    
    const responses = await Promise.all(promises);
    
    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
  });
  
  test('should complete 300 URL crawl within timeout', async ({ request }) => {
    const startTime = Date.now();
    
    const response = await request.get('/crawl', {
      params: {
        mode: 'baseline',
        url: 'https://large-site.com',
        siteId: 'perf-test'
      },
      timeout: 900000 // 15 minutes
    });
    
    const duration = Date.now() - startTime;
    
    expect(response.status()).toBe(200);
    expect(duration).toBeLessThan(900000);
    
    const data = await response.json();
    expect(data.count).toBeGreaterThanOrEqual(300);
  });
});
```