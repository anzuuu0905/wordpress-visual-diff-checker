# ⚡ WordPress VRT - 1分セットアップ

## 🎯 **たった1つのコマンドで完全自動化開始！**

### 💻 **macOS / Linux**
```bash
curl -sL https://raw.githubusercontent.com/anzuuu0905/wordpress-visual-diff-checker/main/setup/one-minute-setup.sh | bash
```

### 🪟 **Windows (PowerShell)**
```powershell
iwr https://raw.githubusercontent.com/anzuuu0905/wordpress-visual-diff-checker/main/setup/one-minute-setup.ps1 | iex
```

---

## ⚡ **これだけで自動実行される内容:**

### ✅ **自動インストール**
- Google Cloud CLI
- GitHub CLI
- 必要な全ツール

### ✅ **自動認証**
- Google アカウント自動ログイン
- GitHub アカウント自動ログイン

### ✅ **自動構築**
- GCP プロジェクト作成（自動命名）
- 全API有効化
- サービスアカウント作成・権限設定
- Firestore データベース初期化

### ✅ **自動作成**
- Google Drive フォルダ作成・共有設定
- Google Sheets 作成・権限設定
- GitHub リポジトリフォーク・クローン

### ✅ **自動デプロイ**
- GitHub Secrets 自動設定
- Cloud Run / Cloud Functions 自動デプロイ
- Cloud Scheduler 自動設定

---

## 📱 **セットアップ後にやること（30秒）**

### 1. WordPress プラグインダウンロード
スクリプト完了後に表示される URL からダウンロード

### 2. WordPress にアップロード
各サイトで：プラグイン → 新規追加 → アップロード → 有効化

### 3. 完全自動化開始！
**設定不要！** 有効化した瞬間から自動監視開始

---

## 🤖 **その後の完全自動実行**

### **WordPress 更新時**
```
1. プラグイン更新を自動検知
2. 5分後に自動VRT実行
3. 差分があれば即座通知
```

### **毎日自動実行**
```
午前3時: 全サイトBaseline自動更新
午前2時: 古いデータ自動削除
```

---

## 🎊 **これで本当に1分で完全自動化！**

**コマンド1つ → WordPress プラグインインストール → 完全放置OK！**

### 📞 **サポート**
- 問題が発生した場合: GitHub Issues
- 詳細設定: 従来の手動セットアップも可能

**Happy Automated WordPress Management! 🚀**