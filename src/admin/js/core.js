// ═══════════════════════════════════════════════════════════
// النواة: الحالة، الصلاحيات، المصادقة، التنقل، الاشتراكات
// ═══════════════════════════════════════════════════════════

const DEFAULT_SETTINGS = {
  company: 'المخزن', phone: '', whatsapp: '', address: '', footer: 'شكراً لتعاملكم معنا',
  currency: 'IQD', exrate: 1300, minstock: 5, receipt: 'a4',
  showPrices: true, showOutOfStock: true, welcome: ''
};
const CAT_ICON = { 'كهربائي': '⚡', 'ميكانيكي': '⚙️', 'هيدروليك': '💧', 'إلكترونيات': '🔌', 'إنشائي': '🏗️', 'أخرى': '📦' };
const ROLE_NAME = { admin: 'مدير', staff: 'موظف', customer: 'زبون', pending: 'بانتظار الموافقة' };
// 👑 المالك (محمد) — محمي أيضاً في firestore.rules
const OWNER_UIDS = ['gDgF5lS4GzdhDbZDZQKGyM2ytnv2'];
const isOwnerUid = id => OWNER_UIDS.includes(id);

const S = {
  user: null, me: null, role: '', ready: false,
  products: new Map(), productsFromServer: false,
  warehouses: [], customers: new Map(), suppliers: new Map(), users: [],
  stats: new Map(), packMeta: null,
  settings: Object.assign({}, DEFAULT_SETTINGS),
  page: '', params: {}, sel: new Set(), labels: [], unsub: []
};
const snapOpt = { serverTimestamps: 'estimate' };
const col = n => db.collection(n);
const isAdmin = () => S.role === 'admin';
const isOwner = () => !!(S.user && isOwnerUid(S.user.uid));

// ═══ تسجيل الصفحات والأزرار ═══
const PAGES = {};
const ACTIONS = {};
function page(id, def) { PAGES[id] = Object.assign({ id }, def); }
function act(map) { Object.assign(ACTIONS, map); }
const canSee = d => d && (!d.admin || isAdmin()) && (!d.owner || isOwner());

const NAV = [
  { sec: 'العمل اليومي' }, 'dashboard', 'sale', 'invoices', 'quotes', 'customers', 'cash',
  { sec: 'المخزون' }, 'products', 'purchases', 'orders', 'suppliers', 'ledger', 'stocktake', 'transfers', 'warehouses', 'labels',
  { sec: 'التحليل' }, 'reports', 'expenses', 'cleanup', 'excel',
  { sec: 'الإدارة' }, 'users', 'logs', 'trash', 'backup', 'settings'
];

// ═══ أدوات عامة للمنتجات ═══
const activeProducts = () => [...S.products.values()].filter(p => !p.deleted);
const whName = id => (S.warehouses.find(w => w.id === id) || {}).name || '—';
const money = n => fmtMoney(n, S.settings);
const normBrand = b => { b = String(b || '').trim().replace(/\s+/g, ' '); return /^[\x00-\x7F]+$/.test(b) ? b.toUpperCase() : b; };
const stName = p => num(p.qty) <= 0 ? 'نفد' : num(p.qty) <= num(p.minQty) ? 'منخفض' : 'متوفر';
function stockBadge(p) {
  const s = stName(p);
  return '<span class="badge ' + ({ 'نفد': 'b-red', 'منخفض': 'b-yellow', 'متوفر': 'b-green' })[s] + '">' + s + '</span>';
}
const imgSrc = p => p.thumbUrl || p.thumb || '';
function thumbHtml(p) {
  const s = imgSrc(p);
  return s ? '<img class="thumb" src="' + esc(s) + '" alt="" loading="lazy">' : '<div class="thumb">' + (CAT_ICON[p.category] || '📦') + '</div>';
}
function productText(p) { return [p.name, p.barcode, p.brand, p.category, p.location, p.desc].join(' '); }
// رقم القطعة = أطول كلمة لاتينية فيها أرقام ("NJ 205" تُقرأ كرقم واحد، واسم الماركة يُحذف من بدايته)
function partCode(name, brand) {
  const b = normBrand(brand);
  const m = (String(name || '').match(/[A-Za-z]{1,5} \d[A-Za-z0-9.\-_/+]*|[A-Za-z0-9][A-Za-z0-9.\-_/+]*[A-Za-z0-9]|[A-Za-z0-9]+/g) || [])
    .map(t => (b && t.toUpperCase().startsWith(b + ' ')) ? t.slice(b.length + 1) : t)
    .filter(t => /\d/.test(t) && (/[A-Za-z]/.test(t) || /\d{3,}/.test(t)));
  return m.sort((x, y) => y.length - x.length)[0] || '';
}
const compactCode = s => String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');
// بحث موحّد: يطابق رقم القطعة بدون مسافات/شرطات، والأرقام حرفياً، والكلمات العربية بتسامح إملائي
function searchScore(p, q) {
  const hayC = p._hayC || (p._hayC = compactCode(p.name + ' ' + p.brand + ' ' + p.barcode));
  const qc = compactCode(q);
  if (p.barcode && p.barcode === q) return 100;
  if (qc.length >= 2 && hayC.includes(qc)) return 20;
  let s = 0;
  const hay = productText(p);
  for (const w of normAr(q).split(' ').filter(Boolean)) {
    if (/\d/.test(w)) { if (!hayC.includes(compactCode(w))) return 0; s += 3; }
    else { const m = matchScore(hay, w); if (!m) return 0; s += m; }
  }
  return s;
}
// باركود التعبئة (كرتون): يرجع { p, qty } أو null
function findPack(code, list) {
  code = String(code || '').trim(); if (!code) return null;
  const p = (list || activeProducts()).find(x => x.packBarcode && x.packBarcode === code && num(x.packQty) > 0);
  return p ? { p, qty: num(p.packQty) } : null;
}
// يجد المنتج من أي رمز ممسوح (خطي أو مربع QR / Data Matrix):
// 1) الباركود  2) معرّف المنتج (ملصقات QR المطبوعة من النظام)  3) GS1 (01)+GTIN  4) رقم القطعة داخل نص رمز المصنع
function findByCode(code, list) {
  code = String(code || '').replace(/[\x00-\x1f]/g, '').replace(/^\][a-zA-Z]\d/, '').trim();
  if (!code) return null;
  list = list || activeProducts();
  let p = list.find(x => x.barcode && x.barcode === code) || list.find(x => x.id === code);
  if (p) return p;
  const gs1 = code.match(/^\(?01\)?(\d{14})/);
  if (gs1) { p = list.find(x => x.barcode && (x.barcode === gs1[1] || x.barcode === gs1[1].replace(/^0/, ''))); if (p) return p; }
  const cc = compactCode(code);
  if (cc.length < 4) return null;
  const hits = list.map(x => ({ x, pc: compactCode(partCode(x.name, x.brand)) })).filter(h => h.pc.length >= 4 && cc.includes(h.pc));
  if (!hits.length) return null;
  hits.sort((a, b) => b.pc.length - a.pc.length);
  // لو تساوى أطول تطابقين لمنتجين مختلفين لا نخمّن
  if (hits.length > 1 && hits[0].pc === hits[1].pc && hits[0].x.id !== hits[1].x.id) return null;
  return hits[0].x;
}
// ═══ كشف المكرر عند إدخال منتج ═══
// level: block = نفس الباركود (ممنوع) · strong = نفس رقم القطعة أو نفس الاسم · similar = اسم قريب جداً (خطأ إملائي)
const nameKey = s => compactCode(normAr(s));
// الماركة الفعلية: من الحقل، أو من الاسم إذا كان الحقل فارغاً ("بولبرين FAG NU220")
const BRAND_WORDS = ['FAG', 'SKF', 'NSK', 'NTN', 'SNR', 'INA', 'TIMKEN', 'KOYO', 'NACHI', 'ZWZ', 'IKO', 'SIEMENS', 'ABB', 'SCHNEIDER', 'LS', 'CHINT', 'LEGRAND', 'DANFOSS', 'OMRON', 'MITSUBISHI', 'DELTA', 'WEG', 'HAGER', 'EATON', 'GATES', 'FESTO', 'SMC', 'PARKER', 'REXROTH', 'TELEMECANIQUE', 'LOVATO'];
function effBrand(name, brand) {
  if (brand && String(brand).trim()) return normBrand(brand);
  const up = ' ' + String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ') + ' ';
  return BRAND_WORDS.find(b => up.includes(' ' + b + ' ')) || '';
}
function levD(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function findDuplicates(f, excludeId) {
  const out = new Map();
  const add = (p, level, why) => { const o = out.get(p.id); const rank = { block: 3, strong: 2, similar: 1 }; if (!o || rank[level] > rank[o.level]) out.set(p.id, { p, level, why }); };
  const ps = activeProducts().filter(p => p.id !== excludeId);
  const bc = String(f.barcode || '').trim();
  if (bc) ps.forEach(p => { if (p.barcode && p.barcode === bc) add(p, 'block', 'نفس الباركود'); else if (p.packBarcode && p.packBarcode === bc) add(p, 'block', 'نفس باركود التعبئة (' + (p.packName || 'كرتون') + ')'); });
  const pc = compactCode(partCode(f.name, f.brand));
  const nk = nameKey(f.name);
  if (pc.length >= 3 || nk.length >= 4) {
    ps.forEach(p => {
      const ppc = compactCode(partCode(p.name, p.brand));
      if (pc.length >= 3 && ppc === pc) {
        // نفس رقم القطعة: نتحقق أن الماركة لا تتعارض (NU220 من FAG ≠ NU220 من SKF)
        const b1 = effBrand(f.name, f.brand), b2 = effBrand(p.name, p.brand);
        add(p, (!b1 || !b2 || b1 === b2) ? 'strong' : 'similar', 'نفس رقم القطعة ' + partCode(p.name, p.brand) + (b1 && b2 && b1 !== b2 ? ' (ماركة مختلفة)' : ''));
        return;
      }
      const pk = nameKey(p.name);
      if (nk.length >= 4 && pk === nk) add(p, 'strong', 'نفس الاسم');
      else if (nk.length >= 7 && !pc && Math.abs(pk.length - nk.length) <= 2 && levD(pk, nk) <= (nk.length >= 12 ? 2 : 1)) add(p, 'similar', 'اسم مشابه جداً');
    });
  }
  return [...out.values()].sort((a, b) => ({ block: 3, strong: 2, similar: 1 }[b.level] - { block: 3, strong: 2, similar: 1 }[a.level]));
}
const placeText = p => {
  const parts = p.whQty ? Object.entries(p.whQty).filter(([, v]) => num(v) !== 0) : [];
  if (parts.length > 1) return '📍 ' + parts.map(([w, v]) => whName(w) + ': ' + fmtN(v)).join(' · ') + (p.location ? ' — رف ' + p.location : '') + ' (المجموع ' + fmtN(p.qty) + ')';
  return '📍 ' + whName(parts.length ? parts[0][0] : p.warehouseId) + (p.location ? ' — رف ' + p.location : ' — بدون موقع رف') + ' · الكمية ' + fmtN(p.qty) + ' ' + (p.unit || '');
};
function searchProducts(q, list, limit) {
  list = list || activeProducts();
  if (!q) return list.slice(0, limit || list.length);
  return list.map(p => ({ p, s: searchScore(p, q) })).filter(x => x.s).sort((a, b) => b.s - a.s).slice(0, limit || 1e9).map(x => x.p);
}
// تاريخ اليوم بتوقيت الجهاز (وليس UTC) — مهم لإحصائيات اليوم في بغداد
function localDay(d) {
  d = d ? (d.toDate ? d.toDate() : new Date(d)) : new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function docNum(prefix) {
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const rnd = 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)] + Math.floor(Math.random() * 10);
  return prefix + '-' + String(d.getFullYear()).slice(2) + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + rnd;
}

// ═══ المصادقة ═══
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'جاري الدخول...';
  try { await auth.signInWithEmailAndPassword(document.getElementById('loginEmail').value.trim(), document.getElementById('loginPass').value); }
  catch (err) { toast(authErr(err), 'error'); }
  btn.disabled = false; btn.textContent = 'تسجيل الدخول';
});

function show(id) {
  ['loading', 'authScreen', 'pendingScreen', 'pwScreen', 'app'].forEach(x => document.getElementById(x).classList.toggle('hidden', x !== id));
}
function stopSubs() { S.unsub.forEach(u => { try { u(); } catch (e) {} }); S.unsub = []; }

let meUnsub = null;
// يكتمل بعد تنفيذ كل السكربتات (p-*.js) — قبلها PAGES ناقصة
const APP_LOADED = new Promise(r => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', () => r(), { once: true }) : r());
auth.onAuthStateChanged(async user => {
  stopSubs();
  if (meUnsub) { meUnsub(); meUnsub = null; }
  S.user = user; S.ready = false; S.role = '';
  if (!user) { show('authScreen'); return; }
  show('loading');
  const ref = col('users').doc(user.uid);
  try {
    const snap = await ref.get();
    if (!snap.exists) await ref.set({ email: user.email, name: user.email.split('@')[0], role: isOwnerUid(user.uid) ? 'admin' : 'pending', createdAt: FV.serverTimestamp() });
    checkClock();
  } catch (e) { console.warn(e); }
  meUnsub = ref.onSnapshot(s => {
    const me = s.data() || { role: 'pending' };
    if (isOwnerUid(user.uid)) me.role = 'admin';
    const staff = me.role === 'admin' || me.role === 'staff';
    const ready = staff && !me.mustChangePassword;
    const changed = me.role !== S.role || !S.ready;
    S.me = me; S.role = me.role; S.ready = ready;
    // ننتظر تحميل كل ملفات الصفحات أولاً — بيانات الجهاز قد تصل قبل انتهاء تحميل السكربتات
    if (ready) { if (changed) APP_LOADED.then(() => { if (S.ready && S.user === user) startApp(); }); }
    else {
      stopSubs();
      if (staff) show('pwScreen');
      else { document.getElementById('pendingEmail').textContent = user.email; show('pendingScreen'); }
    }
  }, () => { document.getElementById('pendingEmail').textContent = user.email; show('pendingScreen'); });
});

// أول دخول بكلمة مرور مؤقتة
document.getElementById('pwForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, p1 = f.elements.p1.value, btn = f.querySelector('button');
  if (p1 !== f.elements.p2.value) return toast('كلمتا المرور غير متطابقتين', 'error');
  btn.disabled = true;
  try {
    await auth.currentUser.updatePassword(p1);
    await col('users').doc(S.user.uid).update({ mustChangePassword: false });
    toast('تم حفظ كلمة المرور الجديدة'); f.reset();
  } catch (err) {
    toast(err.code === 'auth/requires-recent-login' ? 'سجّل الخروج وادخل مرة ثانية بكلمة المرور المؤقتة ثم أعد المحاولة' : authErr(err), 'error');
  }
  btn.disabled = false;
});

function myPasswordDialog() {
  const m = modal('mMyPw', '🔑 تغيير كلمة المرور',
    '<form id="myPwForm">' +
    '<div class="field"><label class="f">كلمة المرور الحالية</label><input name="cur" type="password" required autocomplete="current-password"></div>' +
    '<div class="field"><label class="f">كلمة المرور الجديدة (8 أحرف أو أكثر)</label><input name="p1" type="password" minlength="8" required autocomplete="new-password"></div>' +
    '<div class="field"><label class="f">أعد كتابة الجديدة</label><input name="p2" type="password" minlength="8" required autocomplete="new-password"></div>' +
    '<button class="btn primary block" type="submit">حفظ</button></form>', '', 'sm');
  m.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('button');
    if (f.elements.p1.value !== f.elements.p2.value) return toast('كلمتا المرور الجديدتان غير متطابقتين', 'error');
    if (f.elements.p1.value === f.elements.cur.value) return toast('اختر كلمة مرور مختلفة عن الحالية', 'error');
    btn.disabled = true;
    try {
      const u = auth.currentUser;
      await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, f.elements.cur.value));
      await u.updatePassword(f.elements.p1.value);
      toast('تم تغيير كلمة المرور'); closeModal('mMyPw');
    } catch (err) {
      toast(['auth/wrong-password', 'auth/invalid-credential'].includes(err.code) ? 'كلمة المرور الحالية غير صحيحة' : authErr(err), 'error');
    }
    btn.disabled = false;
  };
  openModal('mMyPw');
}

// ═══ تشغيل التطبيق والاشتراكات ═══
const DATA_LISTENERS = [];
function onData(fn) { DATA_LISTENERS.push(fn); }
let dataTimer = null, dataKinds = new Set();
function dataChanged(kind) {
  dataKinds.add(kind);
  clearTimeout(dataTimer);
  dataTimer = setTimeout(() => {
    const kinds = dataKinds; dataKinds = new Set();
    DATA_LISTENERS.forEach(fn => { try { fn(kinds); } catch (e) { console.error(e); } });
    const p = PAGES[S.page];
    if (p && p.render && (!p.deps || p.deps.some(k => kinds.has(k)))) { try { p.render(); } catch (e) { console.error(e); } }
  }, 60);
}

function startApp() {
  stopSubs();
  document.getElementById('uName').textContent = S.me.name || S.user.email;
  document.getElementById('uRole').textContent = isOwner() ? '👑 المالك' : ROLE_NAME[S.role];
  document.getElementById('uAvatar').textContent = (S.me.name || S.user.email).charAt(0).toUpperCase();
  buildNav();
  show('app');
  S.productsFromServer = false;

  syncProducts();
  S.unsub.push(col('warehouses').onSnapshot(qs => { S.warehouses = qs.docs.map(d => Object.assign({ id: d.id }, d.data())); dataChanged('warehouses'); }));
  S.unsub.push(col('settings').doc('main').onSnapshot(s => {
    S.settings = Object.assign({}, DEFAULT_SETTINGS, s.data() || {});
    document.getElementById('brandName').textContent = S.settings.company;
    dataChanged('settings');
  }));
  S.unsub.push(col('customers').onSnapshot(qs => {
    qs.docChanges().forEach(ch => ch.type === 'removed' ? S.customers.delete(ch.doc.id) : S.customers.set(ch.doc.id, Object.assign({ id: ch.doc.id }, ch.doc.data(snapOpt))));
    dataChanged('customers');
  }, () => {}));
  // آخر 70 يوم من الإحصائيات اليومية (وثيقة واحدة لكل يوم — قراءات قليلة جداً)
  const since = localDay(Date.now() - 70 * 864e5);
  S.unsub.push(col('stats').where('date', '>=', since).onSnapshot(qs => {
    qs.docChanges().forEach(ch => ch.type === 'removed' ? S.stats.delete(ch.doc.data().date) : S.stats.set(ch.doc.data().date, ch.doc.data()));
    dataChanged('stats');
  }, () => {}));
  if (isAdmin()) {
    S.unsub.push(col('suppliers').onSnapshot(qs => {
      qs.docChanges().forEach(ch => ch.type === 'removed' ? S.suppliers.delete(ch.doc.id) : S.suppliers.set(ch.doc.id, Object.assign({ id: ch.doc.id }, ch.doc.data(snapOpt))));
      dataChanged('suppliers');
    }, () => {}));
  }
  S.unsub.push(col('catalogPacks').doc('meta').onSnapshot(s => { S.packMeta = s.data() || null; }, () => {}));
  if (isOwner()) {
    S.unsub.push(col('users').onSnapshot(qs => { S.users = qs.docs.map(d => Object.assign({ id: d.id }, d.data(snapOpt))); dataChanged('users'); }, () => {}));
  }
  onRoute();
}

// ═══ مزامنة المنتجات الجزئية ═══
// بدل قراءة كل المنتجات من السيرفر كل مرة: نقرأ نسخة الجهاز، ثم نستمع فقط لما تغيّر بعد آخر
// وقت سيرفر شفناه (updatedAt) + المحذوف نهائياً (tombstones). كاملة كل 7 أيام أو على جهاز جديد.
// الأوقات كلها من السيرفر — ساعة الجهاز الخاطئة لا تضيّع أي تغيير.
async function syncProducts() {
  const gen = S.syncGen = (S.syncGen || 0) + 1, alive = () => gen === S.syncGen && S.user;
  const K = 'pSync2_' + S.user.uid, MARGIN = 10 * 60e3;
  let st = {}; try { st = JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) {}
  const save = () => { try { localStorage.setItem(K, JSON.stringify(st)); } catch (e) {} };
  const ms = v => v && typeof v.toMillis === 'function' ? v.toMillis() : 0;
  const take = d => { S.products.set(d.id, Object.assign({ id: d.id }, d.data(snapOpt))); if (!d.metadata.hasPendingWrites) st.maxU = Math.max(st.maxU || 0, ms(d.get('updatedAt'))); };
  let cacheN = 0;
  if (!window.USE_EMULATORS) {
    try { const c = await col('products').get({ source: 'cache' }); c.docs.forEach(d => S.products.set(d.id, Object.assign({ id: d.id }, d.data(snapOpt)))); cacheN = c.size; if (cacheN) dataChanged('products'); } catch (e) {}
  }
  if (!alive()) return;
  if (!cacheN || !st.maxU || Date.now() - (st.full || 0) > 7 * 864e5 || Math.abs(Date.now() - (st.full || 0)) > 30 * 864e5) {
    try {
      const all = await col('products').get({ source: 'server' });
      if (!alive()) return;
      S.products.clear(); st.maxU = 0; all.docs.forEach(take);
      st.full = Date.now(); st.maxT = st.maxT || st.maxU; save();
      S.syncMode = 'كاملة (' + all.size + ' منتج)';
      S.productsFromServer = true; dataChanged('products'); setTimeout(() => Catalog.sync(), 1500);
    } catch (e) { S.syncMode = 'من الجهاز فقط (بدون إنترنت)'; }
  }
  if (!alive()) return;
  const since = v => firebase.firestore.Timestamp.fromMillis(Math.max(0, (v || 0) - MARGIN));
  // الاستماع الحي = المزامنة الجزئية (أول دفعة = كل ما تغير منذ آخر مرة) + التغييرات القادمة من الأجهزة الأخرى
  let first = true;
  S.unsub.push(col('products').where('updatedAt', '>', since(st.maxU)).onSnapshot({ includeMetadataChanges: true }, qs => {
    let n = 0;
    qs.docChanges().forEach(c => { if (c.type !== 'removed') { take(c.doc); n++; } });
    if (!qs.metadata.fromCache) {
      save();
      if (first) { first = false; if (!S.productsFromServer) { S.syncMode = 'جزئية (' + n + ' تغيير)'; S.productsFromServer = true; setTimeout(() => Catalog.sync(), 1500); n++; } }
    }
    if (n) dataChanged('products');
  }, err => toast(authErr(err), 'error')));
  S.unsub.push(col('tombstones').where('at', '>', since(st.maxT || st.maxU)).onSnapshot(qs => {
    let n = 0;
    qs.docChanges().forEach(c => { if (c.type === 'added' && S.products.delete(c.doc.id)) n++; st.maxT = Math.max(st.maxT || 0, ms(c.doc.get('at'))); });
    if (!qs.metadata.fromCache) save();
    if (n) dataChanged('products');
  }, () => {}));
}

function buildNav() {
  let html = '', pendingSec = null;
  NAV.forEach(n => {
    if (typeof n === 'object') { pendingSec = n.sec; return; }
    const d = PAGES[n];
    if (!canSee(d)) return;
    if (pendingSec) { html += '<div class="nav-sec">' + pendingSec + '</div>'; pendingSec = null; }
    html += '<a class="nav-a" href="#' + n + '" data-nav="' + n + '"><span class="ic">' + d.ic + '</span>' + d.t + (d.badge ? '<span class="cnt hidden" data-badge="' + n + '"></span>' : '') + '</a>';
  });
  document.getElementById('nav').innerHTML = html;
  const bn = ['dashboard', 'sale', 'products', 'customers'].filter(id => canSee(PAGES[id]));
  document.getElementById('bottomNav').innerHTML = bn.map(id => '<a href="#' + id + '" data-nav="' + id + '"><span class="ic">' + PAGES[id].ic + '</span>' + (PAGES[id].short || PAGES[id].t) + '</a>').join('') +
    '<a href="#" data-action="menu"><span class="ic">☰</span>المزيد</a>';
}
function setBadge(id, n) {
  document.querySelectorAll('[data-badge="' + id + '"]').forEach(el => { el.textContent = n; el.classList.toggle('hidden', !n); });
}

// ═══ التنقل ═══
window.addEventListener('hashchange', onRoute);
function onRoute() {
  if (!S.ready) return;
  const [p, q] = (location.hash.slice(1) || 'dashboard').split('?');
  S.page = canSee(PAGES[p]) ? p : 'dashboard';
  S.params = Object.fromEntries(new URLSearchParams(q || ''));
  const def = PAGES[S.page];
  if (!def) return; // لم تُحمّل الصفحات بعد
  let el = document.getElementById('pg-' + S.page);
  if (!el) {
    el = document.createElement('section');
    el.className = 'page'; el.id = 'pg-' + S.page;
    el.innerHTML = typeof def.html === 'function' ? def.html() : (def.html || '');
    document.getElementById('pages').appendChild(el);
    if (def.init) def.init(el);
  }
  document.querySelectorAll('.page').forEach(x => x.classList.toggle('on', x === el));
  document.querySelectorAll('[data-nav]').forEach(x => x.classList.toggle('on', x.dataset.nav === S.page));
  document.getElementById('pageTitle').textContent = def.t;
  document.title = def.t + ' — ' + (S.settings.company || 'المخزن');
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sideOverlay').classList.remove('open');
  if (def.enter) def.enter(S.params);
  if (def.render) def.render();
  window.scrollTo(0, 0);
}
function go(hash) { if (location.hash === '#' + hash) onRoute(); else location.hash = hash; }

// ═══ الأحداث العامة ═══
function logout() { confirmBox('تأكيد تسجيل الخروج؟', 'خروج').then(ok => ok && auth.signOut()); }

// ═══ خروج تلقائي عند عدم الاستخدام (من الإعدادات) ═══
let lastActive = Date.now();
['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => document.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true, capture: true }));
function idleCheck() {
  const m = num(S.settings && S.settings.idleMinutes);
  if (!m || !S.user || !S.ready) return;
  if (Date.now() - lastActive > m * 60e3) {
    lastActive = Date.now();
    auth.signOut().then(() => toast('تم تسجيل الخروج تلقائياً بسبب عدم الاستخدام (' + m + ' دقيقة)', 'info'));
  }
}
setInterval(idleCheck, 30e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) idleCheck(); });

// ═══ فحص ساعة الجهاز: التواريخ والإحصائيات اليومية تعتمد عليها ═══
async function checkClock() {
  if (checkClock.busy) return; checkClock.busy = true;
  try {
    const ref = col('users').doc(S.user.uid);
    const tS = Date.now(); await ref.update({ lastLoginAt: FV.serverTimestamp() }); const tA = Date.now();
    // ننتظر نسخة السيرفر المؤكدة (بدون كتابات معلقة) حتى نقرأ الوقت الذي سجله السيرفر فعلاً
    const srv = await new Promise(ok => {
      const to = setTimeout(() => { un(); ok(null); }, 20000);
      const un = ref.onSnapshot({ includeMetadataChanges: true }, s => { const v = s.get('lastLoginAt'); if (!s.metadata.hasPendingWrites && !s.metadata.fromCache && v) { clearTimeout(to); un(); ok(v); } }, () => { clearTimeout(to); ok(null); });
    });
    if (!srv) return;
    // وقت السيرفر يقع بين الإرسال والتأكيد ← الفرق الأكيد (بدون تأثير بطء الشبكة)
    const lo = tS - srv.toMillis(), hi = tA - srv.toMillis(), skew = lo > 0 ? lo : hi < 0 ? hi : 0;
    S.clockSkew = skew;
    document.getElementById('clockWarn')?.remove();
    if (Math.abs(skew) > 5 * 60e3) {
      const d = document.createElement('div'); d.id = 'clockWarn'; d.className = 'top-warn';
      const mins = Math.round(Math.abs(skew) / 60e3);
      d.innerHTML = '⚠️ <span>ساعة هذا الجهاز ' + (skew > 0 ? 'متقدمة' : 'متأخرة') + ' <b class="num">' + (mins >= 120 ? Math.round(mins / 60) + ' ساعة' : mins + ' دقيقة') + '</b> — فعّل "الوقت التلقائي" من إعدادات الجهاز حتى تكون تواريخ الفواتير والتقارير صحيحة.</span><button class="btn sm ghost" type="button">✕</button>';
      d.querySelector('button').onclick = () => d.remove();
      const pg = document.getElementById('pages'); pg.parentNode.insertBefore(d, pg);
    }
  } catch (e) {} finally { checkClock.busy = false; }
}

// ═══ تسجيل أخطاء البرنامج (حتى نعرف المشاكل اللي تصير عند الموظفين) ═══
const ERR_SEEN = new Set();
function reportError(msg, stack) {
  msg = String(msg || '').slice(0, 1500);
  if (!S.user || !msg || ERR_SEEN.size >= 8 || ERR_SEEN.has(msg) || /ResizeObserver|Script error\.?$|network|offline|unavailable/i.test(msg)) return;
  ERR_SEEN.add(msg);
  col('errors').add({ uid: S.user.uid, email: S.user.email || '', msg, stack: String(stack || '').slice(0, 3000), page: S.page || '', ua: navigator.userAgent.slice(0, 200), at: FV.serverTimestamp() }).catch(() => {});
}
window.addEventListener('error', e => reportError(e.message, e.error && e.error.stack ? e.error.stack : (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', e => { const r = e.reason || {}; if (r.code) return; reportError(r.message || r, r.stack); });
act({
  logout, theme: toggleTheme, 'my-password': myPasswordDialog,
  menu: () => { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sideOverlay').classList.toggle('open'); }
});
document.addEventListener('click', e => {
  if (e.target.matches('input[data-sel], input[data-sel-all]')) { if (window.onSelectBox) onSelectBox(e.target); e.stopPropagation(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
  if (el.closest('tr.clickable') && el.tagName === 'BUTTON') e.stopPropagation();
  fn(el, e);
}, true);
document.getElementById('sideOverlay').addEventListener('click', () => ACTIONS.menu());

function netBadge() {
  const b = document.getElementById('netStatus');
  b.className = 'badge ' + (navigator.onLine ? 'b-green' : 'b-yellow');
  b.textContent = navigator.onLine ? '● متصل' : '● بدون إنترنت (يحفظ محلياً)';
}
window.addEventListener('online', netBadge); window.addEventListener('offline', netBadge);
