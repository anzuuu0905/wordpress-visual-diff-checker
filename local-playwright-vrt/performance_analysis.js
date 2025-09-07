const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// パフォーマンス分析
async function analyzePerformance() {
    console.log('🔍 VRTシステムのパフォーマンス分析\n');
    console.log('=' .repeat(60));
    
    // 1. 実際の処理時間測定（直近のセッション）
    console.log('\n📊 1. 実際の処理時間測定\n');
    
    const screenshotsDir = path.join(__dirname, 'screenshots', 'site-1-earthcampus');
    
    // Baselineセッション分析
    const baselineDir = path.join(screenshotsDir, 'baseline', 'desktop');
    const baselineFiles = fs.readdirSync(baselineDir)
        .filter(f => f.endsWith('.png'))
        .map(f => ({
            name: f,
            stats: fs.statSync(path.join(baselineDir, f))
        }))
        .sort((a, b) => a.stats.mtime - b.stats.mtime);
    
    // 最新セッションのファイルを抽出
    const latestSession = baselineFiles[baselineFiles.length - 1]?.name.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/)?.[1];
    
    if (latestSession) {
        const sessionFiles = baselineFiles.filter(f => f.name.includes(latestSession));
        
        if (sessionFiles.length > 0) {
            const firstFile = sessionFiles[0];
            const lastFile = sessionFiles[sessionFiles.length - 1];
            
            const startTime = firstFile.stats.mtime;
            const endTime = lastFile.stats.mtime;
            const duration = (endTime - startTime) / 1000; // 秒
            
            console.log(`📸 Baseline撮影 (Step1):`);
            console.log(`   開始: ${startTime.toLocaleTimeString('ja-JP')}`);
            console.log(`   終了: ${endTime.toLocaleTimeString('ja-JP')}`);
            console.log(`   所要時間: ${Math.floor(duration / 60)}分${Math.floor(duration % 60)}秒`);
            console.log(`   撮影枚数: ${sessionFiles.length}枚`);
            console.log(`   1枚あたり: ${(duration / sessionFiles.length).toFixed(1)}秒`);
        }
    }
    
    // After撮影の分析
    const afterDir = path.join(screenshotsDir, 'after', 'desktop');
    if (fs.existsSync(afterDir)) {
        const afterFiles = fs.readdirSync(afterDir)
            .filter(f => f.endsWith('.png'))
            .map(f => ({
                name: f,
                stats: fs.statSync(path.join(afterDir, f))
            }))
            .sort((a, b) => a.stats.mtime - b.stats.mtime);
        
        // 最新セッション
        const latestAfterSession = afterFiles[afterFiles.length - 1]?.name.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/)?.[1];
        
        if (latestAfterSession) {
            const sessionFiles = afterFiles.filter(f => f.name.includes(latestAfterSession));
            
            if (sessionFiles.length > 0) {
                const firstFile = sessionFiles[0];
                const lastFile = sessionFiles[sessionFiles.length - 1];
                
                const startTime = firstFile.stats.mtime;
                const endTime = lastFile.stats.mtime;
                const duration = (endTime - startTime) / 1000;
                
                console.log(`\n📸 After撮影 (Step2):`);
                console.log(`   開始: ${startTime.toLocaleTimeString('ja-JP')}`);
                console.log(`   終了: ${endTime.toLocaleTimeString('ja-JP')}`);
                console.log(`   所要時間: ${Math.floor(duration / 60)}分${Math.floor(duration % 60)}秒`);
                console.log(`   撮影枚数: ${sessionFiles.length}枚`);
                console.log(`   1枚あたり: ${(duration / sessionFiles.length).toFixed(1)}秒`);
            }
        }
    }
    
    // 差分ファイルの分析
    const diffsDir = path.join(__dirname, 'diffs', 'site-1-earthcampus', 'desktop', 'threshold-2');
    if (fs.existsSync(diffsDir)) {
        const diffFiles = fs.readdirSync(diffsDir)
            .filter(f => f.endsWith('.png'))
            .map(f => ({
                name: f,
                stats: fs.statSync(path.join(diffsDir, f)),
                size: fs.statSync(path.join(diffsDir, f)).size
            }))
            .sort((a, b) => b.stats.mtime - a.stats.mtime);
        
        // 最新20ファイル
        const recentDiffs = diffFiles.slice(0, 20);
        
        if (recentDiffs.length > 0) {
            const firstFile = recentDiffs[recentDiffs.length - 1];
            const lastFile = recentDiffs[0];
            
            const startTime = firstFile.stats.mtime;
            const endTime = lastFile.stats.mtime;
            const duration = (endTime - startTime) / 1000;
            
            const totalSize = recentDiffs.reduce((sum, f) => sum + f.size, 0);
            const avgSize = totalSize / recentDiffs.length;
            
            console.log(`\n🔍 比較処理 (Step3):`);
            console.log(`   開始: ${startTime.toLocaleTimeString('ja-JP')}`);
            console.log(`   終了: ${endTime.toLocaleTimeString('ja-JP')}`);
            console.log(`   所要時間: ${Math.floor(duration / 60)}分${Math.floor(duration % 60)}秒`);
            console.log(`   比較枚数: ${recentDiffs.length}枚`);
            console.log(`   1枚あたり: ${(duration / recentDiffs.length).toFixed(1)}秒`);
            console.log(`   平均ファイルサイズ: ${(avgSize / 1024 / 1024).toFixed(1)}MB`);
        }
    }
    
    // 2. ボトルネック分析
    console.log('\n=' .repeat(60));
    console.log('\n🔥 2. ボトルネック分析\n');
    
    // スクリーンショットファイルのサイズ分析
    const allScreenshots = fs.readdirSync(baselineDir)
        .filter(f => f.endsWith('.png'))
        .map(f => {
            const stats = fs.statSync(path.join(baselineDir, f));
            return {
                name: f,
                size: stats.size,
                pageName: f.match(/page-\d+_([^_]+)_/)?.[1] || 'unknown'
            };
        })
        .sort((a, b) => b.size - a.size);
    
    console.log('📦 大きなスクリーンショット（Top 5）:');
    allScreenshots.slice(0, 5).forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.pageName}: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
    });
    
    // 3. 推定処理時間の内訳
    console.log('\n=' .repeat(60));
    console.log('\n⏱️ 3. 推定処理時間の内訳（20ページの場合）\n');
    
    const estimates = {
        'クロール（URL収集）': 30,
        'ページ読み込み': 20 * 3,  // 3秒/ページ
        'スクロール処理': 20 * 2,   // 2秒/ページ（フルページ）
        'スクリーンショット撮影': 20 * 1.5,  // 1.5秒/ページ
        '画像保存・圧縮': 20 * 1,    // 1秒/ページ
        '比較処理（pixelmatch）': 20 * 2,  // 2秒/ページ
        '差分画像生成': 20 * 1,      // 1秒/ページ
        'ファイルI/O': 15,
        'その他（初期化等）': 10
    };
    
    const total = Object.values(estimates).reduce((sum, val) => sum + val, 0);
    
    Object.entries(estimates).forEach(([task, seconds]) => {
        const percentage = (seconds / total * 100).toFixed(1);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        console.log(`   ${task}: ${minutes}分${secs}秒 (${percentage}%)`);
    });
    
    console.log(`   ${'─'.repeat(40)}`);
    console.log(`   合計: ${Math.floor(total / 60)}分${total % 60}秒`);
    
    // 4. 改善提案
    console.log('\n=' .repeat(60));
    console.log('\n💡 4. 改善提案\n');
    
    const improvements = [
        {
            issue: 'フルページスクリーンショットの処理時間',
            impact: '高',
            solution: 'ビューポート撮影オプションの追加、または段階的スクロール最適化'
        },
        {
            issue: '同期的な処理の多用',
            impact: '高',
            solution: '並列処理の拡大（現在12並列→20並列）'
        },
        {
            issue: 'PNG画像の大きなファイルサイズ',
            impact: '中',
            solution: 'WebP形式への移行（30-50%サイズ削減）'
        },
        {
            issue: 'ページ読み込み待機時間',
            impact: '中',
            solution: 'waitUntilオプションを"domcontentloaded"に変更'
        },
        {
            issue: '比較処理の逐次実行',
            impact: '中',
            solution: 'Worker Threadsを使用した並列比較処理'
        },
        {
            issue: 'メモリ使用量',
            impact: '低',
            solution: 'ストリーミング処理の導入'
        }
    ];
    
    improvements.forEach((item, index) => {
        console.log(`${index + 1}. 【${item.impact}】${item.issue}`);
        console.log(`   → ${item.solution}\n`);
    });
    
    // 5. 現在の設定確認
    console.log('=' .repeat(60));
    console.log('\n⚙️ 5. 現在の設定\n');
    
    try {
        const configPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log(`   サイト数: ${config.sites?.length || 0}`);
            console.log(`   最大ページ数: ${config.maxPages || 20}`);
        }
    } catch (error) {
        console.log('   設定ファイル読み込みエラー');
    }
    
    // サーバー設定の確認
    console.log(`   並列処理数: 12（ハードコード）`);
    console.log(`   スクリーンショット形式: PNG`);
    console.log(`   フルページ撮影: 有効`);
    console.log(`   差分閾値: 2%`);
    
    console.log('\n=' .repeat(60));
}

// 実行
analyzePerformance().catch(console.error);