# WordPress VRT - 1分完全自動セットアップ (Windows PowerShell)

Write-Host "🚀 WordPress VRT - 1分完全自動セットアップ (Windows)" -ForegroundColor Blue
Write-Host "========================================"

# 管理者権限確認
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "⚠️ 管理者権限で実行してください" -ForegroundColor Red
    Write-Host "PowerShell を右クリック → '管理者として実行' を選択してください"
    exit 1
}

# プロジェクトID自動生成
$timestamp = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$randomSuffix = -join ((1..6) | ForEach-Object { '{0:X}' -f (Get-Random -Maximum 16) })
$PROJECT_ID = "wp-vrt-$timestamp-$randomSuffix".ToLower()

Write-Host "📋 自動生成された設定:" -ForegroundColor Yellow
Write-Host "  プロジェクト ID: $PROJECT_ID"
Write-Host ""

# Chocolatey インストール（パッケージ管理）
Write-Host "🔧 必要なツールをインストール中..." -ForegroundColor Blue
if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "  📥 Chocolatey をインストール中..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:PATH += ";C:\ProgramData\chocolatey\bin"
}

# Google Cloud CLI インストール
if (!(Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "  📥 Google Cloud CLI をインストール中..."
    choco install gcloudsdk -y
    $env:PATH += ";C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin"
}

# GitHub CLI インストール
if (!(Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "  📥 GitHub CLI をインストール中..."
    choco install gh -y
}

# Git インストール
if (!(Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "  📥 Git をインストール中..."
    choco install git -y
}

# PowerShell セッション更新
refreshenv

# 認証
Write-Host "🔐 自動認証..." -ForegroundColor Blue

# Google Cloud 認証
$gcloudAuth = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
if (!$gcloudAuth) {
    Write-Host "  🌐 Google Cloud に自動ログイン..."
    gcloud auth login --brief
}

# GitHub 認証
$ghAuth = gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  🐙 GitHub に自動ログイン..."
    gh auth login --web
}

# リポジトリセットアップ
Write-Host "📂 リポジトリセットアップ..." -ForegroundColor Blue
$repoName = "wordpress-visual-diff-checker"

if (!(Test-Path $repoName)) {
    Write-Host "  🍴 リポジトリをフォーク中..."
    gh repo fork anzuuu0905/wordpress-visual-diff-checker --clone
    Set-Location $repoName
} else {
    Set-Location $repoName
    git pull origin main
}

# GCP セットアップ
Write-Host "☁️ GCP 環境を自動構築中..." -ForegroundColor Blue

# プロジェクト作成
gcloud projects create $PROJECT_ID --name="WordPress VRT Auto" --quiet

# 請求アカウント設定
$billingAccount = gcloud billing accounts list --format="value(name)" --limit=1 2>$null
if ($billingAccount) {
    gcloud billing projects link $PROJECT_ID --billing-account=$billingAccount --quiet
}

gcloud config set project $PROJECT_ID

# API 有効化
Write-Host "  🔧 API を一括有効化中..."
$apis = @(
    "run.googleapis.com",
    "cloudfunctions.googleapis.com",
    "firestore.googleapis.com", 
    "drive.googleapis.com",
    "sheets.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudtasks.googleapis.com",
    "secretmanager.googleapis.com"
)

gcloud services enable $apis --quiet

# Firestore 初期化
gcloud firestore databases create --region=asia-northeast1 --quiet

# サービスアカウント作成
$saEmail = "vrt-runner@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts create vrt-runner --display-name="VRT Auto Runner" --quiet

# 権限付与
$roles = @(
    "roles/run.invoker",
    "roles/datastore.user", 
    "roles/storage.admin",
    "roles/cloudfunctions.invoker",
    "roles/cloudscheduler.admin",
    "roles/secretmanager.accessor"
)

foreach ($role in $roles) {
    gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$saEmail" --role="$role" --quiet
}

# サービスアカウントキー生成
gcloud iam service-accounts keys create sa-key.json --iam-account=$saEmail --quiet

# Google Drive フォルダ作成
Write-Host "📁 Google Drive フォルダ自動作成..." -ForegroundColor Blue
$accessToken = gcloud auth print-access-token

$driveBody = @{
    name = "VRT Screenshots Auto"
    mimeType = "application/vnd.google-apps.folder"
    parents = @("root")
} | ConvertTo-Json

$driveResponse = Invoke-RestMethod -Uri "https://www.googleapis.com/drive/v3/files" `
    -Method POST `
    -Headers @{"Authorization" = "Bearer $accessToken"; "Content-Type" = "application/json"} `
    -Body $driveBody

$driveId = $driveResponse.id

# フォルダ権限設定
$permissionBody = @{
    role = "writer"
    type = "user"
    emailAddress = $saEmail
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://www.googleapis.com/drive/v3/files/$driveId/permissions" `
    -Method POST `
    -Headers @{"Authorization" = "Bearer $accessToken"; "Content-Type" = "application/json"} `
    -Body $permissionBody | Out-Null

# Google Sheets 作成
Write-Host "📊 Google Sheets 自動作成..." -ForegroundColor Blue
$sheetsBody = @{
    properties = @{
        title = "VRT Results Auto"
    }
} | ConvertTo-Json

$sheetsResponse = Invoke-RestMethod -Uri "https://sheets.googleapis.com/v4/spreadsheets" `
    -Method POST `
    -Headers @{"Authorization" = "Bearer $accessToken"; "Content-Type" = "application/json"} `
    -Body $sheetsBody

$sheetId = $sheetsResponse.spreadsheetId

# Sheets 権限設定
Invoke-RestMethod -Uri "https://www.googleapis.com/drive/v3/files/$sheetId/permissions" `
    -Method POST `
    -Headers @{"Authorization" = "Bearer $accessToken"; "Content-Type" = "application/json"} `
    -Body $permissionBody | Out-Null

# GitHub Secrets 設定
Write-Host "🐙 GitHub Secrets 自動設定..." -ForegroundColor Blue
gh secret set GCP_PROJECT_ID --body $PROJECT_ID
$saKeyBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("sa-key.json"))
gh secret set GOOGLE_APPLICATION_CREDENTIALS_JSON --body $saKeyBase64
gh secret set DRIVE_ROOT --body $driveId
gh secret set SHEET_ID --body $sheetId
gh secret set SLACK_WEBHOOK_URL --body "" | Out-Null
gh secret set DISCORD_WEBHOOK_URL --body "" | Out-Null

# WordPress プラグイン情報
$repoInfo = gh repo view --json owner,name | ConvertFrom-Json
$pluginUrl = "https://raw.githubusercontent.com/$($repoInfo.owner.login)/$($repoInfo.name)/main/wordpress-plugin/wordpress-vrt-auto.php"

# 自動デプロイ
Write-Host "🚀 自動デプロイ開始..." -ForegroundColor Blue
git add .
git commit -m "Auto setup completed for project $PROJECT_ID" --quiet
git push origin main

# デプロイ完了待機
Write-Host "⏳ デプロイ完了を待機中（最大10分）..." -ForegroundColor Yellow
$deploySuccess = $false
for ($i = 1; $i -le 60; $i++) {
    $runStatus = gh run list --limit 1 --json status,conclusion | ConvertFrom-Json
    if ($runStatus.conclusion -eq "success") {
        $deploySuccess = $true
        break
    }
    Start-Sleep 10
    Write-Host "." -NoNewline
}

Write-Host ""

if ($deploySuccess) {
    Write-Host "✅ デプロイ完了！" -ForegroundColor Green
} else {
    Write-Host "⚠️ デプロイが進行中です。GitHub Actions で進捗を確認してください。" -ForegroundColor Yellow
}

# 結果出力
Write-Host ""
Write-Host "🎉 1分自動セットアップ完了！" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "📋 セットアップ情報:" -ForegroundColor Blue
Write-Host "  🌐 プロジェクト ID: $PROJECT_ID"
Write-Host "  📁 Drive フォルダ: https://drive.google.com/drive/folders/$driveId"
Write-Host "  📊 Sheets: https://docs.google.com/spreadsheets/d/$sheetId"
Write-Host "  🐙 GitHub リポジトリ: $(gh repo view --json url --jq '.url')"
Write-Host ""
Write-Host "📱 WordPress プラグイン:" -ForegroundColor Blue
Write-Host "  ダウンロード: $pluginUrl"
Write-Host "  各WordPressサイトにアップロード・有効化してください"
Write-Host ""
Write-Host "🎯 これで設定完了！" -ForegroundColor Green
Write-Host "WordPress プラグインをインストールすれば、完全自動化が開始されます。"

# クリーンアップ
Remove-Item sa-key.json -Force

Write-Host ""
Write-Host "💡 次のステップ:" -ForegroundColor Yellow
Write-Host "1. WordPress プラグインをダウンロード・インストール"
Write-Host "2. Web UI でサイトを登録"
Write-Host "3. 完全自動化の開始！"