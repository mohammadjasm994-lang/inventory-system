// اختبارات قواعد الحماية على محاكي Firestore — لا تلمس البيانات الحقيقية
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, addDoc, serverTimestamp, increment, arrayUnion, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';

const OWNER = 'gDgF5lS4GzdhDbZDZQKGyM2ytnv2';
const env = await initializeTestEnvironment({
  projectId: 'demo-inv-rules',
  firestore: { rules: readFileSync(process.argv[2], 'utf8'), host: '127.0.0.1', port: 8080 }
});
await env.clearFirestore();
await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  await setDoc(doc(d, 'users', OWNER), { role: 'admin', email: 'owner@test.local' });
  await setDoc(doc(d, 'users', 'admin2'), { role: 'admin', email: 'admin2@test.local' });
  await setDoc(doc(d, 'users', 'staff1'), { role: 'staff', email: 'staff1@test.local' });
  await setDoc(doc(d, 'users', 'newbie'), { role: 'staff', email: 'newbie@test.local', mustChangePassword: true });
  await setDoc(doc(d, 'users', 'pend'), { role: 'pending', email: 'pend@test.local' });
  await setDoc(doc(d, 'products', 'p1'), { name: 'بولبرين', qty: 5, price: 1000, cost: 700, deleted: false });
  await setDoc(doc(d, 'invoices', 'i1'), { num: 'INV-1', total: 1000, items: [], cancelled: false });
  await setDoc(doc(d, 'catalogPacks', 'meta'), { n: 1 });
  await setDoc(doc(d, 'customers', 'c1'), { name: 'زبون', balance: 0 });
  await setDoc(doc(d, 'stockMoves', 'm1'), { pid: 'p1', delta: 1, by: 'staff1@test.local' });
  await setDoc(doc(d, 'store', 'shared_store'), { products: [] });
  await setDoc(doc(d, 'counters', 'invoices'), { next: 10 });
  await setDoc(doc(d, 'logs', 'old'), { at: Timestamp.fromMillis(Date.now() - 400 * 864e5), uid: 'x', action: 'sale' });
  await setDoc(doc(d, 'logs', 'new'), { at: Timestamp.fromMillis(Date.now() - 10 * 864e5), uid: 'x', action: 'sale' });
  await setDoc(doc(d, 'errors', 'e1'), { uid: 'staff1', msg: 'x' });
});
const as = (uid, email) => uid ? env.authenticatedContext(uid, { email }).firestore() : env.unauthenticatedContext().firestore();
const anon = as(null), pend = as('pend', 'pend@test.local'), staff = as('staff1', 'staff1@test.local'), newbie = as('newbie', 'newbie@test.local'),
  admin = as('admin2', 'admin2@test.local'), owner = as(OWNER, 'owner@test.local'), stranger = as('stranger', 'x@test.local');

let pass = 0, fail = 0;
async function t(name, p, ok) {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); pass++; }
  catch (e) { fail++; console.log('❌ ' + name + ' — ' + (ok ? 'كان يجب أن ينجح' : 'كان يجب أن يُرفض') + ': ' + (e.message || e).slice(0, 120)); }
}
const Y = true, N = false;

// 🌍 الزائر
await t('زائر يقرأ الكتالوج', getDoc(doc(anon, 'catalogPacks', 'meta')), Y);
await t('زائر يقرأ المنتجات (سعر الشراء)', getDoc(doc(anon, 'products', 'p1')), N);
await t('زائر يكتب في الكتالوج', setDoc(doc(anon, 'catalogPacks', 'p0'), { items: [] }), N);
await t('زائر يرسل طلب', addDoc(collection(anon, 'orders'), { name: 'x' }), N);
await t('زائر يقرأ الأرشيف القديم', getDoc(doc(anon, 'store', 'shared_store')), N);
// 👤 حساب جديد غريب
await t('غريب ينشئ وثيقته كمدير', setDoc(doc(stranger, 'users', 'stranger'), { role: 'admin' }), N);
await t('غريب ينشئ وثيقته بانتظار الموافقة', setDoc(doc(stranger, 'users', 'stranger'), { role: 'pending', email: 'x@test.local' }), Y);
// ⏳ بانتظار الموافقة
await t('بانتظار الموافقة يقرأ المنتجات', getDoc(doc(pend, 'products', 'p1')), N);
await t('بانتظار الموافقة يرفع صلاحيته', updateDoc(doc(pend, 'users', 'pend'), { role: 'admin' }), N);
await t('بانتظار الموافقة يغير اسمه', updateDoc(doc(pend, 'users', 'pend'), { name: 'جديد' }), Y);
// 🔑 موظف لم يغير كلمة المرور المؤقتة
await t('موظف بكلمة مؤقتة يقرأ المنتجات', getDoc(doc(newbie, 'products', 'p1')), N);
await t('موظف بكلمة مؤقتة يُلغي علامة التغيير', updateDoc(doc(newbie, 'users', 'newbie'), { mustChangePassword: false }), Y);
// 👷 موظف
await t('موظف يقرأ المنتجات', getDoc(doc(staff, 'products', 'p1')), Y);
await t('موظف يعدّل كمية', updateDoc(doc(staff, 'products', 'p1'), { qty: increment(-1) }), Y);
await t('موظف ينقل منتج للمحذوفات', updateDoc(doc(staff, 'products', 'p1'), { deleted: true }), N);
await t('موظف يحذف منتج نهائياً', deleteDoc(doc(staff, 'products', 'p1')), N);
await t('موظف ينشئ فاتورة', setDoc(doc(staff, 'invoices', 'i2'), { num: 'INV-2', total: 5 }), Y);
await t('موظف يسجل مرتجع', updateDoc(doc(staff, 'invoices', 'i1'), { returns: arrayUnion({ amount: 1 }), returnedTotal: increment(1) }), Y);
await t('موظف يلغي فاتورة', updateDoc(doc(staff, 'invoices', 'i1'), { cancelled: true }), N);
await t('موظف يحذف فاتورة', deleteDoc(doc(staff, 'invoices', 'i1')), N);
await t('موظف يقرأ المشتريات', getDocs(collection(staff, 'purchases')), N);
await t('موظف ينشئ مورد', addDoc(collection(staff, 'suppliers'), { name: 'x' }), N);
await t('موظف يسجل دفعة زبون', addDoc(collection(staff, 'payments'), { kind: 'customer', type: 'payment', amount: 5, by: 'staff1@test.local' }), Y);
await t('موظف يسجل دفعة باسم غيره', addDoc(collection(staff, 'payments'), { kind: 'customer', type: 'payment', amount: 5, by: 'owner@test.local' }), N);
await t('موظف يسجل تسوية رصيد', addDoc(collection(staff, 'payments'), { kind: 'customer', type: 'adjust', amount: -500, by: 'staff1@test.local' }), N);
await t('موظف يعدل دفعة مسجلة', updateDoc(doc(staff, 'payments', 'x'), { amount: 1 }), N);
await t('موظف يحذف زبون', deleteDoc(doc(staff, 'customers', 'c1')), N);
await t('موظف يعدل حركة مخزون', updateDoc(doc(staff, 'stockMoves', 'm1'), { delta: 99 }), N);
await t('موظف يحذف حركة مخزون', deleteDoc(doc(staff, 'stockMoves', 'm1')), N);
await t('موظف يقرأ حسابات الآخرين', getDoc(doc(staff, 'users', 'admin2')), N);
await t('موظف يرفع صلاحية نفسه', updateDoc(doc(staff, 'users', 'staff1'), { role: 'admin' }), N);
await t('موظف يغير الإعدادات', setDoc(doc(staff, 'settings', 'main'), { company: 'x' }), N);
await t('موظف يقرأ السجل', getDocs(collection(staff, 'logs')), N);
await t('موظف يكتب سجل باسمه', addDoc(collection(staff, 'logs'), { uid: 'staff1', action: 'x' }), Y);
await t('موظف يكتب سجل باسم غيره', addDoc(collection(staff, 'logs'), { uid: OWNER, action: 'x' }), N);
await t('موظف ينفذ تعديل جماعي', addDoc(collection(staff, 'bulkOps'), { desc: 'x' }), N);
await t('موظف يقرأ الأرشيف القديم', getDoc(doc(staff, 'store', 'shared_store')), N);
await t('موظف يقرأ المصاريف', getDocs(collection(staff, 'expenses')), N);
await t('موظف يقرأ أوامر الشراء', getDocs(collection(staff, 'porders')), N);
await t('موظف يسجل إغلاق صندوق', setDoc(doc(staff, 'closings', '2026-10-12'), { expected: 1, counted: 1 }), Y);
await t('موظف يعدل إغلاق صندوق مسجل', updateDoc(doc(staff, 'closings', '2026-10-12'), { counted: 999 }), N);
await t('موظف ينشئ عرض سعر', addDoc(collection(staff, 'quotes'), { num: 'QT-1' }), Y);
await t('موظف يحذف عرض سعر', deleteDoc(doc(staff, 'quotes', 'x')), N);
// 🛡 مدير (ليس المالك)
await t('مدير يسجل مصروف', addDoc(collection(admin, 'expenses'), { amount: 5 }), Y);
await t('مدير يعدل إغلاق صندوق', updateDoc(doc(admin, 'closings', '2026-10-12'), { note: 'x' }), Y);
await t('مدير يغير صلاحية موظف', updateDoc(doc(admin, 'users', 'staff1'), { role: 'admin' }), N);
await t('مدير يغير حساب المالك', updateDoc(doc(admin, 'users', OWNER), { role: 'staff' }), N);
await t('مدير يحذف حساب المالك', deleteDoc(doc(admin, 'users', OWNER)), N);
await t('مدير يقرأ قائمة الحسابات', getDocs(collection(admin, 'users')), N);
await t('مدير ينشئ فاتورة شراء', addDoc(collection(admin, 'purchases'), { num: 'PUR-1' }), Y);
await t('مدير يغير الإعدادات', setDoc(doc(admin, 'settings', 'main'), { company: 'x' }), Y);
await t('مدير ينقل منتج للمحذوفات', updateDoc(doc(admin, 'products', 'p1'), { deleted: true }), Y);
await t('مدير يحذف منتج نهائياً', deleteDoc(doc(admin, 'products', 'p1')), N);
await t('مدير يسجل تسوية رصيد', addDoc(collection(admin, 'payments'), { kind: 'customer', type: 'adjust', amount: -5, by: 'admin2@test.local' }), Y);
await t('مدير يقرأ الأرشيف القديم', getDoc(doc(admin, 'store', 'shared_store')), Y);
await t('مدير يكتب في الأرشيف القديم', setDoc(doc(admin, 'store', 'shared_store'), { products: [] }), N);
// 🆕 قواعد المرحلة 4
await t('موظف يغير سعر الشراء', updateDoc(doc(staff, 'products', 'p1'), { cost: 1 }), N);
await t('موظف يغير سعر الشراء بالدولار', updateDoc(doc(staff, 'products', 'p1'), { costUsd: 3 }), N);
await t('موظف يغير سعر البيع', updateDoc(doc(staff, 'products', 'p1'), { price: 1200 }), Y);
await t('موظف ينشئ منتج بسعر شراء', setDoc(doc(staff, 'products', 'p9'), { name: 'x', cost: 500 }), N);
await t('موظف ينشئ منتج بدون سعر شراء', setDoc(doc(staff, 'products', 'p8'), { name: 'x', cost: 0, qty: 0 }), Y);
await t('مدير يغير سعر الشراء', updateDoc(doc(admin, 'products', 'p1'), { cost: 650 }), Y);
await t('موظف يزيد العداد بواحد', updateDoc(doc(staff, 'counters', 'invoices'), { next: 11 }), Y);
await t('موظف يقفز بالعداد', updateDoc(doc(staff, 'counters', 'invoices'), { next: 50 }), N);
await t('موظف يرجع العداد', updateDoc(doc(staff, 'counters', 'invoices'), { next: 5 }), N);
await t('موظف ينشئ عداد جديد من 1', setDoc(doc(staff, 'counters', 'quotes'), { next: 1 }), Y);
await t('موظف ينشئ عداد من 100', setDoc(doc(staff, 'counters', 'purchases'), { next: 100 }), N);
await t('زائر يقرأ العداد', getDoc(doc(anon, 'counters', 'invoices')), N);
await t('موظف يسجل خطأ باسمه', addDoc(collection(staff, 'errors'), { uid: 'staff1', msg: 'boom' }), Y);
await t('موظف يسجل خطأ باسم غيره', addDoc(collection(staff, 'errors'), { uid: 'admin2', msg: 'boom' }), N);
await t('زائر يسجل خطأ', addDoc(collection(anon, 'errors'), { uid: '', msg: 'x' }), N);
await t('موظف يقرأ الأخطاء', getDoc(doc(staff, 'errors', 'e1')), N);
await t('مدير يقرأ الأخطاء', getDoc(doc(admin, 'errors', 'e1')), Y);
await t('موظف يقرأ tombstones', getDocs(collection(staff, 'tombstones')), Y);
await t('مدير يكتب tombstone', setDoc(doc(admin, 'tombstones', 'p1'), { at: serverTimestamp() }), N);
await t('المالك يكتب tombstone', setDoc(doc(owner, 'tombstones', 'gone'), { at: serverTimestamp() }), Y);
await t('مدير يحذف سجل قديم', deleteDoc(doc(admin, 'logs', 'old')), N);
await t('المالك يحذف سجل حديث', deleteDoc(doc(owner, 'logs', 'new')), N);
await t('المالك يحذف سجل أقدم من سنة', deleteDoc(doc(owner, 'logs', 'old')), Y);
// 👑 المالك
await t('المالك يغير صلاحية موظف', updateDoc(doc(owner, 'users', 'staff1'), { role: 'admin' }), Y);
await t('المالك يقرأ كل الحسابات', getDocs(collection(owner, 'users')), Y);
await t('المالك يغير صلاحية نفسه', updateDoc(doc(owner, 'users', OWNER), { role: 'staff' }), N);
await t('المالك يحذف حسابه', deleteDoc(doc(owner, 'users', OWNER)), N);
await t('المالك يغير اسمه', updateDoc(doc(owner, 'users', OWNER), { name: 'محمد' }), Y);
await t('المالك يحذف حساب موظف', deleteDoc(doc(owner, 'users', 'pend')), Y);
await t('المالك يحذف منتج نهائياً', deleteDoc(doc(owner, 'products', 'p1')), Y);

console.log('\n✅ نجح: ' + pass + '   ❌ فشل: ' + fail);
await env.cleanup();
process.exit(fail ? 1 : 0);
