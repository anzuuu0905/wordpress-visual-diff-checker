/**
 * Google Sheetsを自動作成してWordPress VRTをセットアップ
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Google Apps Scriptのコードを読み込み
const gasCode = fs.readFileSync(path.join(__dirname, 'gas/src/SimpleVRT.gs'), 'utf8');

async function createWordPressVRTSheet() {
  try {
    console.log('🚀 WordPress VRT Google Sheets作成開始...');

    // 認証設定（ユーザーのデフォルト認証を使用）
    const auth = new google.auth.GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/script.projects',
        'https://www.googleapis.com/auth/drive'
      ]
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const script = google.script({ version: 'v1', auth });
    const drive = google.drive({ version: 'v3', auth });

    console.log('✅ Google API認証完了');

    // 1. Google Sheetsを作成
    console.log('📊 Google Sheetsを作成中...');
    const spreadsheetResponse = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: 'WordPress VRT Tool - ' + new Date().toLocaleDateString('ja-JP')
        },
        sheets: [
          {
            properties: {
              title: 'サイト管理',
              gridProperties: {
                rowCount: 100,
                columnCount: 10
              }
            }
          }
        ]
      }
    });

    const spreadsheetId = spreadsheetResponse.data.spreadsheetId;
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    
    console.log(`✅ Google Sheets作成完了: ${spreadsheetId}`);

    // 2. Apps Scriptプロジェクトを作成
    console.log('⚙️ Apps Scriptプロジェクトを作成中...');
    const scriptProject = await script.projects.create({
      requestBody: {
        title: 'WordPress VRT Script',
        parentId: spreadsheetId
      }
    });

    const scriptId = scriptProject.data.scriptId;
    console.log(`✅ Apps Script作成完了: ${scriptId}`);

    // 3. Apps ScriptにVRTコードを追加
    console.log('📝 VRTコードをApps Scriptに追加中...');
    await script.projects.updateContent({
      scriptId: scriptId,
      requestBody: {
        files: [
          {
            name: 'Code',
            type: 'SERVER_JS',
            source: gasCode
          }
        ]
      }
    });

    console.log('✅ VRTコード追加完了');

    // 4. 初期データをシートに追加
    console.log('📋 初期データを設定中...');
    
    // サイト管理シートのヘッダー
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'サイト管理!A1:E1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['サイト名', 'URL', '最終チェック', 'ステータス', '備考']]
      }
    });

    // サンプルデータ
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'サイト管理!A2:E2',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['サンプルサイト', 'https://example.com', '', '', 'テスト用サイト（削除可能）']]
      }
    });

    // ヘッダーの書式設定
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 5
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                  textFormat: { bold: true }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          }
        ]
      }
    });

    // 5. VRT結果シートを追加
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: 'VRT結果',
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 10
                }
              }
            }
          }
        ]
      }
    });

    // VRT結果シートのヘッダー
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'VRT結果!A1:H1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['実行日時', 'サイト名', 'URL', 'モード', 'チェックページ数', '差分ページ数', 'ステータス', '詳細']]
      }
    });

    // 6. 設定シートを追加
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: '設定',
                gridProperties: {
                  rowCount: 50,
                  columnCount: 5
                }
              }
            }
          }
        ]
      }
    });

    // 設定データ
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: '設定!A1:C6',
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['設定項目', '値', '説明'],
          ['差分閾値（%）', '2', '差分と判定する閾値'],
          ['最大URL数', '50', 'クロールする最大URL数'],
          ['画面幅', '1200', 'スクリーンショットの幅'],
          ['画面高さ', '800', 'スクリーンショットの高さ'],
          ['Slack Webhook', '', 'Slack通知用のWebhook URL（任意）']
        ]
      }
    });

    // 7. 権限設定（編集可能にする）
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        role: 'writer',
        type: 'user',
        emailAddress: 'kazuhiro.ando.co@gmail.com'
      }
    });

    console.log('✅ 初期データ設定完了');

    // 8. セットアップ情報を保存
    const setupInfo = {
      spreadsheetId,
      spreadsheetUrl,
      scriptId,
      createdAt: new Date().toISOString(),
      status: 'ready'
    };

    fs.writeFileSync('vrt-setup-info.json', JSON.stringify(setupInfo, null, 2));

    console.log('\n🎉 WordPress VRT セットアップ完了！');
    console.log('================================');
    console.log(`📊 Google Sheets: ${spreadsheetUrl}`);
    console.log(`⚙️ Apps Script: https://script.google.com/d/${scriptId}/edit`);
    console.log('\n📋 次のステップ:');
    console.log('1. Google Sheetsを開く');
    console.log('2. 「サイト管理」シートでサンプルデータを確認');
    console.log('3. Apps Scriptで setupVRT() を1回実行');
    console.log('4. 実際のサイトURLを追加してテスト');
    console.log('\n✨ すぐに使い始められます！');

    return setupInfo;

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    
    if (error.message.includes('insufficient authentication scopes')) {
      console.log('\n🔧 解決方法:');
      console.log('1. gcloud auth application-default login を実行');
      console.log('2. ブラウザで認証完了後、再実行してください');
    }
    
    throw error;
  }
}

// 実行
if (require.main === module) {
  createWordPressVRTSheet()
    .then((info) => {
      console.log('\n🎯 作成完了:', info.spreadsheetUrl);
    })
    .catch((error) => {
      console.error('実行エラー:', error.message);
      process.exit(1);
    });
}

module.exports = { createWordPressVRTSheet };