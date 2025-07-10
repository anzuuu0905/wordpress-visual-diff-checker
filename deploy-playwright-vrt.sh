#!/bin/bash
set -e

echo "🚀 Playwright WordPress VRT デプロイメント"
echo "============================================="

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 設定
PROJECT_ID="urlsearch-423209"
REGION="us-central1"
FUNCTION_NAME="wordpress-vrt"
BUCKET_NAME="wordpress-vrt-screenshots-${PROJECT_ID}"

echo -e "${BLUE}📋 デプロイ設定${NC}"
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Function: $FUNCTION_NAME"
echo "Bucket: $BUCKET_NAME"
echo ""

# 1. GCP設定確認
echo -e "${YELLOW}🔐 Step 1: GCP設定確認${NC}"
gcloud config set project $PROJECT_ID
echo -e "${GREEN}✅ プロジェクト設定完了${NC}"

# 2. 必要なAPI有効化
echo -e "${YELLOW}🔌 Step 2: API有効化${NC}"
echo "必要なAPIを有効化中..."

apis=(
    "cloudfunctions.googleapis.com"
    "cloudbuild.googleapis.com"
    "storage.googleapis.com"
    "firestore.googleapis.com"
)

for api in "${apis[@]}"; do
    echo "Enabling $api..."
    gcloud services enable $api --project=$PROJECT_ID
done

echo -e "${GREEN}✅ API有効化完了${NC}"

# 3. Cloud Storageバケット作成
echo -e "${YELLOW}📦 Step 3: Cloud Storageバケット作成${NC}"

if ! gsutil ls -b gs://$BUCKET_NAME > /dev/null 2>&1; then
    echo "バケットを作成中: $BUCKET_NAME"
    gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://$BUCKET_NAME
    
    # パブリック読み取り権限を付与（画像閲覧用）
    gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME
    
    echo -e "${GREEN}✅ バケット作成完了${NC}"
else
    echo -e "${GREEN}✅ バケットは既に存在します${NC}"
fi

# 4. Firestore初期化
echo -e "${YELLOW}🗄 Step 4: Firestore初期化${NC}"

if ! gcloud firestore databases describe --region=$REGION --project=$PROJECT_ID > /dev/null 2>&1; then
    echo "Firestoreデータベースを作成中..."
    gcloud firestore databases create --region=$REGION --project=$PROJECT_ID
    echo -e "${GREEN}✅ Firestore作成完了${NC}"
else
    echo -e "${GREEN}✅ Firestoreは既に初期化済み${NC}"
fi

# 5. Cloud Functions デプロイ
echo -e "${YELLOW}🚀 Step 5: Cloud Functions デプロイ${NC}"

cd cloud-functions/vrt-playwright

echo "Cloud Functionsをデプロイ中..."

gcloud functions deploy $FUNCTION_NAME \
    --runtime nodejs18 \
    --trigger-http \
    --allow-unauthenticated \
    --memory 2GB \
    --timeout 540s \
    --region $REGION \
    --project $PROJECT_ID \
    --set-env-vars "STORAGE_BUCKET=$BUCKET_NAME,GCP_PROJECT_ID=$PROJECT_ID" \
    --max-instances 10

# Cloud Functions URL取得
FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format='value(httpsTrigger.url)')

echo -e "${GREEN}✅ Cloud Functions デプロイ完了${NC}"
echo "Function URL: $FUNCTION_URL"

cd ../..

# 6. 環境変数ファイル作成
echo -e "${YELLOW}📝 Step 6: 環境設定ファイル作成${NC}"

cat > .env.playwright << EOF
# Playwright WordPress VRT Production Environment
GCP_PROJECT_ID=$PROJECT_ID
CLOUD_FUNCTION_URL=$FUNCTION_URL
STORAGE_BUCKET=$BUCKET_NAME
REGION=$REGION

# 手動で設定してください:
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK
NOTIFICATION_EMAIL=your-email@example.com
EOF

# 7. テスト実行
echo -e "${YELLOW}🧪 Step 7: 接続テスト${NC}"

echo "Cloud Functionsへの接続をテスト中..."

TEST_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{"action": "test"}' \
    "$FUNCTION_URL" || echo "ERROR")

if [[ "$TEST_RESPONSE" == *"ERROR"* ]]; then
    echo -e "${RED}⚠️ 接続テストに失敗しました${NC}"
    echo "手動でテストしてください: $FUNCTION_URL"
else
    echo -e "${GREEN}✅ 接続テスト成功${NC}"
fi

# 8. Google Apps Script設定の更新
echo -e "${YELLOW}⚙️ Step 8: Google Apps Script設定${NC}"

cat > gas-config-update.js << EOF
// Google Apps Scriptの設定を更新するためのコード
// 以下をApps Scriptエディタで実行してください:

function updateCloudFunctionURL() {
  PropertiesService.getScriptProperties().setProperty(
    'CLOUD_FUNCTION_URL', 
    '$FUNCTION_URL'
  );
  
  Browser.msgBox('設定更新', 
    'Cloud Function URLが更新されました:\\n$FUNCTION_URL', 
    Browser.Buttons.OK);
}
EOF

echo "Google Apps Script用の設定更新コードを生成しました: gas-config-update.js"

# 9. 完了メッセージ
echo ""
echo -e "${GREEN}🎉 Playwright WordPress VRT デプロイ完了！${NC}"
echo "=================================================="
echo ""
echo -e "${BLUE}📋 デプロイ情報:${NC}"
echo "Cloud Function URL: $FUNCTION_URL"
echo "Storage Bucket: gs://$BUCKET_NAME"
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo ""
echo -e "${BLUE}🚀 次のステップ:${NC}"
echo "1. Google Apps Scriptエディタを開く"
echo "2. PlaywrightVRT.gsのコードをコピペ"
echo "3. gas-config-update.jsのupdateCloudFunctionURL()を実行"
echo "4. setupPlaywrightVRT()を実行して初期セットアップ"
echo "5. runHighPrecisionVRT()でテスト実行"
echo ""
echo -e "${YELLOW}⚙️ 設定ファイル:${NC}"
echo "環境設定: .env.playwright"
echo "GAS設定更新: gas-config-update.js"
echo ""
echo -e "${BLUE}📚 使用可能な機能:${NC}"
echo "• 高精度スクリーンショット比較（Playwright）"
echo "• ピクセル単位での差分検出（pixelmatch）"
echo "• デスクトップ + モバイル対応"
echo "• WordPress特化の最適化"
echo "• 自動通知（Slack/Discord）"
echo "• バッチ処理（複数サイト一括）"
echo ""
echo -e "${GREEN}✨ すべて完了！高精度WordPress VRTをお楽しみください！${NC}"

# クリーンアップ
rm -f gas-config-update.js