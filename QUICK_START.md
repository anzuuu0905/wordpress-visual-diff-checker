# 🚀 WordPress VRT - 20分クイックスタート

## 📋 必要なもの
- Google アカウント
- GitHub アカウント  
- WordPress 管理者権限

---

## ⚡ ステップ1: 自動セットアップ（5分）

### 1-1. リポジトリをフォーク
```
https://github.com/anzuuu0905/wordpress-visual-diff-checker
→ 右上の「Fork」ボタンをクリック
```

### 1-2. ローカルにクローン
```bash
git clone https://github.com/YOUR_USERNAME/wordpress-visual-diff-checker.git
cd wordpress-visual-diff-checker
```

### 1-3. 自動セットアップ実行
```bash
# 実行権限付与
chmod +x setup/auto-setup.sh

# 自動セットアップ実行（PROJECT_ID は任意の名前）
./setup/auto-setup.sh my-vrt-project-123
```

**✅ 完了すると以下が自動で作成されます:**
- GCP プロジェクト
- 必要な API 有効化
- サービスアカウント
- IAM 権限設定
- Firestore データベース

---

## 📁 ステップ2: Google Drive & Sheets（2分）

### 2-1. Google Drive フォルダ
1. [drive.google.com](https://drive.google.com) → 「新規」→「フォルダ」
2. 名前: `VRT Screenshots`
3. 右クリック → 「共有」→「リンクを知っている全員」
4. **フォルダID をコピー**（URL の最後の部分）

### 2-2. Google Sheets
1. [sheets.google.com](https://sheets.google.com) → 「空白」
2. 名前: `VRT Results`  
3. 「共有」→「リンクを知っている全員が編集可」
4. **スプレッドシートID をコピー**（URL の `/d/` と `/edit` の間）

---

## 🐙 ステップ3: GitHub 設定（3分）

### 3-1. GitHub Secrets 設定
リポジトリの `Settings` > `Secrets and variables` > `Actions` で以下を追加:

```
GCP_PROJECT_ID: my-vrt-project-123
DRIVE_ROOT: 1k7K1_ABC123DEF456（Drive フォルダID）
SHEET_ID: 1x7cHB6_GHI789JKL012（Sheets ID）
```

`setup/github-secrets.txt` にコピー用の値が生成されています。

### 3-2. 自動デプロイ開始
```bash
git add .
git commit -m "Initial setup completed"
git push origin main
```

**⏰ 5-10分でデプロイ完了**

---

## 📱 ステップ4: WordPress プラグイン（1分/サイト）

### 4-1. プラグインダウンロード
```
リポジトリから wordpress-plugin/wordpress-vrt-auto.php をダウンロード
```

### 4-2. WordPressにインストール
各 WordPress サイトで:
1. **管理画面** → **プラグイン** → **新規追加** → **プラグインのアップロード**
2. `wordpress-vrt-auto.php` をアップロード
3. **有効化**

**🎉 設定不要で即座に動作開始！**

---

## 🎯 ステップ5: 動作確認（5分）

### 5-1. WordPress プラグイン管理画面確認
1. WordPress 管理画面 → **設定** → **VRT Auto**
2. 「✅ 自動セットアップ完了」が表示されることを確認
3. **「🧪 テスト通知送信」** をクリック

### 5-2. Web UI でサイト登録
1. GitHub Actions の完了ログから **Web UI URL** を取得
2. Web UI にアクセス
3. 「新規サイト追加」でサイト情報入力
4. **「完全実行」** で初回 Baseline 撮影

---

## 🎊 完了！これで完全自動化開始

### ✅ 今後自動で実行されること

**毎日午前3時:**
```
全サイトの Baseline 自動更新
→ 最新の「正常な状態」を記録
```

**WordPress 更新時:**
```
1. プラグイン/テーマ更新
2. 5分後に自動でAfter撮影
3. 差分比較実行
4. 差分があればSlack/Discord通知
```

**毎日午前2時:**
```
90日以上前のデータを自動削除
→ ストレージ容量とコストを最適化
```

### 📱 通知例
```
🚨 自動検知: https://mysite.com
🔄 WordPress更新を検知
⚠️ 3 件の差分が検出されました

検出箇所:
- /contact/ (4.2%差分)
- /about/ (3.1%差分) 
- /products/ (2.8%差分)

📊 詳細: https://docs.google.com/spreadsheets/d/xxx
```

---

## 🔧 トラブルシューティング

### セットアップエラー
```bash
# ログ確認
gcloud functions logs read wordpressWebhook --limit=10

# 再デプロイ
git push origin main
```

### WordPress プラグインが通知しない
1. **設定** → **VRT Auto** で状態確認
2. **「🧪 テスト通知送信」** で接続テスト
3. プロジェクトIDが正しく検出されているか確認

### Slack/Discord 通知が来ない
1. Webhook URL が正しく設定されているか確認
2. GitHub Secrets の `SLACK_WEBHOOK_URL` / `DISCORD_WEBHOOK_URL` を確認

---

## 📊 セットアップ完了チェックリスト

- [ ] 自動セットアップスクリプト実行完了
- [ ] Google Drive フォルダ作成・共有設定完了
- [ ] Google Sheets 作成・共有設定完了
- [ ] GitHub Secrets 設定完了
- [ ] GitHub Actions デプロイ成功
- [ ] WordPress プラグイン全サイトにインストール完了
- [ ] プラグイン テスト通知成功
- [ ] Web UI でサイト登録完了
- [ ] 初回 Baseline 撮影完了

---

## 🎉 おめでとうございます！

**20分の設定で、完全自動の WordPress UI 監視システムが完成しました！**

今後は何もしなくても、WordPress の更新時に自動で差分チェックが実行され、問題があれば即座に通知されます。

### 📞 サポート
- GitHub Issues: 機能要望・バグ報告
- 設定ファイル: `setup/generated.env` で詳細確認

**Happy WordPress Management! 🚀**