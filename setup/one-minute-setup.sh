#!/bin/bash

# WordPress VRT - 1分完全自動セットアップ
# 使用方法: curl -sL https://raw.githubusercontent.com/anzuuu0905/wordpress-visual-diff-checker/main/setup/one-minute-setup.sh | bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 WordPress VRT - 1分完全自動セットアップ${NC}"
echo "========================================"

# プロジェクトIDを自動生成
TIMESTAMP=$(date +%s)
RANDOM_SUFFIX=$(openssl rand -hex 3)
PROJECT_ID="wp-vrt-${TIMESTAMP}-${RANDOM_SUFFIX}"

echo -e "${YELLOW}📋 自動生成された設定:${NC}"
echo "  プロジェクト ID: $PROJECT_ID"
echo ""

# 必要なツールの確認とインストール
echo -e "${BLUE}🔧 必要なツールの確認...${NC}"

# gcloud CLI 自動インストール
if ! command -v gcloud &> /dev/null; then
    echo "  📥 Google Cloud CLI をインストール中..."
    curl https://sdk.cloud.google.com | bash
    exec -l $SHELL
    source ~/google-cloud-sdk/path.bash.inc
fi

# GitHub CLI 自動インストール
if ! command -v gh &> /dev/null; then
    echo "  📥 GitHub CLI をインストール中..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install gh
    else
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        sudo apt update && sudo apt install gh
    fi
fi

# 認証確認・自動ログイン
echo -e "${BLUE}🔐 自動認証...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "  🌐 Google Cloud に自動ログイン..."
    gcloud auth login --brief
fi

if ! gh auth status &>/dev/null; then
    echo "  🐙 GitHub に自動ログイン..."
    gh auth login --web
fi

# リポジトリの自動フォーク・クローン
echo -e "${BLUE}📂 リポジトリセットアップ...${NC}"
REPO_NAME="wordpress-visual-diff-checker"
if [ ! -d "$REPO_NAME" ]; then
    echo "  🍴 リポジトリをフォーク中..."
    gh repo fork anzuuu0905/wordpress-visual-diff-checker --clone
    cd $REPO_NAME
else
    cd $REPO_NAME
    git pull origin main
fi

# GCP 完全自動セットアップ
echo -e "${BLUE}☁️ GCP 環境を自動構築中...${NC}"

# プロジェクト作成
gcloud projects create $PROJECT_ID --name="WordPress VRT Auto" --quiet

# 請求アカウントの自動設定
BILLING_ACCOUNT=$(gcloud billing accounts list --format="value(name)" --limit=1)
if [ ! -z "$BILLING_ACCOUNT" ]; then
    gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT --quiet
fi

gcloud config set project $PROJECT_ID

# API 一括有効化
echo "  🔧 API を一括有効化中..."
gcloud services enable \
    run.googleapis.com \
    cloudfunctions.googleapis.com \
    firestore.googleapis.com \
    drive.googleapis.com \
    sheets.googleapis.com \
    cloudbuild.googleapis.com \
    cloudscheduler.googleapis.com \
    cloudtasks.googleapis.com \
    secretmanager.googleapis.com \
    --quiet

# Firestore 自動初期化
gcloud firestore databases create --region=asia-northeast1 --quiet

# サービスアカウント自動作成
SA_EMAIL="vrt-runner@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts create vrt-runner \
    --display-name="VRT Auto Runner" --quiet

# 権限一括付与
ROLES="roles/run.invoker roles/datastore.user roles/storage.admin roles/cloudfunctions.invoker roles/cloudscheduler.admin roles/secretmanager.accessor"
for role in $ROLES; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_EMAIL" \
        --role="$role" --quiet
done

# サービスアカウントキー生成
gcloud iam service-accounts keys create sa-key.json \
    --iam-account=$SA_EMAIL --quiet

# Google Drive フォルダ自動作成（APIキー使用）
echo -e "${BLUE}📁 Google Drive フォルダ自動作成...${NC}"
DRIVE_FOLDER_ID=$(curl -s -X POST \
    "https://www.googleapis.com/drive/v3/files" \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "VRT Screenshots Auto",
        "mimeType": "application/vnd.google-apps.folder",
        "parents": ["root"]
    }' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

# フォルダを公開設定
curl -s -X POST \
    "https://www.googleapis.com/drive/v3/files/$DRIVE_FOLDER_ID/permissions" \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "Content-Type: application/json" \
    -d '{
        "role": "writer",
        "type": "user",
        "emailAddress": "'$SA_EMAIL'"
    }' > /dev/null

# Google Sheets 自動作成
echo -e "${BLUE}📊 Google Sheets 自動作成...${NC}"
SHEET_ID=$(curl -s -X POST \
    "https://sheets.googleapis.com/v4/spreadsheets" \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "Content-Type: application/json" \
    -d '{
        "properties": {
            "title": "VRT Results Auto"
        }
    }' | grep -o '"spreadsheetId":"[^"]*"' | cut -d'"' -f4)

# Sheets にサービスアカウント権限付与
curl -s -X POST \
    "https://www.googleapis.com/drive/v3/files/$SHEET_ID/permissions" \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "Content-Type: application/json" \
    -d '{
        "role": "writer",
        "type": "user",
        "emailAddress": "'$SA_EMAIL'"
    }' > /dev/null

# GitHub Secrets 自動設定
echo -e "${BLUE}🐙 GitHub Secrets 自動設定...${NC}"
gh secret set GCP_PROJECT_ID --body "$PROJECT_ID"
gh secret set GOOGLE_APPLICATION_CREDENTIALS_JSON --body "$(cat sa-key.json | base64 -w 0)"
gh secret set DRIVE_ROOT --body "$DRIVE_FOLDER_ID"
gh secret set SHEET_ID --body "$SHEET_ID"

# デフォルトのWebhook URL設定（空でもOK）
gh secret set SLACK_WEBHOOK_URL --body "" || true
gh secret set DISCORD_WEBHOOK_URL --body "" || true

# WordPress プラグインファイルをダウンロード可能な場所に配置
echo -e "${BLUE}📱 WordPress プラグイン準備...${NC}"
PLUGIN_URL="https://raw.githubusercontent.com/$(gh repo view --json owner,name -q '.owner.login + "/" + .name')/main/wordpress-plugin/wordpress-vrt-auto.php"

# 自動デプロイ開始
echo -e "${BLUE}🚀 自動デプロイ開始...${NC}"
git add .
git commit -m "Auto setup completed for project $PROJECT_ID" --quiet
git push origin main

# デプロイ完了待機
echo -e "${YELLOW}⏳ デプロイ完了を待機中（最大10分）...${NC}"
DEPLOY_SUCCESS=false
for i in {1..60}; do
    if gh run list --limit 1 --json status,conclusion | grep -q '"conclusion":"success"'; then
        DEPLOY_SUCCESS=true
        break
    fi
    sleep 10
    echo -n "."
done

echo ""

if [ "$DEPLOY_SUCCESS" = true ]; then
    echo -e "${GREEN}✅ デプロイ完了！${NC}"
else
    echo -e "${YELLOW}⚠️ デプロイが進行中です。GitHub Actions で進捗を確認してください。${NC}"
fi

# 最終的な情報出力
echo ""
echo -e "${GREEN}🎉 1分自動セットアップ完了！${NC}"
echo "========================================"
echo ""
echo -e "${BLUE}📋 セットアップ情報:${NC}"
echo "  🌐 プロジェクト ID: $PROJECT_ID"
echo "  📁 Drive フォルダ: https://drive.google.com/drive/folders/$DRIVE_FOLDER_ID"
echo "  📊 Sheets: https://docs.google.com/spreadsheets/d/$SHEET_ID"
echo "  🐙 GitHub リポジトリ: $(gh repo view --json url -q '.url')"
echo ""
echo -e "${BLUE}📱 WordPress プラグイン:${NC}"
echo "  ダウンロード: $PLUGIN_URL"
echo "  各WordPressサイトにアップロード・有効化してください"
echo ""
echo -e "${BLUE}🔗 Web UI:${NC}"
echo "  GitHub Actions 完了後、デプロイログから Web UI URL を確認してください"
echo ""
echo -e "${GREEN}🎯 これで設定完了！${NC}"
echo "WordPress プラグインをインストールすれば、完全自動化が開始されます。"

# クリーンアップ
rm -f sa-key.json

echo ""
echo -e "${YELLOW}💡 次のステップ:${NC}"
echo "1. WordPress プラグインをダウンロード・インストール"
echo "2. Web UI でサイトを登録"
echo "3. 完全自動化の開始！"