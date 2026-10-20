// يجهّز مجلدي النشر: dist/store (موقع الزبائن) و dist/admin (لوحة المشرفين)
// كل موقع يأخذ نسخة من الملفات المشتركة في src/common و src/assets
// + صفحات ثابتة لكل قطعة (/p/<id>) وخريطة الموقع، حتى تظهر القطع في Google ومعاينة واتساب
const fs = require('fs');
const path = require('path');

const root = __dirname;
const build = Date.now().toString(36);
const PROJECT = 'mohammad-jasm';
const SITE = 'https://mohammad-jasm.web.app';

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
for (const site of ['store', 'admin']) {
  const out = path.join(root, 'dist', site);
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync(path.join(root, 'src', site), out, { recursive: true });
  fs.cpSync(path.join(root, 'src', 'common'), path.join(out, 'common'), { recursive: true });
  fs.cpSync(path.join(root, 'src', 'assets'), out, { recursive: true });
  const sw = fs.readFileSync(path.join(root, 'src', 'sw.js'), 'utf8').replace('__BUILD__', site + '-' + build);
  fs.writeFileSync(path.join(out, 'sw.js'), sw);
}
fs.writeFileSync(path.join(root, 'dist', 'admin', 'robots.txt'), 'User-agent: *\nDisallow: /\n');

// ═══ صفحات القطع (من الكتالوج العام — نفس البيانات التي يراها أي زائر) ═══
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function val(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = val(x); return o; }
  return null;
}
async function getDoc(p) {
  const r = await fetch('https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/' + p);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(p + ': HTTP ' + r.status);
  const j = await r.json(); const o = {};
  for (const [k, x] of Object.entries(j.fields || {})) o[k] = val(x);
  return o;
}
function page(it, cfg) {
  const shop = cfg.company || 'مخزن قطع الغيار';
  const price = cfg.showPrices && it.p > 0 ? Number(it.p).toLocaleString('en-US') + ' د.ع' : '';
  const title = it.n + (it.b ? ' — ' + it.b : '') + ' | ' + shop;
  const desc = [it.n, it.b && 'ماركة ' + it.b, it.c && 'قسم ' + it.c, it.s ? 'متوفر' : 'غير متوفر حالياً', price, cfg.address].filter(Boolean).join(' · ');
  const url = SITE + '/p/' + it.i;
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: it.n, sku: it.i, category: it.c || undefined, brand: it.b ? { '@type': 'Brand', name: it.b } : undefined, description: it.d || undefined,
    offers: { '@type': 'Offer', priceCurrency: 'IQD', price: cfg.showPrices && it.p > 0 ? it.p : undefined, availability: 'https://schema.org/' + (it.s ? 'InStock' : 'OutOfStock'), url } };
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(title) + '</title><meta name="description" content="' + esc(desc) + '"><link rel="canonical" href="' + url + '">' +
    '<meta property="og:type" content="product"><meta property="og:title" content="' + esc(it.n) + '"><meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:url" content="' + url + '"><meta property="og:site_name" content="' + esc(shop) + '">' +
    (it.f ? '<meta property="og:image" content="' + esc(it.f) + '">' : '<meta property="og:image" content="' + SITE + '/icon-512.png">') +
    '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>' +
    '<link rel="icon" href="/icon.svg"><style>body{font-family:Cairo,system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.8;color:#1b2430;background:#f6f7f9}a.b{display:inline-block;background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none}</style>' +
    '<script src="/p/go.js" defer></script></head><body data-id="' + esc(it.i) + '">' +
    '<p><a href="/">' + esc(shop) + '</a> › ' + esc(it.c || '') + '</p><h1>' + esc(it.n) + '</h1>' +
    '<p>' + (it.b ? 'الماركة: <b>' + esc(it.b) + '</b><br>' : '') + (it.c ? 'القسم: ' + esc(it.c) + '<br>' : '') + (it.u ? 'الوحدة: ' + esc(it.u) + '<br>' : '') +
    'الحالة: <b>' + (it.s ? 'متوفر' : 'غير متوفر حالياً') + '</b>' + (price ? '<br>السعر: <b>' + esc(price) + '</b>' : '') + '</p>' +
    (it.d ? '<p>' + esc(it.d) + '</p>' : '') + '<p><a class="b" href="/?item=' + encodeURIComponent(it.i) + '">عرض في الكتالوج والاستفسار</a></p></body></html>';
}
async function seo() {
  const out = path.join(root, 'dist', 'store');
  const urls = [SITE + '/'];
  try {
    const meta = await getDoc('catalogPacks/meta');
    if (!meta || !meta.n) throw new Error('الكتالوج غير منشور');
    const cfg = (await getDoc('publicSettings/main')) || {};
    const packs = await Promise.all(Array.from({ length: meta.n }, (_, i) => getDoc('catalogPacks/p' + i)));
    const items = [].concat(...packs.map(p => (p && p.items) || [])).filter(it => it && it.i && /^[\w-]{1,80}$/.test(it.i) && it.n);
    fs.mkdirSync(path.join(out, 'p'), { recursive: true });
    fs.copyFileSync(path.join(root, 'src', 'store', 'go.js'), path.join(out, 'p', 'go.js'));
    for (const it of items) { fs.writeFileSync(path.join(out, 'p', it.i + '.html'), page(it, cfg)); urls.push(SITE + '/p/' + it.i); }
    console.log('✔ SEO: ' + items.length + ' صفحة قطعة');
  } catch (e) { console.warn('⚠ SEO تخطّي صفحات القطع: ' + e.message); }
  const day = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(out, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => '<url><loc>' + esc(u) + '</loc><lastmod>' + day + '</lastmod></url>').join('\n') + '\n</urlset>\n');
  fs.writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: ' + SITE + '/sitemap.xml\n');
}
seo().then(() => console.log('✔ build ' + build + ' → dist/store, dist/admin'));
