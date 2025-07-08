#!/bin/bash

# WordPress Visual Diff Checker - 自動セットアップスクリプト
# 使用方法: ./setup/auto-setup.sh YOUR_PROJECT_ID

set -e

# カラー出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 WordPress Visual Diff Checker 自動セットアップ開始${NC}"
echo "=============================================="

# 引数チェック
if [ -z "$1" ]; then
    echo -e "${RED}❌ エラー: GCP プロジェクト ID を指定してください${NC}"
    echo "使用方法: ./setup/auto-setup.sh YOUR_PROJECT_ID"
    exit 1
fi

PROJECT_ID=$1
REGION="asia-northeast1"

echo -e "${YELLOW}📋 設定値:${NC}"
echo "  プロジェクト ID: $PROJECT_ID"
echo "  リージョン: $REGION"
echo ""

# gcloud コマンドの確認
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI がインストールされていません${NC}"
    echo "インストール方法: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# 認証確認
echo -e "${BLUE}🔐 Google Cloud 認証確認...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${YELLOW}⚠️ Google Cloud にログインしてください${NC}"
    gcloud auth login
fi

# プロジェクト作成・選択
echo -e "${BLUE}🏗️ GCP プロジェクトのセットアップ...${NC}"
if gcloud projects describe $PROJECT_ID &>/dev/null; then
    echo "✅ プロジェクト $PROJECT_ID は既に存在します"
else
    echo "📝 プロジェクト $PROJECT_ID を作成中..."
    gcloud projects create $PROJECT_ID --name="WordPress Visual Diff Checker"
fi

gcloud config set project $PROJECT_ID

# 請求アカウントの確認（警告のみ）
echo -e "${YELLOW}💳 請求アカウントの確認...${NC}"
if ! gcloud billing projects describe $PROJECT_ID &>/dev/null; then
    echo -e "${YELLOW}⚠️ 請求アカウントが設定されていません${NC}"
    echo "   設定方法: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
    echo "   ※ 機能制限される可能性があります"
fi

# API の有効化
echo -e "${BLUE}🔧 必要な API を有効化中...${NC}"
APIS=(
    "run.googleapis.com"
    "cloudfunctions.googleapis.com" 
    "firestore.googleapis.com"
    "drive.googleapis.com"
    "sheets.googleapis.com"
    "cloudbuild.googleapis.com"
    "cloudscheduler.googleapis.com"
    "cloudtasks.googleapis.com"
    "secretmanager.googleapis.com"
    "monitoring.googleapis.com"
    "logging.googleapis.com"
)

for api in "${APIS[@]}"; do
    echo "  📡 $api を有効化中..."
    gcloud services enable $api
done

# Firestore の初期化
echo -e "${BLUE}📊 Firestore データベース初期化...${NC}"
if ! gcloud firestore databases describe --region=$REGION &>/dev/null; then
    echo "  🔨 Firestore データベースを作成中..."
    gcloud firestore databases create --region=$REGION
else
    echo "  ✅ Firestore データベースは既に存在します"
fi

# サービスアカウント作成
echo -e "${BLUE}🔑 サービスアカウント作成...${NC}"
SA_NAME="vrt-runner"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

if gcloud iam service-accounts describe $SA_EMAIL &>/dev/null; then
    echo "  ✅ サービスアカウントは既に存在します"
else
    echo "  🔨 サービスアカウントを作成中..."
    gcloud iam service-accounts create $SA_NAME \
        --display-name="VRT Runner Service Account" \
        --description="Service account for WordPress Visual Diff Checker"
fi

# IAM 権限の設定
echo -e "${BLUE}🛡️ IAM 権限設定...${NC}"
ROLES=(
    "roles/run.invoker"
    "roles/datastore.user"
    "roles/storage.admin"
    "roles/cloudfunctions.invoker"
    "roles/cloudscheduler.admin"
    "roles/cloudtasks.admin"
    "roles/secretmanager.accessor"
    "roles/monitoring.metricWriter"
    "roles/logging.logWriter"
)

for role in "${ROLES[@]}"; do
    echo "  🔐 $role を付与中..."
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_EMAIL" \
        --role="$role" \
        --quiet
done

# サービスアカウントキーの作成
echo -e "${BLUE}🗝️ サービスアカウントキー生成...${NC}"
KEY_FILE="setup/service-account-key.json"
if [ -f "$KEY_FILE" ]; then
    echo "  ⚠️ 既存のキーファイルを削除します"
    rm "$KEY_FILE"
fi

gcloud iam service-accounts keys create $KEY_FILE \
    --iam-account=$SA_EMAIL

echo "  ✅ サービスアカウントキーを $KEY_FILE に保存しました"

# Cloud Storage バケット作成（オプション）
echo -e "${BLUE}🪣 Cloud Storage バケット作成...${NC}"
BUCKET_NAME="$PROJECT_ID-vrt-storage"
if gsutil ls -b gs://$BUCKET_NAME &>/dev/null; then
    echo "  ✅ バケット $BUCKET_NAME は既に存在します"
else
    echo "  🔨 バケット $BUCKET_NAME を作成中..."
    gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://$BUCKET_NAME
    
    # サービスアカウントに権限付与
    gsutil iam ch serviceAccount:$SA_EMAIL:objectAdmin gs://$BUCKET_NAME
fi

# 環境変数ファイル生成
echo -e "${BLUE}📝 環境設定ファイル生成...${NC}"
cat > setup/generated.env << EOF
# WordPress Visual Diff Checker - 自動生成設定
# 生成日時: $(date)

# GCP 基本設定
GCP_PROJECT_ID=$PROJECT_ID
GOOGLE_APPLICATION_CREDENTIALS=./setup/service-account-key.json
REGION=$REGION

# サービスアカウント
SERVICE_ACCOUNT_EMAIL=$SA_EMAIL

# Cloud Storage
BUCKET_NAME=$BUCKET_NAME

# Cloud Run URL (デプロイ後に更新)
CLOUD_RUN_URL=https://vrt-runner-$REGION-$PROJECT_ID.a.run.app

# Firestore
FIRESTORE_PROJECT_ID=$PROJECT_ID

# 以下は手動で設定してください:
# DRIVE_ROOT=YOUR_DRIVE_FOLDER_ID
# SHEET_ID=YOUR_SHEET_ID  
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx

# VRT 設定
MAX_CRAWL_URLS=300
DIFF_THRESHOLD=2.0
SCREENSHOT_VIEWPORT_WIDTH=1920
SCREENSHOT_VIEWPORT_HEIGHT=1080
DATA_RETENTION_DAYS=90
EOF

# GitHub Actions 用の設定情報出力
echo -e "${BLUE}🐙 GitHub Actions 設定情報生成...${NC}"
cat > setup/github-secrets.txt << EOF
GitHub Secrets 設定用の値:

GCP_PROJECT_ID: $PROJECT_ID
GOOGLE_APPLICATION_CREDENTIALS_JSON: $(cat $KEY_FILE | base64 -w 0)

以下は手動で設定してください:
DRIVE_ROOT: YOUR_DRIVE_FOLDER_ID
SHEET_ID: YOUR_SHEET_ID
SLACK_WEBHOOK_URL: YOUR_SLACK_WEBHOOK_URL
DISCORD_WEBHOOK_URL: YOUR_DISCORD_WEBHOOK_URL
EOF

echo ""
echo -e "${GREEN}🎉 自動セットアップ完了！${NC}"
echo "=============================================="
echo ""
echo -e "${YELLOW}📋 次に必要な手動設定:${NC}"
echo ""
echo "1. 📁 Google Drive フォルダ作成:"
echo "   https://drive.google.com → 新規フォルダ → 共有設定"
echo ""
echo "2. 📊 Google Sheets 作成:"
echo "   https://sheets.google.com → 新規 → 共有設定"
echo ""
echo "3. 🐙 GitHub Secrets 設定:"
echo "   setup/github-secrets.txt の内容をコピー"
echo ""
echo "4. 🚀 デプロイ実行:"
echo "   git push origin main"
echo ""
echo "5. 📱 WordPress プラグインインストール:"
echo "   wordpress-plugin/wordpress-vrt-notifier.php"
echo ""
echo -e "${BLUE}📄 生成されたファイル:${NC}"
echo "  - setup/service-account-key.json (秘匿情報)"
echo "  - setup/generated.env (環境設定)" 
echo "  - setup/github-secrets.txt (GitHub設定用)"
echo ""
echo -e "${RED}⚠️ 重要: service-account-key.json は Git にコミットしないでください${NC}"
echo ""
echo -e "${GREEN}✨ セットアップ完了率: 85% ${NC}"
echo "残り15%は上記の手動設定のみです"