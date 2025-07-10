# WordPress Visual Diff Checker

WordPress プラグイン更新による UI 崩れをブラウザ操作ゼロで検知し、Slack / Discord / Google Sheets にレポートする手動実行型 Web アプリケーション。

## 概要

WordPress サイトの管理者向けに、プラグインやテーマの更新前後でビジュアルレグレッションテスト（VRT）を手動実行し、UI の崩れを検出するツールです。

## ✨ 特徴

- 🎯 **手動制御**: 更新タイミングを完全にコントロール
- 📱 **即座に通知**: 差分検出時にSlack/Discordへ自動通知
- 🎌 **日本語UI**: 使いやすい日本語インターフェース
- ⚡ **プラグイン不要**: WordPressに何もインストール不要
- 🛡️ **スケーラブル**: 複数サイト・大量ページに対応
- 🔧 **分離実行**: Baseline/After/Compare を個別実行可能

### 主な機能

- 🔍 **自動クロール**: サイト内の全ページを自動的に発見・スクリーンショット撮影
- 📊 **差分検出**: ピクセル単位で更新前後の画面を比較
- 📱 **通知連携**: Slack/Discord への自動通知
- 📈 **レポート**: Google Sheets での結果管理
- 🚀 **完全自動化**: ワンクリックで全プロセスを実行

## アーキテクチャ

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Google Apps   │────▶│  Cloud Run   │────▶│ Google Drive    │
│     Script      │     │  (Crawler)   │     │  (Screenshots)  │
└─────────────────┘     └──────────────┘     └─────────────────┘
         │                      │                      │
         │                      ▼                      │
         │              ┌──────────────┐              │
         │              │   Firestore  │              │
         │              │  (Metadata)  │              │
         │              └──────────────┘              │
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Google Sheets   │◀────│Cloud Function│     │ Slack/Discord   │
│   (Reports)     │     │ (Sync Data)  │────▶│ (Notifications) │
└─────────────────┘     └──────────────┘     └─────────────────┘
```

## セットアップ

### 前提条件

- Google Cloud Platform アカウント
- GitHub アカウント
- Google Workspace アカウント
- Node.js 20 以上

### 1. リポジトリのクローン

```bash
git clone https://github.com/YOUR_USERNAME/wordpress-visual-diff-checker.git
cd wordpress-visual-diff-checker
```

### 2. GCP プロジェクトのセットアップ

```bash
# GCP プロジェクトの作成
gcloud projects create YOUR_PROJECT_ID --name="WordPress VRT"

# プロジェクトの設定
gcloud config set project YOUR_PROJECT_ID

# 必要な API の有効化
gcloud services enable \
  run.googleapis.com \
  cloudfunctions.googleapis.com \
  firestore.googleapis.com \
  drive.googleapis.com \
  sheets.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com

# サービスアカウントの作成
gcloud iam service-accounts create vrt-runner \
  --display-name="VRT Runner Service Account"

# 権限の付与
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:vrt-runner@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:vrt-runner@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

# サービスアカウントキーの作成
gcloud iam service-accounts keys create sa-key.json \
  --iam-account=vrt-runner@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 3. GitHub シークレットの設定

以下のシークレットを GitHub リポジトリに設定します：

| シークレット名 | 説明 |
|---------------|------|
| `GH_PAT` | GitHub Personal Access Token (repo, workflow, actions 権限) |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | サービスアカウントキー（base64 エンコード） |
| `GCP_PROJECT_ID` | GCP プロジェクト ID |
| `DRIVE_ROOT` | Google Drive フォルダ ID |
| `SHEET_ID` | Google Sheets ID |
| `SLACK_WEBHOOK_URL` | Slack Webhook URL（オプション） |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL（オプション） |

### 4. 初回デプロイ

```bash
# main ブランチにプッシュすると自動デプロイが開始されます
git push origin main
```

## 使い方

### 1. サイトの登録

1. [Google Sheets](https://docs.google.com/spreadsheets/d/SHEET_ID) を開く
2. 「サイト管理」タブで新規サイトを追加
3. サイト名と URL を入力

### 2. 差分チェックの実行

#### 手動実行フロー
1. Google Apps Script の Web アプリを開く
2. 「Baseline撮影」ボタンをクリック（更新前のスクリーンショット）
3. **手動でWordPress更新を実施**
4. 「After撮影」ボタンをクリック（更新後のスクリーンショット）
5. 「差分比較」ボタンをクリック（結果確認・通知）

#### 一括実行
「Full実行」ボタンで上記1〜5を連続実行も可能

### 3. 結果の確認

- **Google Sheets**: 各サイトのタブで詳細な結果を確認
- **Slack/Discord**: NG（差分 2% 以上）の場合に通知
- **Google Drive**: スクリーンショット画像を直接確認

## 設定

### 環境変数

```env
# .env.example
GCP_PROJECT_ID=your-project-id
DRIVE_ROOT=1k7K1_-KSxdFKzJP6-ikrN9nKjO029Tia
SHEET_ID=1x7cHB6V_b3IeRlg05rSBSf6ABUlHvbKKBLzIdWdpEwI
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx
```

### カスタマイズ

#### 差分閾値の変更

`cloud-run/src/diff.js` で閾値を調整：

```javascript
const status = diffPercent < 2 ? 'OK' : 'NG'; // 2% がデフォルト
```

#### クロール設定

`cloud-run/src/crawler.js` で最大 URL 数を調整：

```javascript
const urls = await crawler.crawl(browser, url, { maxUrls: 300 });
```

#### スクリーンショット設定

`cloud-run/src/screenshot.js` でスクロール設定を調整：

```javascript
await waitForContentAndScroll(page, {
  scrollSteps: 10,      // スクロール段階数
  scrollDelay: 800,     // 各段階の待機時間（ms）
  finalWait: 2000       // 最終待機時間（ms）
});
```

## トラブルシューティング

### Cloud Run がタイムアウトする

- メモリを増やす: 512Mi → 1Gi
- CPU を増やす: 1 → 2
- タイムアウトを延長: 900s → 1800s

### スクリーンショットが撮れない

- Puppeteer の待機時間を調整
- `networkidle0` → `networkidle2` に変更
- スクロール設定を調整（scrollSteps、scrollDelay）
- 遅延読み込み画像の待機時間を延長

### Drive の容量不足

- 古いデータの自動削除期間を短縮（90日 → 30日）
- Cloud Scheduler の実行頻度を上げる

## コスト見積もり

月間 30 サイト × 300 URL での運用を想定：

| サービス | 使用量 | 月額（概算） |
|---------|--------|-------------|
| Cloud Run | 450 時間 | ¥3,000 |
| Cloud Functions | 900 実行 | ¥100 |
| Firestore | 10GB | ¥500 |
| Cloud Storage | 100GB | ¥2,000 |
| **合計** | - | **¥5,600** |

## 開発

### ローカル開発環境

```bash
# 依存関係のインストール
npm install

# ローカルサーバーの起動
npm run dev

# テストの実行
npm test

# E2E テスト
npm run test:e2e
```

### Devcontainer

VS Code の Devcontainer を使用した開発が可能です：

1. VS Code で「Reopen in Container」を選択
2. 自動的に開発環境が構築されます

## ライセンス

MIT License

## コントリビューション

1. Fork する
2. Feature ブランチを作成する (`git checkout -b feature/amazing-feature`)
3. 変更をコミットする (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュする (`git push origin feature/amazing-feature`)
5. Pull Request を作成する

## サポート

問題が発生した場合は、[GitHub Issues](https://github.com/YOUR_USERNAME/wordpress-visual-diff-checker/issues) で報告してください。