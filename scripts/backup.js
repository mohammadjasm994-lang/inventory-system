// نسخة احتياطية كاملة من قاعدة البيانات (بديل الدالة السحابية — لا يحتاج خطة Blaze)
// يعمل يومياً من GitHub Actions (.github/workflows/backup.yml) أو يدوياً:
//   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/backup.js
// الملف بنفس صيغة "تحميل نسخة كاملة" في لوحة الإدارة — يُسترجع من صفحة النسخ الاحتياطي
const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp({ credential: applicationDefault(), projectId: 'mohammad-jasm' });
const db = getFirestore();

const NAMES = ['products', 'warehouses', 'invoices', 'quotes', 'customers', 'suppliers', 'purchases', 'porders', 'payments', 'expenses', 'closings',
  'stockMoves', 'stats', 'stocktakes', 'settings', 'publicSettings', 'users', 'counters', 'tombstones', 'bulkOps', 'images', 'store'];

function plain(v) {
  if (v && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = plain(v[k]); return o; }
  return v;
}

(async () => {
  const out = { version: 3, app: 'inventory', exportedAt: new Date().toISOString(), exportedBy: 'github-backup' };
  for (const n of NAMES) {
    const qs = await db.collection(n).get();
    out[n] = qs.docs.map(d => Object.assign({ id: d.id }, plain(d.data())));
    if (n === 'settings') out[n].forEach(d => { delete d.geminiKey; }); // المفاتيح السرية لا تدخل ملف النسخة
    console.log(n + ': ' + qs.size);
  }
  if (!out.products.length) throw new Error('لا توجد منتجات — النسخة غير طبيعية، أُلغيت');
  const dir = path.join(__dirname, '..', 'backup-out');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'inventory-backup-' + new Date().toISOString().slice(0, 10) + '.json');
  fs.writeFileSync(file, JSON.stringify(out));
  await db.collection('settings').doc('meta').set({ lastAutoBackupAt: FieldValue.serverTimestamp(), lastAutoBackupProducts: out.products.length, lastAutoBackupBy: 'GitHub' }, { merge: true });
  console.log('✔ ' + path.basename(file) + ' (' + (fs.statSync(file).size / 1048576).toFixed(1) + ' MB)');
})().catch(e => { console.error('⛔ ' + e.message); process.exit(1); });
