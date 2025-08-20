# WordPress Visual Diff Checker

## 概要

WordPress Visual Diff Checker は、WordPressサイトのプラグインやテーマ更新による視覚的変化を自動検出するVRT（Visual Regression Testing）システムです。

## 主要機能

- 🎯 複数WordPressサイトの一括管理（26サイト以上対応）
- 🔍 高精度な画像差分検出（Pixelmatch使用）
- 📸 3ステップワークフロー（Baseline撮影→更新→比較）
- ⚡ 並列処理による高速実行
- 🎨 WordPress特化の最適化

## 技術スタック

- **フロントエンド**: HTML5/CSS3, Vanilla JavaScript
- **バックエンド**: Node.js 20.x, Express.js, Playwright
- **画像処理**: Sharp, Pixelmatch
- **インフラ**: ローカル実行 / GCP（将来対応）

## セットアップ

### 必要要件

- Node.js 20.x
- npm または yarn
- 8GB以上のRAM（推奨）

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/[your-username]/wordpress-visual-diff-checker.git
cd wordpress-visual-diff-checker

# 依存関係をインストール
npm install

# Playwrightブラウザをインストール
npx playwright install
```

### 設定

1. `config.json.example` を `config.json` にコピー
2. 監視対象のWordPressサイト情報を設定

### 実行

```bash
# 開発モード
npm run dev

# 本番モード
npm start

# テスト実行
npm test
```

## 使用方法

1. ブラウザで `http://localhost:3000` にアクセス
2. **Step 1**: ベースライン撮影を実行
3. WordPressサイトでプラグイン/テーマを更新
4. **Step 2+3**: 更新後チェックを実行
5. 差分結果を確認

## ドキュメント

- [開発ガイド](./docs/DEVELOPMENT.md)
- [API仕様](./docs/API.md)
- [運用マニュアル](./docs/OPERATION.md)
- [トラブルシューティング](./docs/TROUBLESHOOTING.md)

## プロジェクト構造

```
.
├── wordpress-visual-diff-checker/
│   ├── local-playwright-vrt/    # ローカル版VRTシステム
│   ├── cloud-run/               # Cloud Run版（開発中）
│   ├── cloud-functions/         # Cloud Functions（開発中）
│   ├── gas/                     # Google Apps Script UI（開発中）
│   └── terraform/               # インフラ構成（開発中）
├── SPECIFICATION.md             # 詳細仕様書
├── SPECIFICATION_CORRECTED.md   # 実装版仕様書
├── CLAUDE.md                    # プロジェクト管理・ToDoリスト
└── README.md                    # このファイル
```

## 開発状況

詳細な開発タスクと進捗は [CLAUDE.md](./CLAUDE.md) を参照してください。

## コントリビューション

1. Issueを作成して機能提案やバグ報告
2. フォークして機能ブランチを作成
3. 変更をコミット（単体テスト必須）
4. Pull Requestを送信

## ライセンス

MIT License

## サポート

問題が発生した場合は、[Issues](https://github.com/[your-username]/wordpress-visual-diff-checker/issues) で報告してください。

## 作者

[Your Name]

---

詳細な仕様書とタスク管理については [CLAUDE.md](./CLAUDE.md) を参照してください。