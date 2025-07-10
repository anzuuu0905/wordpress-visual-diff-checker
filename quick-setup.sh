#!/bin/bash
set -e

echo "🚀 WordPress VRT 簡単セットアップ"
echo "=================================="

# 既存プロジェクトを使用
PROJECT_ID="urlsearch-423209"
REGION="us-central1"
SERVICE_NAME="vrt-runner"

echo "✅ プロジェクト: $PROJECT_ID"
echo "✅ 設定済みアカウント: kazuhiro.ando.co@gmail.com"

# 1. 必要なAPI有効化
echo "🔌 必要なAPIを有効化中..."
gcloud services enable run.googleapis.com --project=$PROJECT_ID
gcloud services enable firestore.googleapis.com --project=$PROJECT_ID
gcloud services enable drive.googleapis.com --project=$PROJECT_ID
gcloud services enable sheets.googleapis.com --project=$PROJECT_ID
gcloud services enable cloudbuild.googleapis.com --project=$PROJECT_ID

# 2. サービスアカウント作成
echo "👤 サービスアカウント設定中..."
SA_EMAIL="vrt-runner@$PROJECT_ID.iam.gserviceaccount.com"

# 既存確認
if ! gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID > /dev/null 2>&1; then
    gcloud iam service-accounts create vrt-runner \
        --display-name="VRT Runner" \
        --project=$PROJECT_ID
fi

# 権限付与
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/run.invoker" > /dev/null 2>&1

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/datastore.user" > /dev/null 2>&1

# 3. Firestore初期化（既存確認）
echo "🗄 Firestore確認中..."
if ! gcloud firestore databases describe --region=$REGION --project=$PROJECT_ID > /dev/null 2>&1; then
    gcloud firestore databases create --region=$REGION --project=$PROJECT_ID
fi

# 4. Cloud Run デプロイ
echo "🚀 Cloud Runにデプロイ中..."
cd cloud-run

# 簡単なDockerfileを作成
cat > Dockerfile.simple << 'EOF'
FROM node:18-slim
RUN apt-get update && apt-get install -y \
    chromium \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
EXPOSE 8080
CMD ["node", "src/index.js"]
EOF

# package.jsonを簡略化
cat > package.json << 'EOF'
{
  "name": "wordpress-vrt",
  "version": "1.0.0",
  "main": "src/index.js",
  "dependencies": {
    "express": "^4.18.2",
    "puppeteer": "^21.0.0",
    "@google-cloud/storage": "^7.0.0",
    "@google-cloud/firestore": "^7.0.0",
    "pixelmatch": "^5.3.0",
    "pngjs": "^7.0.0"
  },
  "scripts": {
    "start": "node src/index.js"
  }
}
EOF

# Dockerイメージビルド＆デプロイ
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME --project=$PROJECT_ID

gcloud run deploy $SERVICE_NAME \
    --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 1Gi \
    --timeout 900 \
    --project=$PROJECT_ID

# Cloud Run URL取得
CLOUD_RUN_URL=$(gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format='value(status.url)')

cd ..

# 5. 設定ファイル作成
cat > .env.production << EOF
# WordPress VRT 設定
GCP_PROJECT_ID=$PROJECT_ID
CLOUD_RUN_URL=$CLOUD_RUN_URL
SERVICE_ACCOUNT_EMAIL=$SA_EMAIL
REGION=$REGION

# 手動で設定してください:
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
# SHEET_ID=YOUR_GOOGLE_SHEETS_ID
EOF

echo ""
echo "🎉 WordPress VRT セットアップ完了！"
echo "=================================="
echo ""
echo "Cloud Run URL: $CLOUD_RUN_URL"
echo ""
echo "📋 次のステップ:"
echo "1. Google Sheetsを新規作成"
echo "2. シートIDを.env.productionに追加"
echo "3. Slack Webhook URL（オプション）"
echo "4. テスト実行"
echo ""
echo "✨ 設定完了！すぐに使えます！"