const http = require('http');

// Simple test to check if URL is included in comparison data
const testUrlDisplay = async () => {
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/session-images/site-1-earthcampus/desktop',
        method: 'GET'
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    const comparisons = jsonData.images?.comparisons || [];
                    
                    console.log('📊 比較データの確認:');
                    console.log(`総比較数: ${comparisons.length}`);
                    
                    if (comparisons.length > 0) {
                        console.log('\n最初の3つの比較結果:');
                        for (let i = 0; i < Math.min(3, comparisons.length); i++) {
                            const comp = comparisons[i];
                            console.log(`\n${i + 1}. ページ: ${comp.pageIdentifier}`);
                            console.log(`   ステータス: ${comp.status || 'N/A'}`);
                            console.log(`   差分率: ${comp.diffPercentage || 'N/A'}%`);
                            console.log(`   📎 URL: ${comp.url || '❌ URLなし'}`);
                            
                            if (comp.url) {
                                console.log(`   ✅ URL修正が適用されています！`);
                            } else {
                                console.log(`   ❌ URL修正が適用されていません`);
                            }
                        }
                    } else {
                        console.log('❌ 比較データがありません');
                    }
                    
                    resolve(jsonData);
                } catch (error) {
                    console.error('❌ JSON解析エラー:', error);
                    reject(error);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error('❌ リクエストエラー:', error);
            reject(error);
        });
        
        req.end();
    });
};

testUrlDisplay().catch(console.error);