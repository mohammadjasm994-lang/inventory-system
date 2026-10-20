// ═══════════════════════════════════════════════════════════
// الإدارة: المستخدمين (للمالك فقط)، السجل، المحذوفات، النسخ الاحتياطي، الإعدادات
// ═══════════════════════════════════════════════════════════

// ═══ المستخدمين — المالك فقط ═══
page('users', {
  t: 'المستخدمين', ic: '🔐', owner: true, deps: ['users'],
  html: () => `<form class="card mb" id="addUserForm"><div class="card-h"><h3>➕ إضافة موظف أو مدير</h3></div><div class="card-b">
      <p class="muted small mb">ضع له <b>كلمة مرور مؤقتة</b> وأرسلها له. أول ما يدخل، النظام يجبره يختار كلمة مرور خاصة فيه.</p>
      <div class="grid2">
        <div class="field"><label class="f">الاسم</label><input name="name" required maxlength="80"></div>
        <div class="field"><label class="f">البريد الإلكتروني</label><input name="email" type="email" required autocomplete="off"></div>
        <div class="field"><label class="f">كلمة مرور مؤقتة (8 أحرف أو أكثر)</label><input name="tmp" type="text" minlength="8" required autocomplete="off"></div>
        <div class="field"><label class="f">الصلاحية</label><select name="role"><option value="staff">موظف</option><option value="admin">مدير</option></select></div>
      </div><button class="btn primary" type="submit">➕ إضافة</button></div></form>
    <div class="card"><div class="card-h"><h3>👥 الحسابات</h3></div>
      <div class="card-b small muted"><b>👑 المالك:</b> كل شيء + إدارة الحسابات · <b>مدير:</b> كل شيء عدا الحسابات · <b>موظف:</b> البيع والمنتجات والزبائن والجرد (بدون أسعار الشراء والأرباح والحذف والإعدادات) · <b>بانتظار الموافقة:</b> لا يرى شيئاً (استخدمها لإيقاف حساب)</div>
      <div class="table-wrap"><table class="t" id="uTable"></table></div></div>`,
  init(el) {
    el.querySelector('#addUserForm').addEventListener('submit', addUser);
    el.querySelector('#uTable').addEventListener('change', changeRole);
  },
  render() {
    const list = S.users.slice().sort((a, b) => isOwnerUid(b.id) - isOwnerUid(a.id) || (a.role === 'pending' ? -1 : 0) - (b.role === 'pending' ? -1 : 0));
    document.getElementById('uTable').innerHTML = '<thead><tr><th>الحساب</th><th class="hide-sm">آخر دخول</th><th>الصلاحية</th></tr></thead><tbody>' + list.map(u =>
      '<tr><td><b>' + esc(u.name || '') + '</b><div class="small muted">' + esc(u.email || u.id) + '</div>' + (u.mustChangePassword ? '<span class="badge b-yellow">لم يدخل بعد</span>' : '') + '</td>' +
      '<td class="hide-sm small">' + (u.lastLoginAt ? fmtDate(u.lastLoginAt) : '—') + '</td><td>' +
      (isOwnerUid(u.id) ? '<span class="badge b-yellow">👑 المالك' + (u.id === S.user.uid ? ' (أنت)' : '') + '</span>' :
        '<select data-role="' + esc(u.id) + '" class="auto">' + Object.entries(ROLE_NAME).map(([k, v]) => '<option value="' + k + '"' + (u.role === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select> <button class="btn sm ghost" data-action="del-user" data-id="' + esc(u.id) + '" title="حذف الحساب" aria-label="حذف الحساب">🗑</button>') +
      '</td></tr>').join('') + '</tbody>';
  }
});
async function deleteUser(el) {
  const u = S.users.find(x => x.id === el.dataset.id); if (!u || isOwnerUid(u.id)) return;
  if (!await confirmBox('حذف حساب ' + (u.email || u.name) + ' نهائياً؟\n• لن يستطيع الدخول مرة ثانية\n• فواتيره وسجلاته تبقى كما هي', 'حذف الحساب', true)) return;
  try { await cloudFn('deleteStaff')({ uid: u.id }); toast('تم حذف الحساب'); return; }
  catch (err) { if (err.code === 'functions/permission-denied' || err.code === 'functions/invalid-argument') return toast(err.message, 'error'); }
  // بدون الدالة السحابية: نوقف الحساب (لا يرى شيئاً) — الحذف الكامل يحتاج Blaze
  const w = W(); w.update(col('users').doc(u.id), { role: 'pending' }); w.log('role', 'user', u.id, u.email, { role: [u.role, 'pending'] });
  try { await w.commit(); await confirmBox('تم إيقاف الحساب (صار "بانتظار الموافقة" ولا يرى أي شيء).\nالحذف الكامل لحساب الدخول يعمل بعد تفعيل Blaze ونشر الدوال.', 'تمام'); } catch (e) { toast(authErr(e), 'error'); }
}
act({ 'del-user': deleteUser });
async function changeRole(e) {
  const id = e.target.dataset.role; if (!id || isOwnerUid(id)) return;
  const u = S.users.find(x => x.id === id);
  if (!await confirmBox('تغيير صلاحية ' + (u.email || '') + ' إلى "' + ROLE_NAME[e.target.value] + '"؟', 'تغيير')) { e.target.value = u.role; return; }
  const w = W(); w.update(col('users').doc(id), { role: e.target.value }); w.log('role', 'user', id, u.email, { role: [u.role, e.target.value] });
  try { await w.commit(); toast('تم تغيير الصلاحية'); } catch (err) { toast(authErr(err), 'error'); e.target.value = u.role; }
}
async function addUser(e) {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('button[type=submit]');
  const email = f.elements.email.value.trim().toLowerCase(), name = f.elements.name.value.trim(), role = f.elements.role.value, tmp = f.elements.tmp.value;
  const ex = S.users.find(u => (u.email || '').toLowerCase() === email);
  if (ex && isOwnerUid(ex.id)) return toast('هذا حساب المالك', 'error');
  btn.disabled = true; btn.textContent = 'جاري الإضافة...';
  const done = () => confirmBox('تمت إضافة ' + name + ' كـ' + ROLE_NAME[role] + ' ✅\n\nأرسل له (واتساب مثلاً):\n• الرابط: ' + location.origin + '\n• الإيميل: ' + email + '\n• كلمة المرور المؤقتة اللي كتبتها\n\nأول ما يدخل يُطلب منه يختار كلمة مرور خاصة فيه.', 'تمام');
  // 1) عبر الدالة السحابية (بعد Blaze) — تسمح بإيقاف التسجيل العام من الكونسول
  if (!window.USE_EMULATORS && firebase.functions) {
    try {
      await cloudFn('createStaff')({ email, name, role, password: tmp });
      await done(); f.reset(); btn.disabled = false; btn.textContent = '➕ إضافة'; return;
    } catch (err) {
      if (['functions/already-exists', 'functions/invalid-argument', 'functions/permission-denied'].includes(err.code)) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = '➕ إضافة'; return; }
      // الدالة غير منشورة بعد ← الطريقة المباشرة
    }
  }
  // 2) تطبيق Firebase ثانٍ حتى لا يخرج المالك من حسابه عند إنشاء الحساب الجديد
  const sec = firebase.apps.find(a => a.name === 'adder') || firebase.initializeApp(firebaseConfig, 'adder');
  if (window.USE_EMULATORS && !sec._emu) { sec.auth().useEmulator('http://127.0.0.1:9099'); sec.firestore().useEmulator('127.0.0.1', 8080); sec._emu = true; }
  try {
    const cred = await sec.auth().createUserWithEmailAndPassword(email, tmp);
    await sec.firestore().collection('users').doc(cred.user.uid).set({ email, name, role: 'pending', mustChangePassword: true, createdAt: FV.serverTimestamp() });
    await sec.auth().signOut();
    const w = W();
    w.update(col('users').doc(cred.user.uid), { role, name, addedBy: S.user.email });
    if (ex && ex.id !== cred.user.uid) w.delete(col('users').doc(ex.id));
    w.log('create', 'user', cred.user.uid, email, { role: [null, role] });
    await w.commit();
    await done();
    f.reset();
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') await confirmBox('هذا الإيميل عنده حساب مسبقاً.\n• إذا يعرف كلمة مروره: يسجل دخول، وبعدها يظهر هنا وتختار صلاحيته.\n• إذا ما يعرفها: احذف حسابه من Firebase Console ← Authentication ← Users ثم أضفه هنا من جديد.', 'تمام');
    else if (err.code === 'auth/admin-restricted-operation' || err.code === 'auth/operation-not-allowed') await confirmBox('التسجيل العام مُوقف من Firebase Console، والدالة السحابية createStaff غير منشورة.\nانشر الدوال (تحتاج Blaze) أو أعد تفعيل التسجيل مؤقتاً.', 'تمام');
    else toast(authErr(err), 'error');
  }
  try { await sec.auth().signOut(); } catch (x) {}
  btn.disabled = false; btn.textContent = '➕ إضافة';
}

// ═══ سجل العمليات ═══
const ACTION_NAME = { create: '➕ إضافة', update: '✏️ تعديل', delete: '🗑 حذف', restore: '♻️ استرجاع', purge: '⛔ حذف نهائي', sale: '🛒 بيع', return: '↩️ مرتجع', cancel: '⛔ إلغاء',
  'stock-in': '📥 إدخال', 'stock-out': '📤 إخراج', 'stock-count': '📋 جرد', import: '📊 استيراد', export: '⬇ تصدير', role: '👥 صلاحية', migrate: '🚚 نقل بيانات',
  restoreBackup: '💾 استرجاع نسخة', settings: '⚙️ إعدادات', bulk: '✏️ تعديل جماعي', undo: '↶ تراجع', merge: '🔗 دمج', purchase: '📥 شراء', payment: '💵 دفعة', adjust: '⚖️ تسوية', stocktake: '📋 جرد', archive: '🗄 أرشفة', transfer: '🔀 نقل', expense: '💸 مصروف', closing: '🔒 إغلاق صندوق', rebuildStats: '📊 إعادة احتساب' };
const FIELD_NAME = { name: 'الاسم', barcode: 'الباركود', category: 'القسم', brand: 'الماركة', unit: 'الوحدة', qty: 'الكمية', minQty: 'حد التنبيه', cost: 'الشراء', price: 'البيع',
  location: 'الموقع', warehouseId: 'المخزن', desc: 'الوصف', showInStore: 'الظهور', deleted: 'محذوف', role: 'الصلاحية', total: 'الإجمالي', note: 'ملاحظة', amount: 'المبلغ', count: 'العدد', due: 'دين' };
function logRow(l) {
  let ch = '';
  if (l.changes) ch = Object.entries(l.changes).filter(([k]) => k !== 'snapshot').map(([k, v]) => Array.isArray(v) ? (FIELD_NAME[k] || k) + ': ' + esc(v[0]) + ' ← ' + esc(v[1]) : (FIELD_NAME[k] || k) + ': ' + esc(typeof v === 'object' ? JSON.stringify(v) : v)).join(' · ');
  return '<div class="list-row" style="cursor:default"><div class="grow"><b>' + (ACTION_NAME[l.action] || esc(l.action)) + '</b> ' + esc(l.name) +
    '<div class="small muted">' + esc(l.email) + ' · ' + fmtDate(l.at) + '</div>' + (ch ? '<div class="small">' + ch + '</div>' : '') + '</div>' +
    (l.action === 'bulk' && l.entityId && isAdmin() ? '<button class="btn sm ghost" data-action="undo-bulk" data-id="' + esc(l.entityId) + '">↶ تراجع</button>' : '') + '</div>';
}
page('logs', {
  t: 'سجل العمليات', ic: '📜', admin: true,
  html: () => '<div class="toolbar"><div class="chips" id="lgTab"><button class="chip on" data-t="ops">📜 العمليات</button><button class="chip" data-t="err">🐞 أخطاء الأجهزة</button></div>' +
    '<select id="lgAct" class="auto"><option value="">كل العمليات</option>' + Object.entries(ACTION_NAME).map(([k, v]) => '<option value="' + k + '">' + v + '</option>').join('') + '</select>' +
    '<span class="muted small grow">لا يمكن تعديل السجل</span>' + (isOwner() ? '<button class="btn ghost sm" data-action="archive-logs">🗄 أرشفة الأقدم من سنة</button>' : '') + '</div>' +
    '<div class="card" id="logBox"></div><div class="mt" style="text-align:center"><button class="btn ghost hidden" id="lgMore" data-action="more-logs">تحميل أقدم</button></div>',
  init(el) {
    el.querySelector('#lgAct').addEventListener('change', () => PAGES.logs.render());
    el.querySelector('#lgTab').addEventListener('click', e => { const c = e.target.closest('[data-t]'); if (!c) return; LG.tab = c.dataset.t; el.querySelectorAll('#lgTab .chip').forEach(x => x.classList.toggle('on', x === c)); el.querySelector('#lgAct').classList.toggle('hidden', LG.tab !== 'ops'); PAGES.logs.render(); });
  },
  render: () => loadLogs(true)
});
const LG = { tab: 'ops', last: null };
async function loadLogs(reset) {
  const box = document.getElementById('logBox'); if (!box) return;
  const more = document.getElementById('lgMore');
  if (reset) { LG.last = null; box.innerHTML = '<div class="empty"><div class="spinner"></div></div>'; }
  try {
    if (LG.tab === 'err') {
      const qs = await col('errors').orderBy('at', 'desc').limit(100).get();
      box.innerHTML = (qs.size ? '<div class="card-h"><span class="muted small">آخر ' + qs.size + ' خطأ من أجهزة الموظفين — يساعد على اكتشاف المشاكل مبكراً</span><button class="btn sm ghost" data-action="clear-errors">🧹 مسح الكل</button></div>' : '') +
        (qs.docs.map(d => { const x = d.data(snapOpt); return '<div class="list-row" style="cursor:default"><div class="grow"><b class="err-row">' + esc(x.msg) + '</b><div class="small muted">' + esc(x.email) + ' · ' + fmtDate(x.at) + (x.page ? ' · صفحة ' + esc((PAGES[x.page] || {}).t || x.page) : '') + '</div>' + (x.stack ? '<details class="small"><summary>التفاصيل</summary><div class="err-row">' + esc(x.stack) + '</div><div class="muted">' + esc(x.ua || '') + '</div></details>' : '') + '</div></div>'; }).join('') || '<div class="empty"><div class="ico">✅</div>لا توجد أخطاء مسجلة</div>');
      more.classList.add('hidden'); return;
    }
    const a = document.getElementById('lgAct').value;
    let q = col('logs');
    if (a) q = q.where('action', '==', a);
    q = q.orderBy('at', 'desc');
    if (LG.last) q = q.startAfter(LG.last);
    const qs = await q.limit(200).get();
    LG.last = qs.docs[qs.docs.length - 1] || LG.last;
    const html = qs.docs.map(d => logRow(d.data(snapOpt))).join('');
    if (reset) box.innerHTML = html || '<div class="empty">لا يوجد سجل</div>'; else box.insertAdjacentHTML('beforeend', html);
    more.classList.toggle('hidden', qs.size < 200);
  } catch (e) { box.innerHTML = '<p class="card-b">' + esc(authErr(e)) + '</p>'; }
}
// أرشفة: تحميل السجلات الأقدم من سنة كملف ثم حذفها من السيرفر (للمالك فقط) — يخفف الحجم والتكلفة
async function archiveLogs() {
  const cut = firebase.firestore.Timestamp.fromMillis(Date.now() - 366 * 864e5);
  let qs;
  try { qs = await col('logs').where('at', '<', cut).orderBy('at').limit(5000).get({ source: 'server' }); } catch (e) { return toast(authErr(e), 'error'); }
  if (!qs.size) return toast('لا توجد سجلات أقدم من سنة', 'info');
  if (!await confirmBox('يوجد ' + qs.size + ' سجل أقدم من سنة.\nسيتم تحميلها كملف على جهازك أولاً، ثم حذفها من السيرفر.\nاحتفظ بالملف في مكان آمن.', 'تحميل وأرشفة')) return;
  const rows = qs.docs.map(d => Object.assign({ id: d.id }, plain(d.data())));
  downloadBlob(new Blob([JSON.stringify({ kind: 'logs-archive', exportedAt: new Date().toISOString(), by: S.user.email, logs: rows })], { type: 'application/json' }), 'أرشيف-السجل-حتى-' + localDay(cut.toMillis()) + '.json');
  if (!await confirmBox('تم تحميل الملف (' + rows.length + ' سجل). تأكدت أنه محفوظ؟ الآن نحذفها من السيرفر.', 'حذف من السيرفر', true)) return;
  const w = W(); qs.docs.forEach(d => w.delete(d.ref));
  w.log('archive', 'logs', '', 'أرشفة السجل', { count: rows.length });
  try { await w.commit(); toast('تمت أرشفة ' + rows.length + ' سجل'); loadLogs(true); } catch (e) { toast(authErr(e), 'error'); }
}
act({
  'more-logs': () => loadLogs(false),
  'archive-logs': archiveLogs,
  'clear-errors': async () => {
    if (!await confirmBox('مسح كل الأخطاء المسجلة؟', 'مسح')) return;
    try { const qs = await col('errors').limit(400).get(); const w = W(); qs.docs.forEach(d => w.delete(d.ref)); await w.commit(); loadLogs(true); } catch (e) { toast(authErr(e), 'error'); }
  }
});
// ═══ المحذوفات ═══
page('trash', {
  t: 'المحذوفات', ic: '🗑', admin: true, deps: ['products'],
  html: () => '<div class="card"><div class="card-h"><h3>🗑 سلة المحذوفات</h3><span class="muted small">المنتج المحذوف يبقى هنا ويمكن استرجاعه بكامل بياناته</span></div><div class="table-wrap"><table class="t" id="trashTable"></table></div></div>',
  render() {
    const list = [...S.products.values()].filter(p => p.deleted).sort((a, b) => tsMillis(b.deletedAt) - tsMillis(a.deletedAt));
    document.getElementById('trashTable').innerHTML = list.length ? '<tbody>' + list.map(p =>
      '<tr><td><div class="pcell">' + thumbHtml(p) + '<div><b>' + esc(p.name) + '</b><span class="small muted">' + (p.mergedInto ? 'دُمج · ' : '') + 'حذفه ' + esc(p.deletedBy || '') + ' · ' + fmtDate(p.deletedAt) + '</span></div></div></td>' +
      '<td><div class="acts"><button class="btn sm green" data-action="restore-product" data-id="' + esc(p.id) + '">♻️ استرجاع</button>' +
      (isOwner() ? '<button class="btn sm danger" data-action="purge-product" data-id="' + esc(p.id) + '">حذف نهائي</button>' : '') + '</div></td></tr>').join('') + '</tbody>'
      : '<tr><td><div class="empty"><div class="ico">🗑</div>السلة فارغة</div></td></tr>';
  }
});
act({
  'restore-product': async el => {
    const p = S.products.get(el.dataset.id), w = W();
    w.update(col('products').doc(p.id), { deleted: false, deletedAt: null, mergedInto: FV.delete(), updatedAt: TS() }); w.log('restore', 'product', p.id, p.name, null); w.catalog = true;
    try { await w.commit(); toast('تم الاسترجاع'); } catch (e) { toast(authErr(e), 'error'); }
  },
  'purge-product': async el => {
    const p = S.products.get(el.dataset.id);
    if (!await confirmBox('حذف "' + p.name + '" نهائياً؟ لا يمكن التراجع.', 'حذف نهائي', true)) return;
    const w = W(); w.delete(col('products').doc(p.id)); w.delete(col('images').doc(p.id));
    w.set(col('tombstones').doc(p.id), { at: TS(), name: p.name || '', by: S.user.email });
    w.log('purge', 'product', p.id, p.name, { snapshot: JSON.stringify(Object.assign({}, p, { thumb: '' })).slice(0, 5000) });
    try { await w.commit(); toast('حُذف نهائياً'); } catch (e) { toast(authErr(e), 'error'); }
  },
  'undo-bulk': async el => {
    if (!await confirmBox('التراجع عن هذا التعديل الجماعي وإرجاع القيم القديمة؟', 'تراجع')) return;
    try { const n = await bulkUndo(el.dataset.id); toast('تم التراجع عن ' + n + ' منتج'); PAGES.logs.render(); } catch (e) { toast(e.message || authErr(e), 'error'); }
  }
});

// ═══ النسخ الاحتياطي ═══
const BACKUP_COLS = ['products', 'warehouses', 'invoices', 'quotes', 'customers', 'suppliers', 'purchases', 'porders', 'payments', 'expenses', 'closings', 'stockMoves', 'stats', 'stocktakes', 'settings', 'users'];
page('backup', {
  t: 'النسخ الاحتياطي', ic: '💾', admin: true,
  html: () => `<div class="dash-grid">
    <div class="card"><div class="card-h"><h3>💾 نسخة احتياطية الآن</h3></div><div class="card-b">
      <p class="muted small mb">ملف JSON فيه كل شيء: المنتجات، الفواتير، الزبائن والديون، الموردين، المشتريات، حركة المخزون، الإعدادات.</p>
      <label class="row small mb"><input type="checkbox" id="bkImages"> تضمين الصور (الملف يصير أكبر)</label>
      <button class="btn primary block" data-action="backup-json">⬇ تحميل نسخة كاملة</button>
      <button class="btn ghost block mt" data-action="export-dialog">⬇ نسخة Excel للمنتجات</button>
      <p class="small mt" id="lastBackup"></p></div></div>
    <div class="card"><div class="card-h"><h3>♻️ استرجاع من نسخة</h3></div><div class="card-b">
      <p class="muted small mb">يقبل نسخ النظام الجديد والقديم. <b>لا يحذف</b> أي بيانات موجودة؛ يضيف الناقص (ويستبدل الموجود فقط إذا اخترت).</p>
      <label class="btn ghost block">📂 اختيار ملف النسخة<input type="file" id="restoreFile" accept=".json" hidden></label></div></div>
    <div class="card"><div class="card-h"><h3>🛠 أدوات الصيانة</h3></div><div class="card-b stack">
      <button class="btn ghost block" data-action="rebuild-catalog">🔄 إعادة نشر كتالوج الزبائن</button>
      <button class="btn ghost block" data-action="rebuild-stats">📊 إعادة احتساب الإحصائيات من الفواتير</button>
      <button class="btn ghost block" data-action="migrate-legacy">🚚 نقل من النظام القديم (store/shared_store)</button>
      <div id="migrateLog" class="mlog hidden"></div></div></div></div>`,
  init(el) { el.querySelector('#restoreFile').addEventListener('change', restoreFile); },
  async render() {
    try {
      const d = (await col('settings').doc('meta').get()).data() || {};
      document.getElementById('lastBackup').innerHTML = (d.lastBackupAt ? 'آخر نسخة يدوية: <b>' + fmtDate(d.lastBackupAt) + '</b> (' + esc(d.lastBackupBy || '') + ')' : '⚠️ لم تُؤخذ نسخة يدوية بعد') +
        (d.lastAutoBackupAt ? '<br>آخر نسخة تلقائية: ' + fmtDate(d.lastAutoBackupAt) : '');
    } catch (e) {}
  }
});
function plain(v) {
  if (v && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = plain(v[k]); return o; }
  return v;
}
function revive(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && '__ts' in v) return firebase.firestore.Timestamp.fromMillis(v.__ts);
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = revive(v[k]); return o; }
  return v;
}
async function backupJson() {
  const btn = document.querySelector('[data-action=backup-json]'); btn.disabled = true;
  try {
    const names = BACKUP_COLS.concat(document.getElementById('bkImages').checked ? ['images'] : []);
    const out = { version: 3, app: 'inventory', exportedAt: new Date().toISOString(), exportedBy: S.user.email };
    for (const n of names) {
      btn.textContent = 'جاري تجهيز: ' + n + '…';
      try { const qs = await col(n).get({ source: 'server' }); out[n] = qs.docs.map(d => Object.assign({ id: d.id }, plain(d.data()))); } catch (e) { out[n] = []; }
      if (n === 'settings') out[n].forEach(d => { delete d.geminiKey; }); // المفاتيح السرية لا تدخل ملف النسخة
    }
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    downloadBlob(blob, 'نسخة-احتياطية-' + localDay() + '.json');
    await col('settings').doc('meta').set({ lastBackupAt: TS(), lastBackupBy: S.user.email, lastBackupProducts: out.products.length }, { merge: true });
    toast('تم تحميل النسخة: ' + out.products.length + ' منتج، ' + out.invoices.length + ' فاتورة (' + (blob.size / 1048576).toFixed(1) + ' MB)');
    PAGES.backup.render();
  } catch (e) { toast(authErr(e), 'error'); }
  btn.disabled = false; btn.textContent = '⬇ تحميل نسخة كاملة';
}
// تحويل نسخة النظام القديم
function toTs(v) { if (!v) return TS(); if (typeof v.toMillis === 'function') return v; const n = typeof v === 'number' ? v : Date.parse(v); return isFinite(n) ? firebase.firestore.Timestamp.fromMillis(n) : TS(); }
function legacyToV3(src) {
  const products = (src.products || []).filter(p => p && p.id).map(p => {
    const o = Object.assign({}, p); delete o.image; delete o.id;
    return Object.assign(o, { id: String(p.id), name: String(p.name || 'بدون اسم'), barcode: String(p.barcode || ''), category: String(p.category || 'أخرى'), brand: String(p.brand || ''), unit: String(p.unit || 'قطعة'),
      qty: num(p.qty), minQty: num(p.minQty, 5), cost: num(p.cost), price: num(p.price), location: String(p.location || ''), desc: String(p.desc || ''), warehouseId: String(p.warehouseId || ''),
      showInStore: p.showInStore !== false, deleted: !!p.deleted, createdAt: toTs(p.createdAt), legacyImage: p.image || '' });
  });
  return { collections: { warehouses: (src.warehouses || []).filter(w => w && w.id).map(w => Object.assign({}, w, { id: String(w.id) })), invoices: (src.invoices || []).filter(i => i && i.id).map(i => Object.assign({}, i, { id: String(i.id), createdAt: toTs(i.createdAt), legacy: true })) },
    products, settings: src.settings || null, images: {} };
}
async function writeRestore(data, overwrite, log) {
  const exists = new Set(S.products.keys());
  const prods = data.products.filter(p => overwrite || !exists.has(p.id));
  log('المنتجات للكتابة: ' + prods.length + ' (موجود ومتروك: ' + (data.products.length - prods.length) + ')');
  let n = 0;
  for (const p of prods) {
    const raw = data.images[p.id] || p.legacyImage; delete p.legacyImage;
    if (raw && String(raw).startsWith('data:image')) {
      try { p._full = await compressImage(raw, 1000, 0.8); p.thumb = await compressImage(p._full, 160, 0.62); p.hasImage = true; n++; } catch (e) { log('⚠️ صورة ' + p.name); }
    }
  }
  if (n) log('عولجت ' + n + ' صورة');
  const w = W();
  prods.forEach(p => { const o = Object.assign({}, p); const full = o._full; delete o._full; delete o.id; o.updatedAt = TS(); w.set(col('products').doc(p.id), o, { merge: true }); if (full) w.set(col('images').doc(p.id), { data: full, updatedAt: TS() }); });
  for (const [name, docs] of Object.entries(data.collections || {})) {
    let ids = new Set();
    if (!overwrite && docs.length) { try { ids = new Set((await col(name).get()).docs.map(d => d.id)); } catch (e) {} }
    const todo = docs.filter(d => overwrite || !ids.has(d.id));
    todo.forEach(d => { const o = Object.assign({}, d); delete o.id; w.set(col(name).doc(d.id), o, { merge: true }); });
    log(name + ': ' + todo.length);
  }
  if (data.settings) { const cur = (await col('settings').doc('main').get()).data(); if (!cur || overwrite) { w.set(col('settings').doc('main'), data.settings, { merge: true }); log('الإعدادات'); } }
  w.catalog = true;
  await w.commit((i, t) => log('دفعة ' + i + '/' + t));
  const qs = await col('products').get({ source: 'server' });
  const have = new Set(qs.docs.map(d => d.id));
  const miss = data.products.filter(p => !have.has(p.id));
  log(miss.length ? '⛔ ' + miss.length + ' منتج لم يُكتب!' : '✅ تحقق: كل المنتجات الـ ' + data.products.length + ' موجودة');
  return !miss.length;
}
async function restoreFile(e) {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  let json; try { json = JSON.parse(await file.text()); } catch (err) { return toast('الملف ليس JSON صالحاً', 'error'); }
  let data;
  if (json.version >= 2) {
    const r = revive(json), images = {};
    (r.images || []).forEach(i => images[i.id] = i.data);
    const collections = {};
    BACKUP_COLS.filter(c => !['products', 'settings', 'users'].includes(c)).forEach(c => { if (Array.isArray(r[c])) collections[c] = r[c]; });
    const st = (r.settings || []).find(s => s.id === 'main'); if (st) delete st.id;
    data = { products: r.products || [], collections, settings: st || null, images };
  } else data = legacyToV3(json.data || json);
  if (!data.products.length) return toast('لا توجد منتجات في الملف', 'error');
  const existing = data.products.filter(p => S.products.has(p.id)).length;
  const m = modal('mRestore', 'استرجاع: ' + file.name,
    '<p class="mb">المنتجات: <b>' + data.products.length + '</b> (منها ' + existing + ' موجود حالياً) · ' + Object.entries(data.collections).map(([k, v]) => k + ': ' + v.length).join(' · ') + '</p>' +
    '<label class="row"><input type="checkbox" id="rsOver"> استبدال الموجود بنسخة الملف (بدون التحديد: يضيف الناقص فقط — الأكثر أماناً)</label><div id="rsLog" class="mlog hidden"></div>',
    '<button class="btn primary" id="rsGo">تنفيذ</button><button class="btn ghost" data-close="mRestore">إغلاق</button>', 'lg');
  m.querySelector('#rsGo').onclick = async () => {
    const b = m.querySelector('#rsGo'); b.disabled = true;
    const el = m.querySelector('#rsLog'); el.classList.remove('hidden');
    const log = s => { el.textContent += s + '\n'; el.scrollTop = el.scrollHeight; };
    try { await writeRestore(data, m.querySelector('#rsOver').checked, log); const w = W(); w.log('restoreBackup', 'system', '', file.name, null); await w.commit(); toast('اكتمل الاسترجاع'); }
    catch (err) { log('⛔ ' + authErr(err)); }
  };
  openModal('mRestore');
}

// إعادة احتساب الإحصائيات اليومية من الفواتير والمشتريات والدفعات (للصيانة)
async function rebuildStats() {
  if (!await confirmBox('إعادة احتساب كل الإحصائيات اليومية من الفواتير والمشتريات والدفعات؟\nمفيد فقط إذا شككت بأرقام التقارير.', 'احتساب')) return;
  const el = document.getElementById('migrateLog'); el.classList.remove('hidden'); el.textContent = '';
  const log = s => { el.textContent += s + '\n'; };
  try {
    const days = {};
    const D = k => days[k] = days[k] || { date: k, sales: 0, discount: 0, returns: 0, profit: 0, count: 0, cash: 0, credit: 0, collected: 0, refunds: 0, purchases: 0, paidSuppliers: 0,
      expenses: 0, expCash: 0, collectedCash: 0, paidSupCash: 0, purCash: 0, qty: {}, val: {} };
    const inv = await col('invoices').get(); log('فواتير: ' + inv.size);
    inv.docs.forEach(d => {
      const x = d.data(); if (x.legacy) return;
      const k = D(x.day || localDay(x.createdAt));
      k.sales += num(x.total); k.discount += num(x.discount); k.profit += num(x.profit); k.count++; k.cash += num(x.paid != null ? x.paid : x.total); k.credit += num(x.due);
      (x.items || []).forEach(it => { k.qty[it.id] = (k.qty[it.id] || 0) + num(it.qty); k.val[it.id] = (k.val[it.id] || 0) + num(it.qty) * num(it.price); });
      (x.returns || []).forEach(r => {
        const rk = D(localDay(r.at)); rk.returns += num(r.amount); rk.refunds += num(r.amount) - num(r.fromBalance != null ? r.fromBalance : (r.refund === 'balance' ? r.amount : 0));
        let cogs = 0; (r.items || []).forEach(it => { const o = (x.items || []).find(i => i.id === it.id) || {}; cogs += num(it.qty) * num(o.cost); rk.qty[it.id] = (rk.qty[it.id] || 0) - num(it.qty); rk.val[it.id] = (rk.val[it.id] || 0) - num(it.qty) * num(it.price); });
        rk.profit -= num(r.amount) - cogs;
      });
    });
    const pur = await col('purchases').get(); log('مشتريات: ' + pur.size);
    pur.docs.forEach(d => {
      const x = d.data(), pc = (x.payMethod || 'نقداً') === 'نقداً' ? num(x.paid) : 0;
      const k = D(localDay(x.createdAt)); k.purchases += num(x.total); k.paidSuppliers += num(x.paid); k.purCash += pc;
      if (x.cancelled) { const c = D(localDay(x.cancelledAt)); c.purchases -= num(x.total); c.paidSuppliers -= num(x.paid); c.purCash -= pc; }
    });
    const pay = await col('payments').where('type', '==', 'payment').get(); log('دفعات: ' + pay.size);
    pay.docs.forEach(d => {
      const x = d.data(), k = D(localDay(x.at)), cashy = (x.method || 'نقداً') === 'نقداً';
      if (x.kind === 'customer') { k.collected += num(x.amount); if (cashy) k.collectedCash += num(x.amount); }
      else { k.paidSuppliers += num(x.amount); if (cashy) k.paidSupCash += num(x.amount); }
    });
    try {
      const ex = await col('expenses').get(); log('مصاريف: ' + ex.size);
      ex.docs.forEach(d => { const x = d.data(), k = D(x.date); k.expenses += num(x.amount); if (x.method === 'نقداً') k.expCash += num(x.amount); });
    } catch (e) {}
    const w = W();
    const old = await col('stats').get(); old.docs.forEach(d => { if (!days[d.data().date]) w.delete(d.ref); });
    Object.values(days).forEach(k => w.set(col('stats').doc('d_' + k.date), k));
    w.log('rebuildStats', 'system', '', 'stats', { days: Object.keys(days).length });
    await w.commit(); log('✅ تم: ' + Object.keys(days).length + ' يوم');
  } catch (e) { log('⛔ ' + authErr(e)); }
}
async function migrateLegacy() {
  if (!await confirmBox('نقل البيانات من المستند القديم store/shared_store؟\nيضيف المنتجات الناقصة فقط ولا يغيّر الموجود.', 'نقل')) return;
  const el = document.getElementById('migrateLog'); el.classList.remove('hidden'); el.textContent = '';
  const log = s => { el.textContent += s + '\n'; el.scrollTop = el.scrollHeight; };
  try {
    const snap = await col('store').doc('shared_store').get({ source: 'server' });
    if (!snap.exists) return log('⛔ المستند القديم غير موجود');
    const data = legacyToV3(snap.data());
    log('وُجد: ' + data.products.length + ' منتج');
    for (let i = 0; i < data.products.length; i += 25) {
      const part = data.products.slice(i, i + 25);
      const ss = await Promise.all(part.map(p => col('store').doc('img_' + p.id).get().catch(() => null)));
      ss.forEach((s, k) => { if (s && s.exists && s.data().image) data.images[part[k].id] = s.data().image; });
    }
    await writeRestore(data, false, log);
    await col('settings').doc('meta').set({ migratedAt: TS(), migratedBy: S.user.email, migratedCount: data.products.length }, { merge: true });
  } catch (e) { log('⛔ ' + authErr(e)); }
}
act({ 'backup-json': backupJson, 'rebuild-stats': rebuildStats, 'migrate-legacy': migrateLegacy, 'rebuild-catalog': async () => { toast('جاري النشر…', 'info'); await Catalog.sync(true); toast('تم نشر كتالوج الزبائن (' + ((S.packMeta || {}).count || 0) + ' منتج)'); } });

// ═══ الإعدادات ═══
const SET_LOGO = { v: '', touched: false, show: null };
page('settings', {
  t: 'الإعدادات', ic: '⚙️', admin: true, deps: ['settings'],
  html: () => `<form id="settingsForm" class="card"><div class="card-b">
    <h3 class="mb">🏢 معلومات المحل</h3><div class="grid2">
      <div class="field"><label class="f">اسم المحل</label><input name="company"></div><div class="field"><label class="f">الهاتف</label><input name="phone"></div>
      <div class="field"><label class="f">واتساب (مثال 9647701234567)</label><input name="whatsapp" class="num"></div><div class="field"><label class="f">العنوان</label><input name="address"></div></div>
    <div class="field"><label class="f">نص أسفل الفاتورة</label><input name="footer"></div>
    <div class="field"><label class="f">شعار المحل (يظهر في الفواتير وعروض الأسعار)</label>
      <div class="row"><img id="logoPrev" class="logo-prev hidden" alt=""><label class="btn ghost sm">📷 اختيار صورة<input type="file" id="logoFile" accept="image/*" hidden></label>
      <button type="button" class="btn ghost sm hidden" id="logoDel">✕ إزالة</button></div></div>
    <h3 class="mb mt">🧾 الفواتير والعملة</h3><div class="grid3">
      <div class="field"><label class="f">شكل الطباعة الافتراضي</label><select name="receipt"><option value="a4">A4</option><option value="thermal">إيصال حراري 80mm</option></select></div>
      <div class="field"><label class="f">العملة</label><select name="currency"><option value="IQD">دينار عراقي</option><option value="USD">دولار</option><option value="BOTH">الاثنين</option></select></div>
      <div class="field"><label class="f">سعر الصرف (دينار لكل دولار)</label><input name="exrate" type="number"></div>
      <div class="field"><label class="f">حد التنبيه الافتراضي للمخزون</label><input name="minstock" type="number"></div></div>
    <h3 class="mb mt">🛡 الحماية والتشغيل</h3>
    <label class="row mb"><input type="checkbox" name="blockNegative"> منع البيع بكمية أكبر من المتوفر بالمخزون</label>
    <label class="row mb"><input type="checkbox" name="allowDupBarcode"> السماح بتكرار الباركود (غير مستحسن — يسبب توزيع نفس القطعة بأكثر من مكان)</label>
    <div class="grid3"><div class="field"><label class="f">خروج تلقائي بعد عدم الاستخدام (دقائق، 0 = بدون)</label><input name="idleMinutes" type="number" min="0" max="600"></div></div>
    <h3 class="mb mt">🤖 التعبئة الذكية (Google Gemini)</h3>
    <label class="row mb"><input type="checkbox" name="aiOn"> تفعيل زر "🤖 تعبئة ذكية" في نافذة المنتج (تصوير القطعة ← تعبئة الحقول)</label>
    <div class="grid3"><div class="field"><label class="f">النموذج (اتركه فارغاً للافتراضي)</label><input name="aiModel" placeholder="تلقائي (أحدث نموذج)" dir="ltr"></div>
      <div class="field"><label class="f">&nbsp;</label><button type="button" class="btn ghost block" data-action="ai-test">🧪 اختبار الاتصال</button></div></div>
    <p class="small" id="aiTestOut"></p>
    <div class="field"><label class="f">مفتاح Gemini API (من Google AI Studio) <span id="aiKeyState" class="small"></span></label>
      <div class="row"><input name="geminiKey" type="password" autocomplete="off" dir="ltr" class="grow" placeholder="الصق المفتاح هنا (يبدأ بـ AIza…)"><button type="button" class="btn ghost sm" data-action="ai-key-clear">حذف المفتاح</button></div></div>
    <p class="small muted mb">احصل عليه مجاناً من <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> ← Create API key. المفتاح لا يُوضع في كود الموقع؛ يُحفظ في قاعدة البيانات ولا يراه إلا الموظفون المسجلون.</p>
    <h3 class="mb mt">☁️ خدمات خطة Blaze</h3><div id="blazeBox" class="small mb"></div>
    <h3 class="mb mt">🛍 موقع الزبائن</h3>
    <label class="row mb"><input type="checkbox" name="showPrices"> عرض الأسعار للزبائن</label>
    <label class="row mb"><input type="checkbox" name="showOutOfStock"> عرض المنتجات النافدة (كـ "غير متوفر")</label>
    <div class="field"><label class="f">رسالة ترحيب في موقع الزبائن</label><input name="welcome"></div>
    <button class="btn primary" type="submit">💾 حفظ الإعدادات</button></div></form>`,
  init(el) {
    const showLogo = v => { const i = el.querySelector('#logoPrev'); i.src = v || ''; i.classList.toggle('hidden', !v); el.querySelector('#logoDel').classList.toggle('hidden', !v); };
    SET_LOGO.show = showLogo; SET_LOGO.touched = false;
    el.querySelector('#logoFile').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { SET_LOGO.touched = true; SET_LOGO.v = await compressImage(f, 320, 0.85); showLogo(SET_LOGO.v); toast('اضغط حفظ الإعدادات لتثبيت الشعار', 'info'); }
      catch (err) { toast('تعذر قراءة الصورة', 'error'); }
    });
    el.querySelector('#logoDel').addEventListener('click', () => { SET_LOGO.v = ''; SET_LOGO.touched = true; showLogo(''); });
    el.querySelector('#settingsForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, s = {};
      ['company', 'phone', 'whatsapp', 'address', 'footer', 'currency', 'welcome', 'receipt'].forEach(k => s[k] = f.elements[k].value.trim());
      s.exrate = num(f.elements.exrate.value, 1300); s.minstock = num(f.elements.minstock.value, 5);
      s.idleMinutes = Math.max(0, Math.min(600, num(f.elements.idleMinutes.value, 0)));
      s.logo = SET_LOGO.touched ? SET_LOGO.v || '' : S.settings.logo || ''; SET_LOGO.touched = false;
      ['showPrices', 'showOutOfStock', 'blockNegative', 'allowDupBarcode', 'aiOn'].forEach(k => s[k] = f.elements[k].checked);
      s.aiModel = f.elements.aiModel.value.trim().replace(/[^\w.\-]/g, '');
      const gk = f.elements.geminiKey.value.trim();
      const w = W();
      w.set(col('settings').doc('main'), s, { merge: true });
      if (gk) { w.set(col('settings').doc('ai'), { geminiKey: gk, keySetAt: TS(), keySetBy: S.user.email }, { merge: true }); f.elements.geminiKey.value = ''; }
      w.set(col('publicSettings').doc('main'), { company: s.company, phone: s.phone, whatsapp: s.whatsapp, address: s.address, welcome: s.welcome, showPrices: s.showPrices, currency: s.currency, exrate: s.exrate });
      w.log('settings', 'system', 'main', 'الإعدادات', null);
      w.catalog = true;
      try { await w.commit(); toast('تم حفظ الإعدادات'); if (gk) { await aiKey(true); aiKeyState(); } } catch (err) { toast(authErr(err), 'error'); }
    });
  },
  render() {
    const f = document.getElementById('settingsForm'); if (!f || f.contains(document.activeElement)) return;
    const s = S.settings;
    ['company', 'phone', 'whatsapp', 'address', 'footer', 'currency', 'exrate', 'minstock', 'welcome', 'receipt', 'idleMinutes'].forEach(k => f.elements[k].value = s[k] == null ? '' : s[k]);
    ['showPrices', 'showOutOfStock', 'blockNegative', 'allowDupBarcode'].forEach(k => f.elements[k].checked = !!s[k]);
    f.elements.aiOn.checked = s.aiOn !== false; f.elements.aiModel.value = s.aiModel || '';
    aiKeyState();
    if (!SET_LOGO.touched && SET_LOGO.show) SET_LOGO.show(s.logo || '');
    renderBlaze();
  }
});

// ═══ خدمات Blaze: تخزين الصور في Firebase Storage ═══
// الصور حالياً داخل قاعدة البيانات (حد ~1MB للصورة). بعد Blaze: تُرفع لـ Storage (أسرع وأرخص وبلا حد)
function renderBlaze() {
  const b = document.getElementById('blazeBox'); if (!b) return;
  const s = S.settings, withImg = activeProducts().filter(p => p.hasImage && !p.imageUrl).length;
  b.innerHTML = s.storage
    ? '<p>✅ <b>الصور تُرفع إلى Firebase Storage.</b></p>' + (withImg ? '<p class="mt">يوجد <b class="num">' + withImg + '</b> صورة قديمة داخل قاعدة البيانات.</p><button type="button" class="btn ghost sm mt" data-action="migrate-images">🚚 نقل الصور القديمة إلى Storage</button> ' : '') +
      '<button type="button" class="btn ghost sm mt" data-action="storage-off">إيقاف (الرجوع لحفظ الصور في قاعدة البيانات)</button>'
    : '<p>✅ الصور تُحفظ داخل قاعدة البيانات (مضغوطة) وتعمل بالخطة المجانية. خطة Blaze غير متاحة حالياً للحسابات في العراق؛ إذا صارت متاحة وفُتح <b>Storage</b>، اضغط:</p>' +
      '<button type="button" class="btn ghost sm mt" data-action="storage-test">🧪 اختبار وتفعيل تخزين الصور</button>';
  b.insertAdjacentHTML('beforeend', '<p class="muted mt">النسخة الاحتياطية اليومية التلقائية تعمل مجاناً عبر GitHub (راجع README).</p>');
}
async function storageTest() {
  if (!firebase.storage) return toast('مكتبة Storage لم تُحمّل', 'error');
  const btn = document.querySelector('[data-action=storage-test]'); if (btn) { btn.disabled = true; btn.textContent = 'جاري الاختبار…'; }
  try {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.5));
    const ref = firebase.storage().ref('products/_test/test_' + Date.now() + '.jpg');
    await Promise.race([ref.put(blob, { contentType: 'image/jpeg' }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);
    await ref.getDownloadURL(); await ref.delete().catch(() => {});
    const w = W(); w.set(col('settings').doc('main'), { storage: true }, { merge: true }); w.log('settings', 'system', 'storage', 'تفعيل تخزين الصور', null);
    await w.commit();
    toast('✅ Storage يعمل — الصور الجديدة تُرفع إليه من الآن');
  } catch (e) {
    const m = String(e.code || e.message || e);
    await choiceBox('⛔ Storage غير جاهز', '<p>' + (/unauthorized|permission/i.test(m) ? 'قواعد التخزين لم تُنشر بعد — انشرها (firebase deploy --only storage).' : /not-found|bucket|timeout|unknown|retry-limit/i.test(m) ? 'Storage غير مفعّل بعد: Firebase Console ← Storage ← Get started (يحتاج خطة Blaze).' : esc(m)) + '</p><p class="small muted mt">' + esc(m) + '</p>', []);
  }
  renderBlaze();
}
async function migrateImages() {
  const list = activeProducts().filter(p => p.hasImage && !p.imageUrl);
  if (!list.length) return toast('لا توجد صور قديمة', 'info');
  if (!await confirmBox('نقل ' + list.length + ' صورة إلى Storage؟\n• خذ نسخة احتياطية مع الصور قبلها\n• الصورة القديمة تُحذف من قاعدة البيانات بعد نجاح رفعها فقط', 'نقل')) return;
  const btn = document.querySelector('[data-action=migrate-images]'); if (btn) btn.disabled = true;
  let ok = 0, fail = 0;
  for (let i = 0; i < list.length; i += 10) {
    const w = W();
    await Promise.all(list.slice(i, i + 10).map(async p => {
      try {
        const d = await col('images').doc(p.id).get({ source: 'server' });
        const full = d.exists ? d.data().data : p.thumb;
        if (!full) return;
        const f = await Images.put(w, p.id, full);
        w.update(col('products').doc(p.id), Object.assign(f, { updatedAt: TS() }));
        ok++;
      } catch (e) { fail++; }
    }));
    w.catalog = true;
    try { await w.commit(); } catch (e) { fail += 10; }
    if (btn) btn.textContent = 'جاري النقل ' + Math.min(i + 10, list.length) + '/' + list.length;
  }
  const w = W(); w.log('migrate', 'images', '', 'نقل الصور إلى Storage', { ok, fail }); await w.commit().catch(() => {});
  toast('تم نقل ' + ok + ' صورة' + (fail ? ' — فشل ' + fail + ' (أعد المحاولة)' : ''), fail ? 'error' : undefined);
  renderBlaze();
}
act({
  'storage-test': storageTest,
  'migrate-images': migrateImages,
  'storage-off': async () => {
    if (!await confirmBox('إيقاف رفع الصور إلى Storage؟ الصور المرفوعة سابقاً تبقى تعمل.', 'إيقاف')) return;
    const w = W(); w.set(col('settings').doc('main'), { storage: false }, { merge: true }); w.log('settings', 'system', 'storage', 'إيقاف تخزين الصور', null);
    try { await w.commit(); } catch (e) { toast(authErr(e), 'error'); }
  }
});
// حالة مفتاح Gemini (بدون عرض المفتاح نفسه)
async function aiKeyState() {
  const el = document.getElementById('aiKeyState'); if (!el) return;
  const k = await aiKey(true);
  el.innerHTML = k ? '<span class="badge b-green">✅ محفوظ (…' + esc(k.slice(-4)) + ')</span>' : '<span class="badge b-yellow">غير موجود</span>';
}
act({
  'ai-key-clear': async () => {
    if (!await confirmBox('حذف مفتاح Gemini؟ ستتوقف التعبئة الذكية حتى تضع مفتاحاً جديداً.', 'حذف', true)) return;
    try { await col('settings').doc('ai').set({ geminiKey: '', keySetAt: TS(), keySetBy: S.user.email }, { merge: true }); await aiKeyState(); toast('تم حذف المفتاح'); } catch (e) { toast(authErr(e), 'error'); }
  }
});