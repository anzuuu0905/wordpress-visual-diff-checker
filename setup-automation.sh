#!/bin/bash
set -e

echo "🚀 WordPress VRT 自動設定スクリプト"
echo "=================================="

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# プロジェクト情報
PROJECT_ID="wordpress-vrt-$(date +%Y%m%d)"
REGION="us-central1"
SERVICE_NAME="vrt-runner"

echo -e "${BLUE}📋 設定情報${NC}"
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# 1. GCP認証確認
echo -e "${YELLOW}🔐 Step 1: GCP認証確認${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n 1 > /dev/null; then
    echo "GCPにログインしてください..."
    gcloud auth login
fi
echo -e "${GREEN}✅ 認証済み${NC}"

# 2. GCPプロジェクト作成
echo -e "${YELLOW}🏗 Step 2: GCPプロジェクト作成${NC}"
if ! gcloud projects describe $PROJECT_ID > /dev/null 2>&1; then
    echo "プロジェクトを作成中..."
    gcloud projects create $PROJECT_ID --name="WordPress VRT"
    echo "課金アカウントを設定してください..."
    echo "https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
    read -p "課金設定完了後、Enterを押してください..."
fi

gcloud config set project $PROJECT_ID
echo -e "${GREEN}✅ プロジェクト設定完了${NC}"

# 3. 必要なAPI有効化
echo -e "${YELLOW}🔌 Step 3: API有効化${NC}"
apis=(
    "run.googleapis.com"
    "cloudfunctions.googleapis.com"
    "firestore.googleapis.com"
    "drive.googleapis.com"
    "sheets.googleapis.com"
    "cloudbuild.googleapis.com"
    "cloudscheduler.googleapis.com"
)

for api in "${apis[@]}"; do
    echo "Enabling $api..."
    gcloud services enable $api
done
echo -e "${GREEN}✅ API有効化完了${NC}"

# 4. サービスアカウント作成
echo -e "${YELLOW}👤 Step 4: サービスアカウント作成${NC}"
SA_EMAIL="vrt-runner@$PROJECT_ID.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe $SA_EMAIL > /dev/null 2>&1; then
    gcloud iam service-accounts create vrt-runner \
        --display-name="VRT Runner Service Account"
fi

# 権限付与
roles=(
    "roles/run.invoker"
    "roles/datastore.user"
    "roles/storage.admin"
    "roles/cloudsql.client"
)

for role in "${roles[@]}"; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_EMAIL" \
        --role="$role"
done

# サービスアカウントキー作成
if [ ! -f "sa-key.json" ]; then
    gcloud iam service-accounts keys create sa-key.json \
        --iam-account=$SA_EMAIL
fi
echo -e "${GREEN}✅ サービスアカウント設定完了${NC}"

# 5. Firestore初期化
echo -e "${YELLOW}🗄 Step 5: Firestore初期化${NC}"
if ! gcloud firestore databases describe --region=$REGION > /dev/null 2>&1; then
    gcloud firestore databases create --region=$REGION
fi
echo -e "${GREEN}✅ Firestore初期化完了${NC}"

# 6. Cloud Run デプロイ
echo -e "${YELLOW}🚀 Step 6: Cloud Run デプロイ${NC}"
cd cloud-run

# Dockerイメージビルド
echo "Dockerイメージをビルド中..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME

# Cloud Run デプロイ
echo "Cloud Runにデプロイ中..."
gcloud run deploy $SERVICE_NAME \
    --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --timeout 900 \
    --set-env-vars "GCP_PROJECT_ID=$PROJECT_ID"

# Cloud Run URL取得
CLOUD_RUN_URL=$(gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --format='value(status.url)')

echo -e "${GREEN}✅ Cloud Run デプロイ完了${NC}"
echo "URL: $CLOUD_RUN_URL"

cd ..

# 7. Google Drive フォルダ作成
echo -e "${YELLOW}📁 Step 7: Google Drive設定${NC}"

# Drive APIを使用してフォルダ作成（簡易版）
cat > create-drive-folder.js << EOF
const { google } = require('googleapis');
const fs = require('fs');

async function createDriveFolder() {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'sa-key.json',
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    
    const res = await drive.files.create({
        requestBody: {
            name: 'WordPress VRT Screenshots',
            mimeType: 'application/vnd.google-apps.folder'
        }
    });
    
    console.log('Folder ID:', res.data.id);
    fs.writeFileSync('.env', \`DRIVE_ROOT=\${res.data.id}\n\`);
}

createDriveFolder().catch(console.error);
EOF

node create-drive-folder.js
DRIVE_ROOT=$(grep DRIVE_ROOT .env | cut -d= -f2)
echo -e "${GREEN}✅ Google Drive設定完了${NC}"
echo "Folder ID: $DRIVE_ROOT"

# 8. Google Sheets作成
echo -e "${YELLOW}📊 Step 8: Google Sheets設定${NC}"

cat > create-sheets.js << EOF
const { google } = require('googleapis');
const fs = require('fs');

async function createSheets() {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'sa-key.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    const res = await sheets.spreadsheets.create({
        requestBody: {
            properties: {
                title: 'WordPress VRT Results'
            }
        }
    });
    
    console.log('Sheets ID:', res.data.spreadsheetId);
    fs.appendFileSync('.env', \`SHEET_ID=\${res.data.spreadsheetId}\n\`);
}

createSheets().catch(console.error);
EOF

node create-sheets.js
SHEET_ID=$(grep SHEET_ID .env | cut -d= -f2)
echo -e "${GREEN}✅ Google Sheets設定完了${NC}"
echo "Sheets ID: $SHEET_ID"

# 9. Cloud Scheduler設定
echo -e "${YELLOW}⏰ Step 9: Cloud Scheduler設定${NC}"

# 毎日3時のBaseline撮影
gcloud scheduler jobs create http daily-baseline \
    --schedule="0 3 * * *" \
    --uri="$CLOUD_RUN_URL/batch-check" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --message-body='{"sites":"all","mode":"baseline"}' \
    --oidc-service-account-email=$SA_EMAIL \
    --time-zone="Asia/Tokyo"

# 毎日9時のAfter撮影+比較
gcloud scheduler jobs create http daily-after-compare \
    --schedule="0 9 * * *" \
    --uri="$CLOUD_RUN_URL/batch-check" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --message-body='{"sites":"all","mode":"after","compare":true}' \
    --oidc-service-account-email=$SA_EMAIL \
    --time-zone="Asia/Tokyo"

echo -e "${GREEN}✅ Cloud Scheduler設定完了${NC}"

# 10. 設定ファイル生成
echo -e "${YELLOW}📝 Step 10: 設定ファイル生成${NC}"

cat > .env.production << EOF
# WordPress VRT Production Environment
GCP_PROJECT_ID=$PROJECT_ID
CLOUD_RUN_URL=$CLOUD_RUN_URL
DRIVE_ROOT=$DRIVE_ROOT
SHEET_ID=$SHEET_ID
SERVICE_ACCOUNT_EMAIL=$SA_EMAIL
REGION=$REGION

# Optional: Add your webhook URLs
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK
EOF

# 設定情報をJSONでも出力
cat > setup-info.json << EOF
{
  "projectId": "$PROJECT_ID",
  "cloudRunUrl": "$CLOUD_RUN_URL",
  "driveRoot": "$DRIVE_ROOT",
  "sheetId": "$SHEET_ID",
  "serviceAccountEmail": "$SA_EMAIL",
  "region": "$REGION",
  "setupDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo -e "${GREEN}✅ 設定ファイル生成完了${NC}"

# 11. 完了メッセージ
echo ""
echo -e "${GREEN}🎉 WordPress VRT 自動設定完了！${NC}"
echo "=================================="
echo ""
echo -e "${BLUE}📋 設定情報:${NC}"
echo "Google Sheets: https://docs.google.com/spreadsheets/d/$SHEET_ID"
echo "Cloud Run: $CLOUD_RUN_URL"
echo "Drive Folder: https://drive.google.com/drive/folders/$DRIVE_ROOT"
echo ""
echo -e "${BLUE}🚀 次のステップ:${NC}"
echo "1. Google Sheetsを開く"
echo "2. 'サイト管理'タブでサイトを追加"
echo "3. '実行'タブで「Full実行」をクリック"
echo ""
echo -e "${YELLOW}⚠️  通知設定 (オプション):${NC}"
echo "Slack通知を有効にするには:"
echo "export SLACK_WEBHOOK_URL='https://hooks.slack.com/services/YOUR/WEBHOOK'"
echo ""
echo -e "${GREEN}設定ファイル: .env.production${NC}"
echo -e "${GREEN}設定情報: setup-info.json${NC}"

# クリーンアップ
rm -f create-drive-folder.js create-sheets.js

echo ""
echo -e "${GREEN}✨ すべて完了！すぐに使い始められます！${NC}"