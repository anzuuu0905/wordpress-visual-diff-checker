# GitHub Secrets セットアップガイド

## 必要なシークレット一覧

以下のシークレットを GitHub リポジトリの Settings > Secrets and variables > Actions で設定してください。

### 1. GitHub Personal Access Token

```
Name: GH_PAT
Value: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- repo, workflow, actions 権限が必要
- [GitHub Settings](https://github.com/settings/tokens) で作成

### 2. Google Cloud Service Account

```
Name: GOOGLE_APPLICATION_CREDENTIALS_JSON
Value: {
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "...",
  "client_email": "vrt-runner@your-project-id.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

### 3. GCP Project ID

```
Name: GCP_PROJECT_ID
Value: your-gcp-project-id
```

### 4. Google Drive フォルダ ID

```
Name: DRIVE_ROOT
Value: 1k7K1_-KSxdFKzJP6-ikrN9nKjO029Tia
```

### 5. Google Sheets ID

```
Name: SHEET_ID
Value: 1x7cHB6V_b3IeRlg05rSBSf6ABUlHvbKKBLzIdWdpEwI
```

### 6. Slack Webhook URL (オプション)

```
Name: SLACK_WEBHOOK_URL
Value: https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

### 7. Discord Webhook URL (オプション)

```
Name: DISCORD_WEBHOOK_URL
Value: https://discord.com/api/webhooks/000000000000000000/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 8. OAuth Credentials (GAS用)

```
Name: OAUTH_ID
Value: 123456789012-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com

Name: OAUTH_SECRET
Value: GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 9. Clasp Credentials (GAS デプロイ用)

```
Name: CLASP_CREDENTIALS
Value: {
  "access_token": "...",
  "refresh_token": "...",
  "scope": "https://www.googleapis.com/auth/script.deployments https://www.googleapis.com/auth/script.projects",
  "token_type": "Bearer",
  "expires_in": 3599
}
```

## セットアップ手順

### 1. GCP プロジェクトの作成

```bash
# プロジェクト作成
gcloud projects create your-project-id --name="WordPress VRT"

# プロジェクト設定
gcloud config set project your-project-id

# 必要な API の有効化
gcloud services enable \
  run.googleapis.com \
  cloudfunctions.googleapis.com \
  firestore.googleapis.com \
  drive.googleapis.com \
  sheets.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com

# サービスアカウント作成
gcloud iam service-accounts create vrt-runner \
  --display-name="VRT Runner Service Account"

# 権限付与
gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:vrt-runner@your-project-id.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:vrt-runner@your-project-id.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:vrt-runner@your-project-id.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# サービスアカウントキー作成
gcloud iam service-accounts keys create sa-key.json \
  --iam-account=vrt-runner@your-project-id.iam.gserviceaccount.com
```

### 2. GitHub PAT の作成

1. [GitHub Settings](https://github.com/settings/tokens) にアクセス
2. "Generate new token (classic)" をクリック
3. 以下の権限を選択:
   - repo (Full control of private repositories)
   - workflow (Update GitHub Action workflows)
   - actions (Write actions)
4. トークンをコピーして `GH_PAT` に設定

### 3. Clasp 認証の設定

```bash
# clasp をインストール
npm install -g @google/clasp

# ログイン
clasp login

# 認証情報を確認
cat ~/.clasprc.json
```

認証情報を `CLASP_CREDENTIALS` に設定

## 確認方法

シークレットが正しく設定されているかテスト:

```bash
# CI の実行
git push origin main

# GitHub Actions のログで確認
gh run list
gh run view <run-id>
```