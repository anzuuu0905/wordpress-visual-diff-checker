/**
 * 💻 リソース使用状況分析
 */

const os = require('os');

console.log('💻 現在のシステムリソース');
console.log('='.repeat(60));

// CPU情報
const cpus = os.cpus();
console.log(`\nCPU:`);
console.log(`  - モデル: ${cpus[0].model}`);
console.log(`  - コア数: ${cpus.length}`);
console.log(`  - 速度: ${cpus[0].speed} MHz`);

// メモリ情報
const totalMem = os.totalmem() / (1024 * 1024 * 1024);
const freeMem = os.freemem() / (1024 * 1024 * 1024);
const usedMem = totalMem - freeMem;

console.log(`\nメモリ:`);
console.log(`  - 合計: ${totalMem.toFixed(1)} GB`);
console.log(`  - 使用中: ${usedMem.toFixed(1)} GB`);
console.log(`  - 空き: ${freeMem.toFixed(1)} GB`);

// 推奨設定の計算
console.log('\n' + '='.repeat(60));
console.log('⚙️ 推奨設定');
console.log('='.repeat(60));

// 通常の使用パターン
const patterns = {
  '最小リソース（他の作業しながら）': {
    browsers: 1,
    parallel: 2,
    memory: '0.5-1GB',
    cpu: '10-20%'
  },
  'バランス型（適度な速度）': {
    browsers: 2,
    parallel: 5,
    memory: '1-2GB',
    cpu: '30-40%'
  },
  '高速処理（専用実行）': {
    browsers: 4,
    parallel: 10,
    memory: '2-4GB',
    cpu: '60-80%'
  }
};

Object.entries(patterns).forEach(([name, config]) => {
  console.log(`\n【${name}】`);
  console.log(`  - ブラウザ数: ${config.browsers}`);
  console.log(`  - 並列数: ${config.parallel}`);
  console.log(`  - メモリ使用: ${config.memory}`);
  console.log(`  - CPU使用率: ${config.cpu}`);
});

// 実際のリソース使用量
console.log('\n' + '='.repeat(60));
console.log('📊 実測値（1ブラウザあたり）');
console.log('='.repeat(60));

console.log('\nPlaywright (Chromium):');
console.log('  - 起動時: 150-200MB');
console.log('  - ページ読込: +50-100MB/ページ');
console.log('  - スクリーンショット: +20-50MB（一時的）');

console.log('\n並列処理時の目安:');
console.log('  - 2並列: 400-500MB');
console.log('  - 5並列: 800MB-1GB');
console.log('  - 10並列: 1.5-2GB');
console.log('  - 50並列: 5-8GB（非推奨）');

// 最適な設定提案
console.log('\n' + '='.repeat(60));
console.log('💡 あなたの環境での推奨設定');
console.log('='.repeat(60));

if (freeMem < 2) {
  console.log('\n⚠️ メモリが少ないため、最小構成を推奨:');
  console.log('  - ブラウザプール: 1');
  console.log('  - 並列数: 2-3');
  console.log('  - 予想メモリ使用: 500MB以下');
} else if (freeMem < 4) {
  console.log('\n✅ バランス型設定を推奨:');
  console.log('  - ブラウザプール: 2');
  console.log('  - 並列数: 5');
  console.log('  - 予想メモリ使用: 1GB程度');
} else {
  console.log('\n🚀 高速処理が可能:');
  console.log('  - ブラウザプール: 3-4');
  console.log('  - 並列数: 10');
  console.log('  - 予想メモリ使用: 2GB程度');
}

console.log('\n※ 他の作業をしながら使う場合は、並列数を半分にしてください');