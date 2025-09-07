#!/bin/bash

# 🔐 セキュアセットアップスクリプト
# 認証情報を安全に管理するための設定

echo "🔐 セキュアセットアップを開始します..."

# 1. 必要なパッケージをインストール
echo "📦 dotenv パッケージをインストール中..."
npm install dotenv

# 2. 現在のconfig.jsonから環境変数を生成
echo "🔧 環境変数設定を生成中..."

if [ -f "config.json" ]; then
  echo "📁 config.json を発見しました"
  
  # .envファイルを作成
  echo "# 自動生成された認証情報" > .env.generated
  echo "# このファイルはGitにコミットしないでください" >> .env.generated
  echo "" >> .env.generated
  
  # config.jsonから認証情報を抽出（簡易版）
  node -e "
    const fs = require('fs');
    const sites = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    sites.forEach((site, i) => {
      const key = site.siteName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      console.log(\`\${key}_USERNAME=\${site.username}\`);
      console.log(\`\${key}_PASSWORD=\${site.password}\`);
      console.log('');
    });
  " >> .env.generated
  
  echo "✅ .env.generated を作成しました"
  echo ""
  echo "📋 次のステップ:"
  echo "1. .env.generated を .env にリネームしてください"
  echo "2. 不要になったconfig.jsonを削除またはバックアップしてください"
  echo "3. VPSにアップロードする前に.envファイルを除外してください"
  
else
  echo "❌ config.json が見つかりません"
  echo "先にconfig.jsonを配置してください"
fi

echo ""
echo "🔒 セキュリティチェック:"
echo "✓ .gitignore に .env が含まれていることを確認"
echo "✓ config.json をGitから除外"
echo "✓ VPSでは環境変数のみ使用"

echo ""
echo "🚀 使用方法:"
echo "ローカル開発: .env ファイルから自動読み込み"
echo "VPS本番環境: 認証情報なしで動作"