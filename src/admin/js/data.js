// ═══════════════════════════════════════════════════════════
// طبقة البيانات: كاتب ذرّي، حركة المخزون، الإحصائيات اليومية،
// الكتالوج المضغوط للزبائن، الصور، التعديل الجماعي مع التراجع
// ═══════════════════════════════════════════════════════════

const TS = () => FV.serverTimestamp();
const ENC = new TextEncoder();
const bytesOf = s => ENC.encode(s).length;

// كاتب يجمع العمليات ويقسمها على دفعات (حد Firestore: 500 عملية و~10MB لكل دفعة)
class Writer {
  constructor() { this.ops = []; this.qty = {}; this.wh = {}; this.catalog = false; }
  set(ref, data, opt) { this.ops.push(['set', ref, data, opt]); return this; }
  update(ref, data) { this.ops.push(['update', ref, data]); return this; }
  delete(ref) { this.ops.push(['delete', ref]); return this; }
  log(action, entity, entityId, name, changes) {
    return this.set(col('logs').doc(), {
      at: TS(), uid: S.user.uid, email: S.user.email, action, entity,
      entityId: entityId || '', name: name || '', changes: changes || null
    });
  }
  // الكمية المتوقعة للمنتج داخل نفس العملية (لو تحرك أكثر من مرة)
  curQty(p) { return p.id in this.qty ? this.qty[p.id] : num(p.qty); }
  async commit(onProgress) {
    const chunks = [];
    let cur = [], size = 0;
    for (const op of this.ops) {
      const s = op[2] ? bytesOf(JSON.stringify(op[2])) : 50; // بالبايت: الحرف العربي = 2 بايت
      if (cur.length >= 450 || (size + s > 8e6 && cur.length)) { chunks.push(cur); cur = []; size = 0; }
      cur.push(op); size += s;
    }
    if (cur.length) chunks.push(cur);
    const offline = !navigator.onLine;
    const pids = [...new Set(this.ops.filter(o => o[1].parent.id === 'products').map(o => o[1].id))];
    const rollback = e => { this.refetch(pids); throw e; };
    let first = true;
    for (let i = 0; i < chunks.length; i++) {
      const b = db.batch();
      chunks[i].forEach(([t, ref, d, o]) => t === 'set' ? b.set(ref, d, o || {}) : t === 'update' ? b.update(ref, d) : b.delete(ref));
      const p = b.commit();
      if (first) { first = false; this.applyLocal(); }
      if (offline) p.catch(e => { toast(authErr(e), 'error'); this.refetch(pids); }); else await p.catch(rollback);
      if (onProgress) onProgress(i + 1, chunks.length);
    }
    if (offline) toast('حُفظ على الجهاز وسيُرفع تلقائياً عند رجوع الإنترنت', 'info');
    if (this.catalog) Catalog.schedule();
    return this;
  }
  // تحديث نسخة الذاكرة فوراً (المزامنة الجزئية لا ترى الكتابات المحلية قبل وصولها للسيرفر)
  applyLocal() {
    const now = firebase.firestore.Timestamp.now(); let n = 0;
    const isFV = v => v instanceof firebase.firestore.FieldValue;
    const fvName = v => (v._delegate && v._delegate._methodName) || '';
    for (const [t, ref, d, o] of this.ops) {
      if (ref.parent.id !== 'products') continue;
      const id = ref.id; n++;
      if (t === 'delete') { S.products.delete(id); continue; }
      const p = t === 'set' && !(o && o.merge) ? { id } : Object.assign({ id }, S.products.get(id));
      for (const [k, v] of Object.entries(d)) {
        if (k.includes('.')) { if (!isFV(v)) { const [a, b] = k.split('.'); p[a] = Object.assign({}, p[a], { [b]: v }); } continue; }
        if (!isFV(v)) p[k] = v;
        else if (fvName(v).includes('serverTimestamp')) p[k] = now;
        else if (fvName(v).includes('delete')) delete p[k];
      }
      if (id in this.qty) p.qty = this.qty[id];
      if (this.wh[id]) p.whQty = Object.assign({}, this.wh[id]);
      S.products.set(id, p);
    }
    if (n) dataChanged('products');
  }
  // عند فشل الحفظ: نرجع نسخة السيرفر للمنتجات المتأثرة
  refetch(ids) {
    ids.forEach(id => col('products').doc(id).get({ source: 'server' }).then(s => {
      if (s.exists) S.products.set(id, Object.assign({ id }, s.data(snapOpt))); else S.products.delete(id);
      dataChanged('products');
    }).catch(() => {}));
  }
}
const W = () => new Writer();

// ═══ حركة المخزون: كل تغيير بالكمية يمر من هنا ويُسجَّل ═══
const MOVE_TYPES = {
  sale: ['🛒 بيع', 'b-blue'], return: ['↩️ مرتجع من زبون', 'b-green'], cancel: ['⛔ إلغاء فاتورة', 'b-green'],
  purchase: ['📥 شراء', 'b-green'], 'purchase-cancel': ['⛔ إلغاء شراء', 'b-red'],
  in: ['➕ إدخال', 'b-green'], out: ['➖ إخراج', 'b-red'], count: ['📋 جرد', 'b-purple'],
  merge: ['🔗 دمج', 'b-gray'], import: ['📊 استيراد', 'b-gray'], init: ['🆕 رصيد أول', 'b-gray'], restore: ['♻️ استرجاع', 'b-gray'],
  transfer: ['🔀 نقل بين مخازن', 'b-blue']
};
// ═══ الكمية حسب المخزن ═══
// whQty غير موجود = كل الكمية في المخزن الأساسي (warehouseId). يُنشأ أول مرة تتحرك فيها القطعة في مخزن آخر.
function whQ(p, wh) { return p.whQty ? num(p.whQty[wh]) : (p.warehouseId === wh ? num(p.qty) : 0); }
function whList(p) {
  if (!p.whQty) return p.warehouseId ? [[p.warehouseId, num(p.qty)]] : [['', num(p.qty)]];
  return Object.entries(p.whQty).filter(([, v]) => num(v) !== 0);
}
// للخروج: المخزن الأساسي إن كان فيه كفاية، وإلا المخزن الذي فيه أكثر كمية
function pickWh(p, need, prefer) {
  if (prefer) return prefer;
  if (!p.whQty) return p.warehouseId || '';
  if (need <= 0) return p.warehouseId || Object.keys(p.whQty)[0] || '';
  if (whQ(p, p.warehouseId) >= need) return p.warehouseId;
  return Object.entries(p.whQty).sort((a, b) => num(b[1]) - num(a[1]))[0][0];
}
// delta: موجب = دخول، سالب = خروج. setTo: لتعيين الكمية مباشرة (الجرد). info.wh: المخزن المحدد
function stockMove(w, p, delta, type, info) {
  info = info || {};
  const before = w.curQty(p);
  let after;
  const upd = { updatedAt: TS(), updatedBy: S.user.email };
  if (info.setTo != null) { after = num(info.setTo); delta = after - before; upd.qty = after; }
  else { after = before + delta; upd.qty = FV.increment(delta); }
  if (!delta && info.setTo == null) return;
  const wh = pickWh(p, -delta, info.wh);
  // كمية المخازن: لا نلمسها ما دامت القطعة كلها في مخزنها الأساسي
  const whState = w.wh[p.id] || (p.whQty ? Object.assign({}, p.whQty) : null);
  if (whState || (wh && p.warehouseId && wh !== p.warehouseId)) {
    const m = whState || { [p.warehouseId || wh]: before };
    if (info.setTo != null && !p.whQty) { Object.keys(m).forEach(k => m[k] = 0); m[wh] = after; }
    else m[wh] = num(m[wh]) + delta;
    w.wh[p.id] = m;
    if (whState && p.whQty && info.setTo == null) upd['whQty.' + wh] = FV.increment(delta);
    else upd.whQty = Object.assign({}, m);
  }
  if (type === 'sale') upd.lastSoldAt = TS();
  if (info.extra) Object.assign(upd, info.extra);
  w.qty[p.id] = after;
  w.update(col('products').doc(p.id), upd);
  w.set(col('stockMoves').doc(), {
    pid: p.id, name: p.name || '', type, delta, before, after, wh: wh || p.warehouseId || '',
    ref: info.ref || '', refNum: info.refNum || '', note: info.note || '',
    cost: num(info.cost != null ? info.cost : p.cost),
    at: TS(), uid: S.user.uid, by: S.user.email
  });
  w.catalog = true;
}
// خروج كمية موزعة على المخازن: الأساسي أولاً ثم الأكثر كمية (لا نجعل مخزناً سالباً وغيره فيه بضاعة)
function stockOut(w, p, q, type, info) {
  if (!p.whQty) return stockMove(w, p, -q, type, info);
  const avail = Object.entries(w.wh[p.id] || p.whQty).map(([k, v]) => [k, num(v)]).filter(([, v]) => v > 0)
    .sort((a, b) => (b[0] === p.warehouseId) - (a[0] === p.warehouseId) || b[1] - a[1]);
  let left = q;
  for (const [wh, v] of avail) { if (left <= 0) break; const take = Math.min(v, left); stockMove(w, p, -take, type, Object.assign({}, info, { wh })); left -= take; }
  if (left > 0) stockMove(w, p, -left, type, Object.assign({}, info, { wh: p.warehouseId || (avail[0] || [])[0] }));
}
// نقل بين مخزنين: الكمية الكلية لا تتغير
function transferMove(w, p, from, to, q, note) {
  const m = w.wh[p.id] || (p.whQty ? Object.assign({}, p.whQty) : { [p.warehouseId || from]: num(p.qty) });
  m[from] = num(m[from]) - q; m[to] = num(m[to]) + q;
  w.wh[p.id] = m;
  w.update(col('products').doc(p.id), { whQty: Object.assign({}, m), updatedAt: TS(), updatedBy: S.user.email });
  const base = { pid: p.id, name: p.name || '', type: 'transfer', before: num(p.qty), after: num(p.qty), ref: '', refNum: '', note: note || '', cost: num(p.cost), uid: S.user.uid, by: S.user.email };
  w.set(col('stockMoves').doc(), Object.assign({}, base, { delta: -q, wh: from, at: TS(), note: (note ? note + ' — ' : '') + 'إلى ' + whName(to) }));
  w.set(col('stockMoves').doc(), Object.assign({}, base, { delta: q, wh: to, at: TS(), note: (note ? note + ' — ' : '') + 'من ' + whName(from) }));
}

// ═══ الإحصائيات اليومية: وثيقة لكل يوم تُزاد بالـ increment (آمنة مع عدة أجهزة) ═══
// الحقول: sales, discount, returns, profit, count, cash, credit, collected, purchases, paidSuppliers + qty/val لكل منتج
function bumpDay(w, fields, day) {
  day = day || localDay();
  const d = { date: day };
  for (const k in fields) {
    const v = fields[k];
    if (v && typeof v === 'object') { d[k] = {}; for (const kk in v) if (v[kk]) d[k][kk] = FV.increment(v[kk]); }
    else if (v) d[k] = FV.increment(v);
  }
  w.set(col('stats').doc('d_' + day), d, { merge: true });
}

// ═══ الكتالوج المضغوط للزبائن ═══
// بدل 1154 قراءة لكل زائر: 2-3 وثائق فقط (catalogPacks). يُبنى تلقائياً بعد أي تغيير.
const Catalog = {
  timer: null, running: false,
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.sync(), 3000); },
  item(p) {
    const s = S.settings;
    if (p.deleted || p.showInStore === false) return null;
    if (!s.showOutOfStock && num(p.qty) <= 0) return null;
    const o = { i: p.id, n: p.name || '', c: p.category || '', s: num(p.qty) > 0 ? 1 : 0 };
    if (p.brand) o.b = p.brand;
    if (p.unit) o.u = p.unit;
    if (p.desc) o.d = p.desc;
    if (s.showPrices && num(p.price) > 0) o.p = num(p.price);
    if (imgSrc(p)) o.t = imgSrc(p);
    if (p.hasImage || p.imageUrl) o.h = 1;
    if (p.imageUrl) o.f = p.imageUrl;
    return o;
  },
  async sync(force) {
    // ننتظر حتى تكتمل نسخة المنتجات من السيرفر حتى لا ننشر كتالوجاً ناقصاً
    if (!S.productsFromServer || this.running) return;
    this.running = true;
    try {
      const items = activeProducts().map(p => this.item(p)).filter(Boolean)
        .sort((a, b) => (b.s - a.s) || (a.n < b.n ? -1 : 1));
      const json = JSON.stringify(items);
      const hash = String(json.length) + ':' + strHash(json);
      if (!force && S.packMeta && S.packMeta.hash === hash) return;
      const packs = [];
      let cur = [], size = 0;
      for (const it of items) {
        const s = JSON.stringify(it).length + 1;
        if (size + s > 700000 && cur.length) { packs.push(cur); cur = []; size = 0; }
        cur.push(it); size += s;
      }
      packs.push(cur);
      const w = W();
      packs.forEach((p, i) => w.set(col('catalogPacks').doc('p' + i), { items: p }));
      const oldN = (S.packMeta && S.packMeta.n) || 0;
      for (let i = packs.length; i < oldN; i++) w.delete(col('catalogPacks').doc('p' + i));
      const meta = { n: packs.length, hash, count: items.length, updatedAt: TS() };
      w.set(col('catalogPacks').doc('meta'), meta);
      w.catalog = false;
      await w.commit();
      S.packMeta = Object.assign({}, meta);
    } catch (e) { console.warn('catalog sync', e); }
    finally { this.running = false; }
  }
};
function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

// ═══ الصور ═══
// حالياً: صورة كاملة مضغوطة في images/{id} + مصغّرة داخل المنتج.
// عند تفعيل Firebase Storage (خطة Blaze) تُرفع للتخزين وتُحفظ روابطها فقط.
const Images = {
  storageOn() { return !!(S.settings.storage && firebase.storage); },
  async put(w, pid, fullDataUrl) {
    if (!fullDataUrl) {
      w.delete(col('images').doc(pid));
      return { thumb: '', thumbUrl: '', imageUrl: '', hasImage: false };
    }
    const thumb = await compressImage(fullDataUrl, 160, 0.62);
    if (this.storageOn()) {
      const ref = firebase.storage().ref('products/' + pid);
      const blob = d => fetch(d).then(r => r.blob());
      const v = Date.now();
      await ref.child('full_' + v + '.jpg').put(await blob(fullDataUrl), { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000' });
      await ref.child('thumb_' + v + '.jpg').put(await blob(thumb), { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000' });
      w.delete(col('images').doc(pid)); // النسخة القديمة داخل قاعدة البيانات لم تعد لازمة
      return {
        imageUrl: await ref.child('full_' + v + '.jpg').getDownloadURL(),
        thumbUrl: await ref.child('thumb_' + v + '.jpg').getDownloadURL(),
        thumb: '', hasImage: true
      };
    }
    w.set(col('images').doc(pid), { data: fullDataUrl, updatedAt: TS() });
    return { thumb, thumbUrl: '', imageUrl: '', hasImage: true };
  },
  async full(p) {
    if (p.imageUrl) return p.imageUrl;
    if (!p.hasImage) return imgSrc(p);
    try { const s = await col('images').doc(p.id).get(); return s.exists ? s.data().data : imgSrc(p); } catch (e) { return imgSrc(p); }
  }
};

// ═══ مقارنة التعديلات للسجل ═══
const PRODUCT_FIELDS = ['name', 'barcode', 'category', 'brand', 'unit', 'qty', 'minQty', 'cost', 'price', 'location', 'warehouseId', 'desc', 'showInStore', 'deleted'];
function diff(before, after) {
  const out = {};
  PRODUCT_FIELDS.forEach(k => {
    const a = before ? before[k] : undefined, b = after[k];
    if (b !== undefined && typeof b !== 'object' && String(a == null ? '' : a) !== String(b == null ? '' : b)) out[k] = [a == null ? null : a, b];
  });
  return Object.keys(out).length ? out : null;
}

// ═══ تعديل جماعي مع إمكانية التراجع ═══
// changes: [{ id, set: { field: value } }] — لا تشمل الكمية (الكمية تمر من stockMove)
async function bulkApply(desc, changes, onProgress) {
  const before = {}, real = [];
  changes.forEach(c => {
    const p = S.products.get(c.id); if (!p) return;
    const set = {}, old = {};
    Object.keys(c.set).forEach(k => { if (String(p[k] == null ? '' : p[k]) !== String(c.set[k] == null ? '' : c.set[k])) { set[k] = c.set[k]; old[k] = p[k] == null ? null : p[k]; } });
    if (Object.keys(set).length) { real.push({ id: c.id, set }); before[c.id] = old; }
  });
  if (!real.length) return { count: 0 };
  const opRef = col('bulkOps').doc();
  const w = W();
  real.forEach(c => w.update(col('products').doc(c.id), Object.assign({}, c.set, { updatedAt: TS(), updatedBy: S.user.email })));
  // سجل التراجع: القيم القديمة (قد يُقسم إن كان كبيراً جداً)
  // حد الوثيقة 1MB بالبايت (العربي ضعف حجمه بالأحرف) — إذا كبر نحفظ بدون التراجع بدل فشل العملية كلها
  const fits = bytesOf(JSON.stringify(before)) < 800000;
  w.set(opRef, { desc, at: TS(), by: S.user.email, count: real.length, before: fits ? before : null, undone: false });
  w.log('bulk', 'product', opRef.id, desc, { count: real.length });
  w.catalog = true;
  await w.commit(onProgress);
  return { count: real.length, opId: fits ? opRef.id : null };
}
async function bulkUndo(opId) {
  const s = await col('bulkOps').doc(opId).get();
  if (!s.exists) throw new Error('العملية غير موجودة');
  const d = s.data();
  if (d.undone) throw new Error('تم التراجع عنها مسبقاً');
  if (!d.before) throw new Error('هذه العملية كبيرة جداً ولا يمكن التراجع عنها تلقائياً');
  const w = W();
  Object.keys(d.before).forEach(id => { if (S.products.has(id)) w.update(col('products').doc(id), Object.assign({}, d.before[id], { updatedAt: TS(), updatedBy: S.user.email })); });
  w.update(col('bulkOps').doc(opId), { undone: true, undoneAt: TS(), undoneBy: S.user.email });
  w.log('undo', 'product', opId, 'تراجع: ' + d.desc, { count: Object.keys(d.before).length });
  w.catalog = true;
  await w.commit();
  return Object.keys(d.before).length;
}
function undoToast(res, desc) {
  if (!res.count) return toast('لا يوجد شيء تغيّر', 'info');
  const t = document.createElement('div');
  t.className = 'undo-bar';
  t.innerHTML = '<span>✅ ' + esc(desc) + ' — ' + fmtN(res.count) + ' منتج</span>' + (res.opId ? '<button class="btn sm">↶ تراجع</button>' : '') + '<button class="x" aria-label="إغلاق">✕</button>';
  document.body.appendChild(t);
  const close = () => t.remove();
  t.querySelector('.x').onclick = close;
  const b = t.querySelector('.btn');
  if (b) b.onclick = async () => { b.disabled = true; try { const n = await bulkUndo(res.opId); toast('تم التراجع عن ' + fmtN(n) + ' منتج'); } catch (e) { toast(e.message || authErr(e), 'error'); } close(); };
  setTimeout(close, 20000);
}

// ═══ أرقام متسلسلة (INV-00001…) — عند الاتصال من عدّاد على السيرفر بمعاملة ذرّية،
// وبدون إنترنت رقم مؤقت بالتاريخ والوقت (لا يتكرر) ═══
async function nextNum(kind, prefix) {
  if (!navigator.onLine) return docNum(prefix);
  try {
    const ref = col('counters').doc(kind);
    const n = await Promise.race([
      db.runTransaction(async tx => { const s = await tx.get(ref); const v = (s.exists ? num(s.data().next) : 0) + 1; tx.set(ref, { next: v, at: TS() }); return v; }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))
    ]);
    return prefix + '-' + String(n).padStart(5, '0');
  } catch (e) { S.numErr = (e.code || '') + ' ' + e.message; return docNum(prefix); }
}
// تحقق من الكميات على السيرفر قبل البيع (يمنع بيع آخر قطعة من جهازين بنفس اللحظة)
async function serverShortages(items) {
  if (!navigator.onLine) return [];
  const need = {};
  items.forEach(it => need[it.id] = (need[it.id] || 0) + num(it.qty));
  const out = [];
  await Promise.all(Object.keys(need).map(async id => {
    try { const s = await col('products').doc(id).get({ source: 'server' }); const q = num((s.data() || {}).qty); if (need[id] > q) out.push({ id, name: (s.data() || {}).name, have: q, need: need[id] }); } catch (e) {}
  }));
  return out;
}

// ═══ باركود EAN-13 صالح (بادئة 200 = استخدام داخلي) ═══
function ean13(base12) {
  const d = String(base12).padStart(12, '0').slice(0, 12);
  let s = 0;
  for (let i = 0; i < 12; i++) s += (+d[i]) * (i % 2 ? 3 : 1);
  return d + ((10 - s % 10) % 10);
}
function newBarcode(taken) {
  taken = taken || new Set(activeProducts().map(p => p.barcode));
  for (let k = 0; k < 50; k++) {
    const code = ean13('200' + String(Date.now() + k).slice(-6) + String(Math.floor(Math.random() * 1000)).padStart(3, '0'));
    if (!taken.has(code)) { taken.add(code); return code; }
  }
  return ean13('200' + String(Math.random()).slice(2, 11));
}
