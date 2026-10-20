// ═══════════════════════════════════════════════════════════
// المشتريات والموردين: فاتورة شراء تزيد الكمية وتحدّث متوسط التكلفة،
// رصيد المورد (الموجب = مستحق له علينا)، دفعات، كشف حساب
// ═══════════════════════════════════════════════════════════
const PUR = { list: [], last: null, done: false, loading: false };
let PD = null; // مسودة فاتورة الشراء المفتوحة
const loadDraft = () => { try { return JSON.parse(localStorage.getItem('purDraft') || 'null'); } catch (e) { return null; } };
const saveDraft = () => { try { localStorage.setItem('purDraft', JSON.stringify(PD)); } catch (e) {} };

page('purchases', {
  t: 'المشتريات', ic: '📥', admin: true, deps: ['suppliers'],
  html: () => `
    <div class="toolbar">${periodSelect('puPeriod', 'month')}<span class="spacer"></span>
      <button class="btn ghost" data-action="export-purchases">⬇ Excel</button>
      <button class="btn primary" data-action="new-purchase">＋ فاتورة شراء</button></div>
    <div class="stats sm" id="puSum"></div>
    <div class="card"><div class="table-wrap"><table class="t" id="puTable"></table></div>
      <div class="empty hidden" id="puMore"><button class="btn ghost" data-action="more-purchases">تحميل المزيد</button></div></div>`,
  init(el) { el.querySelector('#puPeriod').addEventListener('change', () => loadPurchases(true)); },
  render() { if (!PUR.list.length && !PUR.loading) loadPurchases(true); else drawPurchases(); }
});
async function loadPurchases(reset) {
  if (PUR.loading || !document.getElementById('puPeriod')) { PUR.list = []; return; }
  if (reset) { PUR.list = []; PUR.last = null; PUR.done = false; }
  if (PUR.done) return;
  PUR.loading = true;
  const [a, b] = periodRange(document.getElementById('puPeriod').value);
  try {
    let q = col('purchases').where('createdAt', '>=', a).where('createdAt', '<', new Date(b.getTime() + 864e5)).orderBy('createdAt', 'desc').limit(100);
    if (PUR.last) q = q.startAfter(PUR.last);
    const qs = await q.get();
    PUR.list = PUR.list.concat(qs.docs.map(d => Object.assign({ id: d.id }, d.data(snapOpt))));
    PUR.last = qs.docs[qs.docs.length - 1] || PUR.last; PUR.done = qs.size < 100;
  } catch (e) { toast(authErr(e), 'error'); }
  PUR.loading = false; drawPurchases();
}
function drawPurchases() {
  const t = document.getElementById('puTable'); if (!t) return;
  const valid = PUR.list.filter(p => !p.cancelled);
  const sum = f => valid.reduce((a, p) => a + num(f(p)), 0);
  document.getElementById('puSum').innerHTML = statCard('📥', 'blue', fmtN(valid.length), 'فاتورة شراء') + statCard('💰', 'purple', money(sum(p => p.total)), 'إجمالي المشتريات') +
    statCard('📒', 'red', money([...S.suppliers.values()].reduce((a, s) => a + Math.max(0, num(s.balance)), 0)), 'مستحق للموردين (الكل)');
  document.getElementById('puMore').classList.toggle('hidden', PUR.done);
  t.innerHTML = PUR.list.length ? '<thead><tr><th>الرقم</th><th>المورد</th><th class="hide-sm">التاريخ</th><th class="hide-sm">الأصناف</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>' +
    PUR.list.map(p => '<tr class="clickable" data-action="view-purchase" data-id="' + esc(p.id) + '"><td class="num"><b>' + esc(p.num) + '</b>' + (p.ref ? '<div class="small muted">' + esc(p.ref) + '</div>' : '') + '</td><td>' + esc(p.supplierName || '—') + '</td>' +
      '<td class="hide-sm small">' + fmtDate(p.createdAt) + '</td><td class="hide-sm">' + (p.items || []).length + '</td><td class="num"><b>' + money(p.total) + '</b>' + (num(p.due) > 0 ? '<div class="small red">باقي ' + money(p.due) + '</div>' : '') + '</td>' +
      '<td>' + (p.cancelled ? '<span class="badge b-red">ملغاة</span>' : num(p.due) > 0 ? '<span class="badge b-yellow">آجل</span>' : '<span class="badge b-green">مدفوعة</span>') + '</td></tr>').join('') + '</tbody>'
    : '<tr><td><div class="empty"><div class="ico">📥</div>لا توجد فواتير شراء في هذه الفترة</div></td></tr>';
}

// ═══ محرر فاتورة الشراء ═══
function newPurchase(fresh) {
  const d = loadDraft();
  PD = (!fresh && d && d.lines && d.lines.length) ? d : { supplierId: '', ref: '', note: '', lines: [], paid: null };
  const m = modal('mPur', '📥 فاتورة شراء جديدة',
    (d && d.lines && d.lines.length && !fresh ? '<div class="info-box mb">استُعيدت مسودة غير محفوظة. <button class="linkbtn" data-action="pur-discard">ابدأ من جديد</button></div>' : '') +
    '<div class="grid3">' +
    '<div class="field"><label class="f">المورد</label><div class="row" style="flex-wrap:nowrap"><div class="grow" style="position:relative"><input id="pdSup" placeholder="اختر أو اكتب اسم مورد جديد"></div><button class="btn sm ghost" type="button" data-action="new-supplier-inline">＋</button></div></div>' +
    '<div class="field"><label class="f">رقم فاتورة المورد (اختياري)</label><input id="pdRef"></div>' +
    '<div class="field"><label class="f">ملاحظة</label><input id="pdNote"></div>' +
    '<div class="field"><label class="f">عملة أسعار الشراء</label><select id="pdCur"><option value="IQD">دينار عراقي</option><option value="USD">دولار $</option></select></div>' +
    '<div class="field" id="pdRateF"><label class="f">سعر الصرف (دينار لكل دولار)</label><input id="pdRate" type="number" class="num"></div>' +
    '<div class="field"><label class="f">طريقة الدفع للمورد</label><select id="pdPay"><option value="نقداً">نقداً من الصندوق</option><option value="تحويل">تحويل</option></select></div></div>' +
    '<div class="field"><label class="f">أضف صنفاً</label><div class="row" style="flex-wrap:nowrap"><div class="grow" style="position:relative"><input id="pdAdd" placeholder="ابحث بالاسم أو رقم القطعة أو امسح الباركود…"></div>' +
    '<button class="btn ghost" type="button" data-action="pur-scan">📷</button></div></div>' +
    '<div class="table-wrap"><table class="t pd-lines" id="pdLines"></table></div>' +
    '<div class="pd-tot"><div class="row"><span>الإجمالي</span><span class="spacer"></span><b class="num" id="pdTotal">0</b></div>' +
    '<div class="row"><span>المدفوع للمورد الآن</span><span class="spacer"></span><input id="pdPaid" type="number" class="mini num" min="0"></div>' +
    '<div class="row small" id="pdDue"></div></div>' +
    '<p class="small muted">✔ الكميات تُضاف للمخزون، وسعر الشراء يُحدَّث بالمتوسط المرجّح تلقائياً، ورصيد المورد يُحدَّث بالمتبقي.</p>',
    '<button class="btn primary" data-action="save-purchase">💾 حفظ الفاتورة</button><button class="btn ghost" data-close="mPur">إغلاق (تبقى كمسودة)</button>', 'xl', { static: true });
  const sup = m.querySelector('#pdSup');
  const s0 = S.suppliers.get(PD.supplierId); if (s0) sup.value = s0.name;
  m.querySelector('#pdRef').value = PD.ref || ''; m.querySelector('#pdNote').value = PD.note || '';
  PD.currency = PD.currency || 'IQD'; PD.rate = PD.rate || num(S.settings.exrate, 1300); PD.payMethod = PD.payMethod || 'نقداً';
  m.querySelector('#pdCur').value = PD.currency; m.querySelector('#pdRate').value = PD.rate; m.querySelector('#pdPay').value = PD.payMethod;
  m.querySelector('#pdRateF').classList.toggle('hidden', PD.currency !== 'USD');
  m.querySelector('#pdCur').addEventListener('change', e => {
    const r = num(PD.rate, 1300), toUsd = e.target.value === 'USD' && PD.currency !== 'USD', toIqd = e.target.value === 'IQD' && PD.currency === 'USD';
    PD.lines.forEach(l => { if (toUsd) l.cost = Math.round(num(l.cost) / r * 100) / 100; if (toIqd) l.cost = Math.round(num(l.cost) * r); });
    PD.currency = e.target.value; m.querySelector('#pdRateF').classList.toggle('hidden', PD.currency !== 'USD'); saveDraft(); pdDraw(); });
  m.querySelector('#pdRate').addEventListener('input', e => { PD.rate = num(e.target.value, 1300); saveDraft(); pdTotals(); });
  m.querySelector('#pdPay').addEventListener('change', e => { PD.payMethod = e.target.value; saveDraft(); });
  picker(sup, {
    source: q => [...S.suppliers.values()].filter(s => matchScore(s.name + ' ' + (s.phone || ''), q)).slice(0, 10), showEmpty: true,
    render: s => s._new ? pkNew(s, 'مورد') : '<b>' + esc(s.name) + '</b>' + (num(s.balance) ? ' <span class="small muted num">رصيد ' + money(s.balance) + '</span>' : ''),
    extra: q => q && ![...S.suppliers.values()].some(s => normAr(s.name) === normAr(q)) ? { _new: true, name: q } : null,
    onPick: async (s, inp) => {
      if (s._new) { const id = await createSupplier({ name: s.name }); if (id) { PD.supplierId = id; inp.value = s.name; saveDraft(); } return; }
      PD.supplierId = s.id; inp.value = s.name; saveDraft();
    }
  });
  const add = m.querySelector('#pdAdd');
  picker(add, {
    source: q => searchProducts(q, null, 12), render: pkProduct,
    extra: q => q ? { _new: true, name: q } : null,
    exactFirst: true,
    onEnter: (q, inp, check) => { const pk = findPack(q); if (pk) { pdAddLine(pk.p); const l = PD.lines.find(x => x.id === pk.p.id); l.qty += pk.qty - 1; saveDraft(); pdDraw(); inp.value = ''; return true; } const p = findByCode(q); if (p) { pdAddLine(p); inp.value = ''; return true; } return false; },
    onPick: (p, inp) => { inp.value = ''; if (p._new) quickProductForPurchase(p.name); else pdAddLine(p); }
  });
  m.querySelector('#pdLines').addEventListener('input', e => {
    const i = e.target.dataset.li, k = e.target.dataset.k; if (i == null) return;
    PD.lines[i][k] = num(e.target.value); saveDraft(); pdTotals();
  });
  ['pdRef', 'pdNote'].forEach(id => m.querySelector('#' + id).addEventListener('input', e => { PD[id === 'pdRef' ? 'ref' : 'note'] = e.target.value; saveDraft(); }));
  m.querySelector('#pdPaid').addEventListener('input', e => { PD.paid = e.target.value === '' ? null : num(e.target.value); saveDraft(); pdTotals(); });
  pdDraw(); openModal('mPur');
  setTimeout(() => (PD.supplierId ? add : sup).focus(), 100);
}
function pdAddLine(p) {
  const ex = PD.lines.find(l => l.id === p.id);
  if (ex) ex.qty += 1;
  else PD.lines.push({ id: p.id, name: p.name, qty: 1, price: num(p.price), oldPrice: num(p.price),
    cost: PD.currency === 'USD' ? (num(p.costUsd) || Math.round(num(p.cost) / num(PD.rate, 1300) * 100) / 100) : num(p.cost) });
  saveDraft(); pdDraw();
  setTimeout(() => { const ins = document.querySelectorAll('#pdLines input[data-k=qty]'); const i = PD.lines.findIndex(l => l.id === p.id); if (ins[i]) { ins[i].focus(); ins[i].select(); } }, 30);
}
function pdDraw() {
  const t = document.getElementById('pdLines'); if (!t) return;
  const usd = PD.currency === 'USD';
  t.innerHTML = PD.lines.length ? '<thead><tr><th>الصنف</th><th>المتوفر</th><th>الكمية</th><th>سعر الشراء للوحدة' + (usd ? ' ($)' : '') + '</th><th>سعر البيع (د.ع)</th><th>المجموع</th><th></th></tr></thead><tbody>' +
    PD.lines.map((l, i) => { const p = S.products.get(l.id) || {};
      return '<tr><td class="small"><b>' + esc(l.name) + '</b><div class="muted">التكلفة الحالية ' + money(p.cost) + '</div></td><td class="num">' + fmtN(p.qty) + '</td>' +
        '<td><input type="number" step="any" min="0" class="mini num" data-li="' + i + '" data-k="qty" value="' + l.qty + '"></td>' +
        '<td><input type="number" step="any" min="0" class="mini num" data-li="' + i + '" data-k="cost" value="' + l.cost + '"></td>' +
        '<td><input type="number" step="any" min="0" class="mini num" data-li="' + i + '" data-k="price" value="' + l.price + '"></td>' +
        '<td class="num" data-lt="' + i + '">' + money(l.qty * l.cost) + '</td><td><button class="btn sm ghost" type="button" data-action="pur-rm" data-i="' + i + '">✕</button></td></tr>'; }).join('') + '</tbody>'
    : '<tr><td><div class="empty small">أضف أصناف الفاتورة من مربع البحث أعلاه</div></td></tr>';
  pdTotals();
}
// تكلفة الوحدة بالدينار (إذا الفاتورة بالدولار تُضرب بسعر الصرف)
const pdIqd = c => PD.currency === 'USD' ? Math.round(num(c) * num(PD.rate, 1300)) : num(c);
function pdTotals() {
  const total = PD.lines.reduce((a, l) => a + num(l.qty) * pdIqd(l.cost), 0);
  PD.lines.forEach((l, i) => { const c = document.querySelector('[data-lt="' + i + '"]'); if (c) c.textContent = money(num(l.qty) * pdIqd(l.cost)) + (PD.currency === 'USD' ? ' ($' + fmtN(num(l.qty) * num(l.cost)) + ')' : ''); });
  const paid = PD.paid == null ? total : Math.min(total, PD.paid);
  const pe = document.getElementById('pdPaid'); if (pe && document.activeElement !== pe) pe.value = paid;
  document.getElementById('pdTotal').textContent = money(total);
  document.getElementById('pdDue').innerHTML = total - paid > 0 ? 'يُضاف لرصيد المورد (دين علينا): <b class="num red">' + money(total - paid) + '</b>' : '<span class="green">مدفوعة بالكامل</span>';
}
async function quickProductForPurchase(name) {
  const cats = [...new Set(activeProducts().map(p => p.category).filter(Boolean))];
  const r = await promptBox('＋ منتج جديد', [
    { name: 'name', label: 'الاسم', required: true, value: name },
    { name: 'category', label: 'القسم', type: 'select', value: cats[0] || 'أخرى', options: (cats.length ? cats : ['أخرى']).map(c => [c, c]) },
    { name: 'brand', label: 'الماركة', value: '' },
    { name: 'barcode', label: 'الباركود (اتركه فارغاً للتوليد)', value: '' },
    { name: 'price', label: 'سعر البيع', type: 'number', value: '' }
  ], 'إضافة');
  if (!r || !r.name.trim()) return;
  const dups = findDuplicates({ name: r.name, barcode: r.barcode, brand: r.brand }).filter(d => d.level !== 'similar');
  if (dups.length) {
    const c = await choiceBox('⚠️ المنتج مسجل مسبقاً', '<p class="mb">لا تُنشئ نسخة ثانية — أضف الكمية للمنتج الموجود:</p>' + dupListHtml(dups, false),
      dups[0].level === 'block' ? [{ label: 'استخدام الموجود', value: 'use', cls: 'primary' }] : [{ label: 'استخدام الموجود', value: 'use', cls: 'primary' }, { label: 'إنشاء منتج منفصل رغم ذلك', value: 'new', cls: 'danger' }]);
    if (c === 'use') return pdAddLine(dups[0].p);
    if (c !== 'new') return;
  }
  const ref = col('products').doc(), w = W();
  const data = { name: r.name.trim(), category: r.category, brand: r.brand.trim(), barcode: r.barcode.trim() || newBarcode(), unit: 'قطعة', qty: 0, minQty: num(S.settings.minstock, 5),
    cost: 0, price: num(r.price), location: '', desc: '', warehouseId: (S.warehouses[0] || {}).id || '', showInStore: true, deleted: false, createdAt: TS(), updatedAt: TS(), updatedBy: S.user.email };
  w.set(ref, data); w.log('create', 'product', ref.id, data.name, { source: 'purchase' });
  try { await w.commit(); pdAddLine(Object.assign({ id: ref.id }, data)); } catch (e) { toast(authErr(e), 'error'); }
}
async function savePurchase() {
  const lines = PD.lines.filter(l => num(l.qty) > 0);
  if (!lines.length) return toast('أضف أصنافاً بكميات', 'error');
  const sup = S.suppliers.get(PD.supplierId);
  const total = lines.reduce((a, l) => a + num(l.qty) * pdIqd(l.cost), 0);
  const paid = PD.paid == null ? total : Math.min(total, Math.max(0, PD.paid));
  const due = total - paid;
  if (due > 0 && !sup) return toast('الشراء الآجل يحتاج اختيار مورد', 'error');
  if (lines.some(l => !(num(l.cost) > 0)) && !await confirmBox('بعض الأصناف بسعر شراء صفر. متابعة؟', 'متابعة')) return;
  const btn = document.querySelector('[data-action=save-purchase]'); btn.disabled = true;
  try {
    const ref = col('purchases').doc(), w = W();
    const doc = { num: await nextNum('purchases', 'PUR'), supplierId: sup ? sup.id : '', supplierName: sup ? sup.name : '', ref: PD.ref || '', note: PD.note || '',
      items: lines.map(l => ({ id: l.id, name: l.name, qty: num(l.qty), cost: pdIqd(l.cost), price: num(l.price), ...(PD.currency === 'USD' ? { costUsd: num(l.cost) } : {}) })), total, paid, due,
      currency: PD.currency || 'IQD', rate: PD.currency === 'USD' ? num(PD.rate, 1300) : null, payMethod: PD.payMethod || 'نقداً', poId: PD.poId || '',
      createdAt: TS(), by: S.user.email, cancelled: false };
    w.set(ref, doc);
    lines.forEach(l => {
      const p = S.products.get(l.id); if (!p) return;
      const oldQ = Math.max(0, w.curQty(p)), oldC = num(p.cost), q = num(l.qty), c = pdIqd(l.cost);
      // متوسط مرجّح — وإذا التكلفة القديمة غير معروفة (صفر) نأخذ الجديدة مباشرة بدل خلطها بالصفر
      const avg = (oldC > 0 && oldQ > 0) ? Math.round(((oldQ * oldC) + q * c) / (oldQ + q)) : c;
      const extra = { cost: c > 0 ? avg : oldC };
      if (num(l.price) > 0 && num(l.price) !== num(p.price)) extra.price = num(l.price);
      if (PD.currency === 'USD' && num(l.cost) > 0) extra.costUsd = num(l.cost); // يُستخدم لتحديث الأسعار عند تغيّر سعر الصرف
      stockMove(w, p, q, 'purchase', { ref: ref.id, refNum: doc.num, cost: c, extra, note: sup ? sup.name : '' });
    });
    if (sup && due) w.update(col('suppliers').doc(sup.id), { balance: FV.increment(due), lastPurchaseAt: TS() });
    bumpDay(w, { purchases: total, paidSuppliers: paid, purCash: (PD.payMethod || 'نقداً') === 'نقداً' ? paid : 0 });
    if (PD.poId) w.update(col('porders').doc(PD.poId), { status: 'received', purchaseId: ref.id, purchaseNum: doc.num, receivedAt: TS() });
    w.log('purchase', 'purchase', ref.id, doc.num, { total, due: due || null, supplier: doc.supplierName });
    await w.commit();
    localStorage.removeItem('purDraft'); PD = null;
    closeModal('mPur'); toast('تم حفظ فاتورة الشراء ✔ ' + doc.num);
    loadPurchases(true);
  } catch (e) { toast(authErr(e), 'error'); }
  btn.disabled = false;
}

let curPur = null;
async function openPurchaseById(id) {
  const l = PUR.list.find(x => x.id === id);
  if (l) return showPurchase(l);
  try { const s = await col('purchases').doc(id).get(); if (s.exists) showPurchase(Object.assign({ id: s.id }, s.data(snapOpt))); } catch (e) { toast(authErr(e), 'error'); }
}
function purchaseHTML(p) {
  return '<div class="invoice">' + shopHeader() + '<div style="text-align:left"><h2>فاتورة شراء</h2><div class="num">' + esc(p.num) + '</div><div>' + fmtDate(p.createdAt) + '</div></div></div>' +
    '<div>المورد: <b>' + esc(p.supplierName || '—') + '</b>' + (p.ref ? ' — رقم فاتورته: ' + esc(p.ref) : '') + '</div>' + (p.cancelled ? '<h3 style="color:#c00">⛔ ملغاة</h3>' : '') +
    '<table class="doc-t"><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>سعر الشراء</th><th>المجموع</th></tr></thead><tbody>' +
    (p.items || []).map((it, k) => '<tr><td>' + (k + 1) + '</td><td>' + esc(it.name) + '</td><td class="num">' + fmtN(it.qty) + '</td><td class="num">' + money(it.cost) + '</td><td class="num">' + money(it.qty * it.cost) + '</td></tr>').join('') +
    '</tbody></table><div class="doc-tot"><div class="tl"><span>الإجمالي</span><b class="num">' + money(p.total) + '</b></div><div class="tl"><span>المدفوع</span><span class="num">' + money(p.paid) + '</span></div>' +
    (num(p.due) ? '<div class="tl"><span>المتبقي</span><b class="num">' + money(p.due) + '</b></div>' : '') + '</div>' + (p.note ? '<p>' + esc(p.note) + '</p>' : '') + '</div>';
}
function showPurchase(p) {
  curPur = p;
  modal('mPurView', '📥 ' + p.num, '<div class="inv-preview">' + purchaseHTML(p) + '</div><div class="small muted mt">سجّلها: ' + esc(p.by || '') + '</div>',
    '<button class="btn primary" data-action="print-purchase">🖨 طباعة</button>' + (isAdmin() && !p.cancelled ? '<span class="spacer"></span><button class="btn danger" data-action="cancel-purchase">إلغاء الفاتورة</button>' : ''), 'lg');
  openModal('mPurView');
}
async function cancelPurchase() {
  const p = curPur;
  if (!await confirmBox('إلغاء فاتورة الشراء ' + p.num + '؟\n• تُخصم كمياتها من المخزون\n• يُخصم ' + money(p.due) + ' من رصيد المورد\n(سعر الشراء المتوسط لا يتغير)', 'إلغاء', true)) return;
  const w = W();
  w.update(col('purchases').doc(p.id), { cancelled: true, cancelledAt: TS(), cancelledBy: S.user.email });
  (p.items || []).forEach(it => { const pr = S.products.get(it.id); if (pr) stockMove(w, pr, -num(it.qty), 'purchase-cancel', { ref: p.id, refNum: p.num, cost: it.cost }); });
  if (p.supplierId && num(p.due)) w.update(col('suppliers').doc(p.supplierId), { balance: FV.increment(-num(p.due)) });
  bumpDay(w, { purchases: -num(p.total), paidSuppliers: -num(p.paid), purCash: (p.payMethod || 'نقداً') === 'نقداً' ? -num(p.paid) : 0 });
  w.log('cancel', 'purchase', p.id, p.num, null);
  try { await w.commit(); toast('أُلغيت فاتورة الشراء'); closeModal('mPurView'); loadPurchases(true); } catch (e) { toast(authErr(e), 'error'); }
}

// ═══ الموردين ═══
page('suppliers', {
  t: 'الموردين', ic: '🚚', admin: true, deps: ['suppliers'],
  html: () => `<div class="toolbar"><div class="search grow"><span>🔍</span><input id="suSearch" placeholder="اسم المورد أو هاتفه"></div>
    <button class="btn primary" data-action="new-supplier">＋ مورد</button></div>
    <div class="card"><div class="table-wrap"><table class="t" id="suTable"></table></div></div>`,
  init(el) { el.querySelector('#suSearch').addEventListener('input', debounce(renderSuppliers, 150)); },
  render: () => renderSuppliers()
});
function renderSuppliers() {
  const t = document.getElementById('suTable'); if (!t) return;
  const q = document.getElementById('suSearch').value.trim();
  const list = [...S.suppliers.values()].filter(s => !q || matchScore(s.name + ' ' + (s.phone || ''), q)).sort((a, b) => num(b.balance) - num(a.balance));
  t.innerHTML = list.length ? '<thead><tr><th>المورد</th><th class="hide-sm">الهاتف</th><th>المستحق له</th><th class="hide-sm">آخر شراء</th><th></th></tr></thead><tbody>' +
    list.map(s => '<tr class="clickable" data-action="view-supplier" data-id="' + esc(s.id) + '"><td><b>' + esc(s.name) + '</b></td><td class="hide-sm num">' + esc(s.phone || '—') + '</td>' +
      '<td class="num">' + (num(s.balance) > 0 ? '<b class="red">' + money(s.balance) + '</b>' : money(s.balance)) + '</td><td class="hide-sm small">' + (s.lastPurchaseAt ? fmtDate(s.lastPurchaseAt) : '—') + '</td>' +
      '<td>' + (num(s.balance) > 0 ? '<button class="btn sm green" data-action="pay-supplier" data-id="' + esc(s.id) + '">💸 دفع</button>' : '') + '</td></tr>').join('') + '</tbody>'
    : '<tr><td><div class="empty"><div class="ico">🚚</div>لا يوجد موردين — أضف مورداً أو اكتبه عند تسجيل فاتورة شراء</div></td></tr>';
}
async function createSupplier(data, opening) {
  const ref = col('suppliers').doc(), w = W();
  w.set(ref, Object.assign({ name: '', phone: '', note: '' }, data, { balance: num(opening), createdAt: TS() }));
  if (num(opening)) w.set(col('payments').doc(), { kind: 'supplier', partyId: ref.id, partyName: data.name, type: 'opening', amount: num(opening), note: 'رصيد سابق', at: TS(), by: S.user.email });
  w.log('create', 'supplier', ref.id, data.name, null);
  try { await w.commit(); toast('تمت إضافة المورد'); return ref.id; } catch (e) { toast(authErr(e), 'error'); return null; }
}
async function editSupplier(id) {
  const s = id ? S.suppliers.get(id) : null;
  const f = [{ name: 'name', label: 'الاسم', required: true, value: s ? s.name : '' }, { name: 'phone', label: 'الهاتف', type: 'tel', value: s ? s.phone : '' }, { name: 'note', label: 'ملاحظات', type: 'textarea', value: s ? s.note : '' }];
  if (!s) f.push({ name: 'opening', label: 'مستحق سابق له علينا (اختياري)', type: 'number', value: 0 });
  const r = await promptBox(s ? 'تعديل المورد' : '🚚 مورد جديد', f, s ? 'حفظ' : 'إضافة');
  if (!r || !r.name.trim()) return;
  const data = { name: r.name.trim(), phone: r.phone.trim(), note: r.note.trim() };
  if (!s) return createSupplier(data, num(r.opening));
  const w = W(); w.update(col('suppliers').doc(id), data); w.log('update', 'supplier', id, data.name, null);
  try { await w.commit(); toast('تم الحفظ'); } catch (e) { toast(authErr(e), 'error'); }
}
async function viewSupplier(id) {
  const s = S.suppliers.get(id); if (!s) return;
  const m = modal('mSupp', '🚚 ' + s.name,
    '<div class="party-head"><div class="muted small">' + esc(s.phone || '') + (s.note ? ' · ' + esc(s.note) : '') + '</div><div class="bal">' + (num(s.balance) > 0 ? '<b class="red">له علينا ' + money(s.balance) + '</b>' : money(s.balance)) + '</div></div>' +
    '<div class="row mb"><button class="btn green" data-action="pay-supplier" data-id="' + esc(id) + '">💸 تسجيل دفعة</button>' +
    '<button class="btn ghost" data-action="edit-supplier" data-id="' + esc(id) + '">✏️ تعديل</button><button class="btn ghost" data-action="adjust-balance" data-kind="supplier" data-id="' + esc(id) + '">⚖️ تسوية</button></div>' +
    '<div id="supStmt"><div class="empty"><div class="spinner"></div></div></div>', '', 'lg');
  openModal('mSupp');
  try { const rows = await partyStatement('supplier', id); m.querySelector('#supStmt').innerHTML = rows.length ? statementTable(rows, s.balance, false) + stmtMoreBtn(rows, 'supplier', id) : '<div class="empty small">لا توجد حركات</div>'; }
  catch (e) { m.querySelector('#supStmt').innerHTML = '<p class="muted">' + esc(authErr(e)) + '</p>'; }
}

act({
  'new-purchase': () => newPurchase(false),
  'pur-discard': () => { localStorage.removeItem('purDraft'); newPurchase(true); },
  'pur-rm': el => { PD.lines.splice(+el.dataset.i, 1); saveDraft(); pdDraw(); },
  'pur-scan': () => startScan(code => { const p = findByCode(code); if (p) pdAddLine(p); else quickProductForPurchase(''); }),
  'save-purchase': savePurchase,
  'more-purchases': () => loadPurchases(false),
  'view-purchase': el => openPurchaseById(el.dataset.id),
  'print-purchase': () => printHTML(purchaseHTML(curPur), 'a4'),
  'cancel-purchase': cancelPurchase,
  'new-supplier': () => editSupplier(null), 'edit-supplier': el => editSupplier(el.dataset.id),
  'new-supplier-inline': async () => { const r = await promptBox('🚚 مورد جديد', [{ name: 'name', label: 'الاسم', required: true }, { name: 'phone', label: 'الهاتف', type: 'tel' }], 'إضافة'); if (r && r.name.trim()) { const id = await createSupplier({ name: r.name.trim(), phone: r.phone.trim() }); if (id) { PD.supplierId = id; saveDraft(); document.getElementById('pdSup').value = r.name.trim(); } } },
  'view-supplier': el => viewSupplier(el.dataset.id),
  'pay-supplier': el => receivePayment('supplier', el.dataset.id),
  'export-purchases': () => {
    const rows = PUR.list.map(p => ({ 'الرقم': p.num, 'التاريخ': fmtDate(p.createdAt), 'المورد': p.supplierName || '', 'رقم فاتورة المورد': p.ref || '', 'الإجمالي': num(p.total), 'المدفوع': num(p.paid), 'المتبقي': num(p.due), 'الحالة': p.cancelled ? 'ملغاة' : 'مكتملة' }));
    const lines = []; PUR.list.filter(p => !p.cancelled).forEach(p => (p.items || []).forEach(it => lines.push({ 'الرقم': p.num, 'التاريخ': fmtDate(p.createdAt), 'المورد': p.supplierName || '', 'الصنف': it.name, 'الكمية': num(it.qty), 'سعر الشراء': num(it.cost), 'المجموع': num(it.qty) * num(it.cost) })));
    writeXlsx([['المشتريات', rows], ['الأصناف', lines], ['الموردين', [...S.suppliers.values()].map(s => ({ 'المورد': s.name, 'الهاتف': s.phone || '', 'المستحق له': num(s.balance) }))]], 'المشتريات-' + localDay() + '.xlsx');
  }
});
