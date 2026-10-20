// اختبارات قواعد تخزين الصور على المحاكي — لا تلمس البيانات الحقيقية
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { readFileSync } from 'fs';

const OWNER = 'gDgF5lS4GzdhDbZDZQKGyM2ytnv2';
const env = await initializeTestEnvironment({
  projectId: 'demo-inv-rules',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 }
});
await env.clearFirestore(); await env.clearStorage();
await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  await setDoc(doc(d, 'users', 'staff1'), { role: 'staff' });
  await setDoc(doc(d, 'users', 'newbie'), { role: 'staff', mustChangePassword: true });
  await setDoc(doc(d, 'users', 'pend'), { role: 'pending' });
  await uploadBytes(ref(c.storage(), 'products/p1/full_1.jpg'), new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' });
  await uploadBytes(ref(c.storage(), 'backups/2026-10-12.json'), new Uint8Array([1]), { contentType: 'application/json' });
});
const st = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();
const anon = st(null), staff = st('staff1'), newbie = st('newbie'), pend = st('pend'), owner = st(OWNER);
const img = new Uint8Array(1000), big = new Uint8Array(4 * 1024 * 1024), jpg = { contentType: 'image/jpeg' };

let pass = 0, fail = 0;
async function t(name, p, ok) {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); pass++; }
  catch (e) { fail++; console.log('❌ ' + name + ' — ' + (ok ? 'كان يجب أن ينجح' : 'كان يجب أن يُرفض') + ': ' + String(e.message || e).slice(0, 120)); }
}
const Y = true, N = false;

await t('زائر يشاهد صورة قطعة', getBytes(ref(anon, 'products/p1/full_1.jpg')), Y);
await t('زائر يرفع صورة', uploadBytes(ref(anon, 'products/p1/full_2.jpg'), img, jpg), N);
await t('بانتظار الموافقة يرفع صورة', uploadBytes(ref(pend, 'products/p1/full_2.jpg'), img, jpg), N);
await t('موظف بكلمة مؤقتة يرفع صورة', uploadBytes(ref(newbie, 'products/p1/full_2.jpg'), img, jpg), N);
await t('موظف يرفع صورة', uploadBytes(ref(staff, 'products/p1/full_2.jpg'), img, jpg), Y);
await t('موظف يرفع مصغّرة', uploadBytes(ref(staff, 'products/p1/thumb_2.jpg'), img, jpg), Y);
await t('موظف يرفع ملفاً ليس صورة', uploadBytes(ref(staff, 'products/p1/full_3.jpg'), img, { contentType: 'text/html' }), N);
await t('موظف يرفع باسم غير مسموح', uploadBytes(ref(staff, 'products/p1/hack.html'), img, jpg), N);
await t('موظف يرفع صورة أكبر من 3MB', uploadBytes(ref(staff, 'products/p1/full_4.jpg'), big, jpg), N);
await t('موظف يكتب خارج مجلد القطع', uploadBytes(ref(staff, 'other/x_1.jpg'), img, jpg), N);
await t('المالك يرفع صورة', uploadBytes(ref(owner, 'products/p2/full_1.jpg'), img, jpg), Y);
await t('موظف يحذف صورة', deleteObject(ref(staff, 'products/p1/thumb_2.jpg')), Y);
await t('زائر يحذف صورة', deleteObject(ref(anon, 'products/p1/full_1.jpg')), N);
await t('زائر يقرأ النسخ الاحتياطية', getBytes(ref(anon, 'backups/2026-10-12.json')), N);
await t('المالك يقرأ النسخ الاحتياطية من المتصفح', getBytes(ref(owner, 'backups/2026-10-12.json')), N);

console.log('\n🖼 التخزين — ✅ نجح: ' + pass + '   ❌ فشل: ' + fail);
await env.cleanup();
process.exit(fail ? 1 : 0);
