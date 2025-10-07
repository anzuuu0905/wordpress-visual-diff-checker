const http = require('http');
const fs = require('fs');
const path = require('path');

async function debugUrlFix() {
    console.log('🔍 URL修正の詳細診断を開始します...\n');
    
    // 1. 最新の差分ファイルを確認
    console.log('1. 最新の差分ファイルを確認:');
    try {
        const diffDir = path.join(__dirname, 'diffs', 'site-1-earthcampus', 'desktop', 'threshold-2');
        if (fs.existsSync(diffDir)) {
            const files = fs.readdirSync(diffDir)
                .filter(f => f.endsWith('.png'))
                .map(f => ({
                    name: f,
                    time: fs.statSync(path.join(diffDir, f)).mtime
                }))
                .sort((a, b) => b.time - a.time);
            
            console.log(`   差分ファイル数: ${files.length}`);
            if (files.length > 0) {
                console.log(`   最新ファイル: ${files[0].name}`);
                console.log(`   作成日時: ${files[0].time}`);
            }
        } else {
            console.log('   差分ディレクトリが存在しません');
        }
    } catch (error) {
        console.log(`   エラー: ${error.message}`);
    }
    
    console.log('');
    
    // 2. API応答の詳細確認
    console.log('2. API応答の詳細確認:');
    try {
        const data = await fetchSessionData();
        
        console.log(`   成功: ${data.success}`);
        if (data.images) {
            console.log(`   Baselineファイル数: ${data.images.baseline?.files?.length || 0}`);
            console.log(`   Afterファイル数: ${data.images.after?.files?.length || 0}`);
            console.log(`   比較データ数: ${data.images.comparisons?.length || 0}`);
            
            // 比較データの詳細確認
            const comparisons = data.images.comparisons || [];
            console.log('\n3. 比較データの詳細:');
            
            for (let i = 0; i < Math.min(5, comparisons.length); i++) {
                const comp = comparisons[i];
                console.log(`\n   比較 ${i + 1}:`);
                console.log(`     ページID: ${comp.pageIdentifier}`);
                console.log(`     ステータス: ${comp.status}`);
                console.log(`     差分率: ${comp.diffPercentage}`);
                console.log(`     差分パス: ${comp.diffPath}`);
                console.log(`     既存結果: ${comp.isExistingResult ? 'はい' : 'いいえ'}`);
                console.log(`     URL: ${comp.url ? comp.url : '❌ なし'}`);
                
                if (comp.url) {
                    console.log(`     ✅ URL修正が適用されています！`);
                } else {
                    console.log(`     ❌ URL修正が適用されていません`);
                    
                    // 既存結果の場合は再実行が必要かもしれません
                    if (comp.isExistingResult) {
                        console.log(`     💡 既存差分ファイルを使用中 - 新規実行が必要`);
                    }
                }
            }
            
            // Baselineファイルの URL 確認
            console.log('\n4. Baselineファイルの URL 情報:');
            const baselineFiles = data.images.baseline?.files || [];
            for (let i = 0; i < Math.min(3, baselineFiles.length); i++) {
                const file = baselineFiles[i];
                console.log(`   ファイル ${i + 1}: ${file.filename}`);
                console.log(`     ページID: ${file.pageIdentifier}`);
                console.log(`     URL: ${file.pageUrl || '❌ なし'}`);
            }
        }
        
    } catch (error) {
        console.log(`   エラー: ${error.message}`);
    }
}

function fetchSessionData() {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/session-images/site-1-earthcampus/desktop',
            method: 'GET'
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(error);
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

debugUrlFix().catch(console.error);