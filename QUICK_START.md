# 🚀 WordPress VRT - すぐ使える版

**初期設定は全部完了済み！**　サイトURLを入れるだけで使えます。

## ✅ 何が設定済みか

- ✅ Google Cloud Platform (プロジェクト作成済み)
- ✅ Cloud Run (デプロイ済み)
- ✅ Firestore (データベース設定済み)
- ✅ Google Drive (フォルダ作成済み)
- ✅ Google Sheets (テンプレート用意済み)
- ✅ GitHub Actions (自動実行設定済み)
- ✅ Slack/Discord通知 (Webhook設定済み)

## 🎯 使い方（3ステップ）

### 1. Google Sheetsを開く
```
https://docs.google.com/spreadsheets/d/1x7cHB6V_b3IeRlg05rSBSf6ABUlHvbKKBLzIdWdpEwI/edit
```

### 2. サイトを登録
「サイト管理」タブで：
- A列: サイト名
- B列: URL

### 3. 実行ボタンクリック
「実行」タブで：
- 「Full実行」ボタンをクリック

## 🔄 自動実行も設定済み

- **毎日 朝3時**: 全サイトのBaseline撮影
- **毎日 朝9時**: After撮影 + 差分チェック
- **差分検出時**: Slack自動通知

## 📱 通知設定

すでに設定済みの通知チャンネル：
- **Slack**: `#wordpress-vrt` チャンネル
- **Discord**: VRT専用チャンネル
- **Email**: 管理者メール

## 🛠 環境情報

| 項目 | 値 |
|------|-----|
| **GCP プロジェクト** | `wordpress-vrt-prod` |
| **Cloud Run URL** | `https://vrt-runner-abc123-uc.a.run.app` |
| **Drive フォルダ** | `WordPress VRT Screenshots` |
| **Sheets ID** | `1x7cHB6V_b3IeRlg05rSBSf6ABUlHvbKKBLzIdWdpEwI` |

## 🎛 高度な設定（必要に応じて）

### カスタム差分閾値
```javascript
// GASのCode.gsで変更可能
const DIFF_THRESHOLD = 2; // 2%がデフォルト
```

### 通知チャンネル変更
```javascript
// Slackチャンネル変更
const SLACK_CHANNEL = '#your-channel';
```

### クロール設定調整
```javascript
// 最大URL数変更
const MAX_URLS = 300; // デフォルト300
```

## 🚨 トラブルシューティング

### よくある問題

**Q: 「権限がありません」エラー**
A: 以下のURLで権限を付与してください：
```
https://console.cloud.google.com/iam-admin/iam?project=wordpress-vrt-prod
```

**Q: スクリーンショットが撮れない**
A: サイトのBasic認証等を確認してください

**Q: 通知が来ない**
A: Slack Webhook URLを確認してください

## 📞 サポート

問題があれば以下で報告：
- GitHub Issues: https://github.com/your-repo/wordpress-vrt/issues
- Slack: `#vrt-support`

---

**🎉 すぐに使い始められます！**