// ═══════════════════════════════════════════════════════════
// Cloud Functions (تحتاج خطة Blaze)
// • dailyBackup: نسخة احتياطية يومية تلقائية في Storage (آخر 30 يوم)
// • createStaff / deleteStaff: إضافة وحذف الموظفين من السيرفر — للمالك فقط
//   (بعدها يمكن إيقاف "التسجيل العام" من Firebase Console حتى لا يستطيع أحد إنشاء حساب بنفسه)
// ═══════════════════════════════════════════════════════════
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'europe-west1', maxInstances: 2 });

const OWNER_UIDS = ['gDgF5lS4GzdhDbZDZQKGyM2ytnv2'];
const ROLES = ['admin', 'staff'];
// عند تفعيل App Check وإجباره من الكونسول، اجعلها true حتى ترفض الدوال الطلبات من خارج الموقع
const ENFORCE_APP_CHECK = false;

// نفس صيغة "تحميل نسخة كاملة" في لوحة الإدارة — يمكن استرجاعها من صفحة النسخ الاحتياطي
function plain(v) {
  if (v && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = plain(v[k]); return o; }
  return v;
}

exports.dailyBackup = onSchedule({ schedule: 'every day 03:00', timeZone: 'Asia/Baghdad', timeoutSeconds: 540, memory: '1GiB' }, async () => {
  const names = ['products', 'warehouses', 'invoices', 'quotes', 'customers', 'suppliers', 'purchases', 'porders', 'payments', 'expenses', 'closings',
    'stockMoves', 'stats', 'stocktakes', 'settings', 'publicSettings', 'users', 'counters', 'tombstones', 'bulkOps', 'images', 'store'];
  const out = { version: 3, app: 'inventory', exportedAt: new Date().toISOString(), exportedBy: 'dailyBackup' };
  for (const n of names) {
    const qs = await db.collection(n).get();
    out[n] = qs.docs.map(d => Object.assign({ id: d.id }, plain(d.data())));
  }
  const bucket = getStorage().bucket();
  const day = new Date().toISOString().slice(0, 10);
  await bucket.file('backups/' + day + '.json').save(JSON.stringify(out), { contentType: 'application/json', resumable: false });
  const [files] = await bucket.getFiles({ prefix: 'backups/' });
  const cutoff = Date.now() - 30 * 864e5;
  await Promise.all(files.filter(f => { const m = f.name.match(/backups\/(\d{4}-\d{2}-\d{2})\.json$/); return m && Date.parse(m[1]) < cutoff; }).map(f => f.delete().catch(() => {})));
  await db.collection('settings').doc('meta').set({ lastAutoBackupAt: FieldValue.serverTimestamp(), lastAutoBackupProducts: out.products.length }, { merge: true });
});

function mustBeOwner(req) {
  if (!req.auth || !OWNER_UIDS.includes(req.auth.uid)) throw new HttpsError('permission-denied', 'للمالك فقط');
}
function log(req, action, id, name, changes) {
  return db.collection('logs').add({ at: FieldValue.serverTimestamp(), uid: req.auth.uid, email: req.auth.token.email || '', action, entity: 'user', entityId: id, name, changes: changes || null, via: 'function' });
}

exports.createStaff = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async req => {
  mustBeOwner(req);
  const email = String((req.data || {}).email || '').trim().toLowerCase();
  const name = String((req.data || {}).name || '').trim().slice(0, 80);
  const role = String((req.data || {}).role || '');
  const password = String((req.data || {}).password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError('invalid-argument', 'البريد غير صحيح');
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'الصلاحية غير صحيحة');
  if (password.length < 8) throw new HttpsError('invalid-argument', 'كلمة المرور المؤقتة 8 أحرف على الأقل');
  let user;
  try { user = await getAuth().createUser({ email, password, displayName: name || undefined }); }
  catch (e) {
    if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'هذا البريد عنده حساب مسبقاً');
    throw new HttpsError('internal', e.message);
  }
  await db.collection('users').doc(user.uid).set({ email, name, role, mustChangePassword: true, addedBy: req.auth.token.email || '', createdAt: FieldValue.serverTimestamp() });
  await log(req, 'create', user.uid, email, { role: [null, role] });
  return { uid: user.uid };
});

// حذف كامل: حساب الدخول + وثيقة الصلاحيات (الفواتير والسجلات باسمه تبقى كما هي)
exports.deleteStaff = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async req => {
  mustBeOwner(req);
  const uid = String((req.data || {}).uid || '');
  if (!uid || OWNER_UIDS.includes(uid)) throw new HttpsError('invalid-argument', 'لا يمكن حذف هذا الحساب');
  const snap = await db.collection('users').doc(uid).get();
  const email = snap.exists ? snap.data().email || '' : '';
  try { await getAuth().deleteUser(uid); } catch (e) { if (e.code !== 'auth/user-not-found') throw new HttpsError('internal', e.message); }
  await db.collection('users').doc(uid).delete();
  await log(req, 'delete', uid, email, null);
  return { ok: true };
});
