// فحص سريع قبل النشر: كل ملفات JavaScript سليمة نحوياً، وكل سكربت في الصفحات موجود فعلاً
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
let bad = 0;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

for (const f of walk(path.join(root, 'src')).concat([path.join(root, 'build.js'), path.join(root, 'functions', 'index.js')]).filter(f => f.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { bad++; console.log('❌ ' + path.relative(root, f) + '\n' + String(e.stderr).split('\n').slice(0, 4).join('\n')); }
}
for (const site of ['admin', 'store']) {
  const html = fs.readFileSync(path.join(root, 'src', site, 'index.html'), 'utf8');
  for (const [, src] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    if (/^https?:/.test(src)) continue;
    const p = src.startsWith('common/') ? path.join(root, 'src', src) : path.join(root, 'src', site, src);
    if (!fs.existsSync(p)) { bad++; console.log('❌ ' + site + '/index.html يطلب ملفاً غير موجود: ' + src); }
  }
}
console.log(bad ? '\n⛔ ' + bad + ' مشكلة' : '✔ كل الملفات سليمة');
process.exit(bad ? 1 : 0);
