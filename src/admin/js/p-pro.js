// ═══════════════════════════════════════════════════════════
// ميزات احترافية: نقل بين المخازن، المصاريف، إغلاق الصندوق، أوامر الشراء
// ═══════════════════════════════════════════════════════════

// ═══ نقل بين المخازن ═══
page('transfers', {
  t: 'نقل بين المخازن', short: 'نقل', ic: '🔀', deps: ['products', 'warehouses'],
  html: () => `<div class="card mb"><div class="card-h"><h3>🔀 نقل كمية من مخزن لآخر</h3></div><div class="card-b">
      <div class="field" style="position:relative"><label class="f">القطعة</label><input id="trProd" placeholder="ابحث أو امسح الباركود"></div>
      <div id="trInfo" class="small mb"></div>
      <div class="grid3">
        <div class="field"><label class="f">من مخزن</label><select id="trFrom"></select></div>
        <div class="field"><label class="f">إلى مخزن</label><select id="trTo"></select></div>
        <div class="field"><label class="f">الكمية</label><input id="trQty" type="number" min="0" step="any" class="num"></div>
      </div>
      <div class="field"><label class="f">ملاحظة</label><input id="trNote"></div>
      <button class="btn primary" data-action="do-transfer">🔀 نقل</button></div></div>
    <div class="card"><div class="card-h"><h3>آخر عمليات النقل</h3></div><div class="table-wrap"><table class="t" id="trList"></table></div></div>`,
  init(el) {
    picker(el.querySelector('#trProd'), { source: q => searchProducts(q, null, 10), render: pkProduct, exactFirst: true,
      onEnter: (q, inp) => { const p = findByCode(q); if (p) { trPick(p); return true; } return false; },
      onPick: p => trPick(p) });
  },
  enter(p) { if (p.pid && S.products.get(p.pid)) setTimeout(() => trPick(S.products.get(p.pid)), 50); },
  render() { trLoad(); }
});
let trCur = null;
function trPick(p) {
  trCur = p;
  document.getElementById('trProd').value = p.name;
  document.getElementById('trInfo').innerHTML = '<b>' + esc(placeText(p)) + '</b>';
  const stocked = whList(p).filter(([, v]) => v > 0);
  document.getElementById('trFrom').innerHTML = stocked.map(([w, v]) => '<option value="' + esc(w) + '">' + esc(whName(w)) + ' (' + fmtN(v) + ')</option>').join('') || '<option value="">لا توجد كمية</option>';
  document.getElementById('trTo').innerHTML = S.warehouses.map(w => '<option value="' + esc(w.id) + '">' + esc(w.name) + '</option>').join('');
  const f = document.getElementById('trFrom').value, other = S.warehouses.find(w => w.id !== f);
  if (other) document.getElementById('trTo').value = other.id;
  document.getElementById('trQty').focus();
}
async function trLoad() {
  const t = document.getElementById('trList'); if (!t) return;
  try {
    const qs = await col('stockMoves').where('type', '==', 'transfer').orderBy('at', 'desc').limit(60).get();
    const rows = qs.docs.map(d => d.data(snapOpt)).filter(x => x.delta > 0);
    t.innerHTML = rows.length ? '<thead><tr><th>التاريخ</th><th>القطعة</th><th>الكمية</th><th>إلى</th><th class="hide-sm">ملاحظة</th></tr></thead><tbody>' +
      rows.map(x => '<tr><td class="small">' + fmtDate(x.at) + '</td><td class="small">' + esc(x.name) + '</td><td class="num">' + fmtN(x.delta) + '</td><td>' + esc(whName(x.wh)) + '</td><td class="hide-sm small">' + esc(x.note || '') + '</td></tr>').join('') + '</tbody>'
      : '<tr><td><div class="empty small">لا توجد عمليات نقل بعد</div></td></tr>';
  } catch (e) { t.innerHTML = '<tr><td class="small muted">' + esc(authErr(e)) + '</td></tr>'; }
}
async function doTransfer() {
  const p = trCur && S.products.get(trCur.id); if (!p) return toast('اختر القطعة', 'error');
  const from = document.getElementById('trFrom').value, to = document.getElementById('trTo').value, q = num(document.getElementById('trQty').value);
  if (!from || !to || from === to) return toast('اختر مخزنين مختلفين', 'error');
  if (!(q > 0)) return toast('اكتب كمية صحيحة', 'error');
  if (q > whQ(p, from) && !await confirmBox('الكمية في ' + whName(from) + ' هي ' + fmtN(whQ(p, from)) + ' فقط. النقل على أي حال؟', 'نقل')) return;
  const w = W();
  transferMove(w, p, from, to, q, document.getElementById('trNote').value.trim());
  w.log('transfer', 'product', p.id, p.name, { qty: q, from: whName(from), to: whName(to) });
  try { await w.commit(); toast('تم النقل ✔'); document.getElementById('trQty').value = ''; document.getElementById('trNote').value = ''; setTimeout(() => { trPick(S.products.get(p.id)); trLoad(); }, 600); }
  catch (e) { toast(authErr(e), 'error'); }
}

// ═══ المصاريف ═══
const EXP_CATS = ['إيجار', 'رواتب', 'كهرباء ومولدة', 'نقل وشحن', 'صيانة', 'إنترنت وهاتف', 'ضيافة', 'ضرائب ورسوم', 'أخرى'];
const EXPN = { list: [] };
page('expenses', {
  t: 'المصاريف', ic: '💸', admin: true, deps: ['stats'],
  html: () => `<div class="toolbar">${periodSelect('exPeriod', 'month')}<span class="spacer"></span><button class="btn ghost" data-action="export-expenses">⬇ Excel</button><button class="btn primary" data-action="new-expense">＋ مصروف</button></div>
    <div class="stats sm" id="exSum"></div><div class="dash-grid"><div class="card"><div class="card-h"><h3>حسب النوع</h3></div><div class="card-b" id="exCats"></div></div>
    <div class="card"><div class="table-wrap"><table class="t" id="exTable"></table></div></div></div>`,
  init(el) { el.querySelector('#exPeriod').addEventListener('change', loadExpenses); },
  render: () => loadExpenses()
});
async function loadExpenses() {
  const t = document.getElementById('exTable'); if (!t) return;
  const [a, b] = periodRange(document.getElementById('exPeriod').value);
  try {
    const qs = await col('expenses').where('date', '>=', localDay(a)).where('date', '<=', localDay(b)).orderBy('date', 'desc').get();
    EXPN.list = qs.docs.map(d => Object.assign({ id: d.id }, d.data(snapOpt)));
  } catch (e) { toast(authErr(e), 'error'); }
  const tot = EXPN.list.reduce((s, x) => s + num(x.amount), 0);
  const days = [...S.stats.values()].filter(d => d.date >= localDay(a) && d.date <= localDay(b));
  const profit = days.reduce((s, d) => s + num(d.profit), 0);
  document.getElementById('exSum').innerHTML = statCard('💸', 'red', money(tot), 'مجموع المصاريف', null, EXPN.list.length + ' مصروف') +
    statCard('📈', 'purple', money(profit), 'ربح المبيعات') + statCard('💰', profit - tot >= 0 ? 'green' : 'red', money(profit - tot), 'الربح الصافي', null, 'بعد المصاريف');
  const byCat = {}; EXPN.list.forEach(x => byCat[x.category] = (byCat[x.category] || 0) + num(x.amount));
  const ents = Object.entries(byCat).sort((x, y) => y[1] - x[1]);
  document.getElementById('exCats').innerHTML = ents.map(([c, v]) => hbar(c, v, ents[0][1], money(v))).join('') || '<div class="empty small">لا توجد مصاريف</div>';
  t.innerHTML = EXPN.list.length ? '<thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th class="hide-sm">ملاحظة</th><th></th></tr></thead><tbody>' + EXPN.list.map(x =>
    '<tr><td class="small num">' + esc(x.date) + '</td><td>' + esc(x.category) + (x.method !== 'نقداً' ? ' <span class="badge b-gray">' + esc(x.method) + '</span>' : '') + '</td><td class="num"><b>' + money(x.amount) + '</b></td>' +
    '<td class="hide-sm small">' + esc(x.note || '') + '</td><td><button class="btn sm ghost" data-action="del-expense" data-id="' + esc(x.id) + '">🗑</button></td></tr>').join('') + '</tbody>'
    : '<tr><td><div class="empty"><div class="ico">💸</div>لا توجد مصاريف في هذه الفترة</div></td></tr>';
}
async function newExpense() {
  const r = await promptBox('💸 مصروف جديد', [
    { name: 'category', label: 'النوع', type: 'select', value: EXP_CATS[0], options: EXP_CATS.map(c => [c, c]) },
    { name: 'amount', label: 'المبلغ', type: 'number', required: true },
    { name: 'method', label: 'طريقة الدفع', type: 'select', value: 'نقداً', options: [['نقداً', 'نقداً من الصندوق'], ['تحويل', 'تحويل / بطاقة']] },
    { name: 'date', label: 'التاريخ', type: 'date', value: localDay() },
    { name: 'note', label: 'ملاحظة', value: '' }
  ], 'حفظ');
  if (!r || !(num(r.amount) > 0)) return;
  const amt = num(r.amount), date = r.date || localDay(), w = W(), ref = col('expenses').doc();
  w.set(ref, { date, category: r.category, amount: amt, method: r.method, note: r.note.trim(), at: TS(), by: S.user.email });
  bumpDay(w, { expenses: amt, expCash: r.method === 'نقداً' ? amt : 0 }, date);
  w.log('expense', 'expense', ref.id, r.category, { amount: amt });
  try { await w.commit(); toast('تم حفظ المصروف'); loadExpenses(); } catch (e) { toast(authErr(e), 'error'); }
}

// ═══ إغلاق الصندوق اليومي ═══
page('cash', {
  t: 'إغلاق الصندوق', short: 'الصندوق', ic: '🧮', deps: ['stats'],
  html: () => `<div class="card mb"><div class="card-b">
      <div class="grid3"><div class="field"><label class="f">اليوم</label><input type="date" id="cbDay"></div>
      <div class="field"><label class="f">رصيد بداية اليوم (الفكة)</label><input type="number" id="cbFloat" class="num" value="0"></div>
      <div class="field"><label class="f">النقد الموجود فعلاً بالدرج</label><input type="number" id="cbCount" class="num" placeholder="اعدّ النقد واكتبه"></div></div>
      <div id="cbCalc"></div>
      <div class="field"><label class="f">ملاحظة</label><input id="cbNote"></div>
      <button class="btn primary" data-action="save-closing">✔ حفظ الإغلاق</button></div></div>
    <div class="card"><div class="card-h"><h3>الإغلاقات السابقة</h3></div><div class="table-wrap"><table class="t" id="cbList"></table></div></div>`,
  init(el) {
    el.querySelector('#cbDay').value = localDay();
    ['cbDay', 'cbFloat', 'cbCount'].forEach(id => el.querySelector('#' + id).addEventListener('input', cashCalc));
  },
  render() { cashCalc(); cashList(); }
});
let cashDay = null;
async function cashCalc() {
  const el = document.getElementById('cbCalc'); if (!el) return;
  const day = document.getElementById('cbDay').value || localDay();
  let d = S.stats.get(day);
  if (!d) { try { const s = await col('stats').doc('d_' + day).get(); d = s.data(); } catch (e) {} }
  d = d || {};
  const fl = num(document.getElementById('cbFloat').value);
  const rows = [['رصيد بداية اليوم', fl, 1], ['مبيعات نقدية', num(d.cash), 1], ['تحصيل ديون نقداً', num(d.collectedCash), 1],
    ['مبالغ مُرجعة للزبائن', num(d.refunds), -1], ['مصاريف نقدية', num(d.expCash), -1], ['دفعات نقدية للموردين', num(d.paidSupCash), -1], ['مشتريات مدفوعة نقداً', num(d.purCash), -1]];
  const expected = rows.reduce((s, r) => s + r[1] * r[2], 0);
  const cntRaw = document.getElementById('cbCount').value, cnt = num(cntRaw), diff = cntRaw === '' ? null : cnt - expected;
  cashDay = { day, expected, counted: cntRaw === '' ? null : cnt, diff, float: fl, breakdown: Object.fromEntries(rows.map(r => [r[0], r[1] * r[2]])) };
  el.innerHTML = '<table class="t cash-t">' + rows.map(r => '<tr><td>' + r[0] + '</td><td class="num ' + (r[2] < 0 ? 'red' : '') + '">' + (r[2] < 0 && r[1] ? '− ' : '') + money(r[1]) + '</td></tr>').join('') +
    '<tr class="tot"><td><b>المفروض بالدرج</b></td><td class="num"><b>' + money(expected) + '</b></td></tr>' +
    (diff != null ? '<tr class="tot"><td><b>الفرق</b></td><td class="num"><b class="' + (Math.abs(diff) < 1 ? 'green' : 'red') + '">' + (diff > 0 ? '+' : '') + money(diff) + (Math.abs(diff) < 1 ? ' ✔ مطابق' : diff > 0 ? ' (زيادة)' : ' (نقص)') + '</b></td></tr>' : '') + '</table>';
}
async function cashList() {
  const t = document.getElementById('cbList'); if (!t) return;
  try {
    const qs = await col('closings').orderBy('day', 'desc').limit(30).get();
    t.innerHTML = qs.empty ? '<tr><td><div class="empty small">لا توجد إغلاقات بعد</div></td></tr>' : '<thead><tr><th>اليوم</th><th>المفروض</th><th>الموجود</th><th>الفرق</th><th class="hide-sm">بواسطة</th></tr></thead><tbody>' +
      qs.docs.map(d => { const x = d.data(); return '<tr><td class="num">' + esc(x.day) + '</td><td class="num">' + money(x.expected) + '</td><td class="num">' + money(x.counted) + '</td><td class="num"><b class="' + (Math.abs(num(x.diff)) < 1 ? 'green' : 'red') + '">' + money(x.diff) + '</b></td><td class="hide-sm small">' + esc((x.by || '').split('@')[0]) + '</td></tr>'; }).join('') + '</tbody>';
  } catch (e) { t.innerHTML = '<tr><td class="small muted">' + esc(authErr(e)) + '</td></tr>'; }
}
async function saveClosing() {
  await cashCalc();
  if (!cashDay || cashDay.counted == null) return toast('اكتب النقد الموجود فعلاً', 'error');
  const w = W();
  w.set(col('closings').doc(cashDay.day), Object.assign({}, cashDay, { note: document.getElementById('cbNote').value.trim(), at: TS(), by: S.user.email }));
  w.log('closing', 'cash', cashDay.day, 'إغلاق ' + cashDay.day, { diff: cashDay.diff });
  try { await w.commit(); toast('تم حفظ الإغلاق'); cashList(); } catch (e) { toast(authErr(e), 'error'); }
}

// ═══ أوامر الشراء (طلبية للمورد قبل الاستلام) ═══
const PO = { list: [], status: 'open' };
const PO_ST = { open: ['مفتوح', 'b-blue'], received: ['تم الاستلام', 'b-green'], cancelled: ['ملغي', 'b-gray'] };
page('orders', {
  t: 'أوامر الشراء', ic: '📋', admin: true, deps: ['suppliers'],
  html: () => `<div class="toolbar"><div class="chips grow" id="poF"><button class="chip on" data-st="open">مفتوحة</button><button class="chip" data-st="received">مستلمة</button><button class="chip" data-st="">الكل</button></div>
      <button class="btn ghost" data-action="po-from-reorder">＋ من قائمة إعادة الطلب</button><button class="btn primary" data-action="new-po">＋ أمر شراء</button></div>
    <div class="card"><div class="table-wrap"><table class="t" id="poTable"></table></div></div>`,
  init(el) { el.querySelector('#poF').addEventListener('click', e => { const c = e.target.closest('[data-st]'); if (!c) return; PO.status = c.dataset.st; el.querySelectorAll('#poF .chip').forEach(x => x.classList.toggle('on', x === c)); loadPOs(); }); },
  render: () => loadPOs()
});
async function loadPOs() {
  const t = document.getElementById('poTable'); if (!t) return;
  try { let q = col('porders'); if (PO.status) q = q.where('status', '==', PO.status); const qs = await q.orderBy('createdAt', 'desc').limit(100).get(); PO.list = qs.docs.map(d => Object.assign({ id: d.id }, d.data(snapOpt))); }
  catch (e) { toast(authErr(e), 'error'); }
  t.innerHTML = PO.list.length ? '<thead><tr><th>الرقم</th><th>المورد</th><th>الأصناف</th><th class="hide-sm">التاريخ</th><th>الحالة</th></tr></thead><tbody>' + PO.list.map(x => { const st = PO_ST[x.status] || [x.status, 'b-gray'];
    return '<tr class="clickable" data-action="view-po" data-id="' + esc(x.id) + '"><td class="num"><b>' + esc(x.num) + '</b></td><td>' + esc(x.supplierName || '—') + '</td><td>' + (x.items || []).length + '</td><td class="hide-sm small">' + fmtDate(x.createdAt) + '</td><td><span class="badge ' + st[1] + '">' + st[0] + '</span></td></tr>'; }).join('') + '</tbody>'
    : '<tr><td><div class="empty"><div class="ico">📋</div>لا توجد أوامر شراء</div></td></tr>';
}
let POD = null;
function poEditor(items) {
  POD = { supplierId: '', items: items || [], note: '' };
  const m = modal('mPO', '📋 أمر شراء جديد',
    '<div class="grid2"><div class="field"><label class="f">المورد</label><select id="poSup"><option value="">— اختر —</option>' + [...S.suppliers.values()].map(s => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label class="f">ملاحظة</label><input id="poNote"></div></div>' +
    '<div class="field" style="position:relative"><label class="f">أضف صنفاً</label><input id="poAdd" placeholder="ابحث بالاسم أو رقم القطعة"></div>' +
    '<div class="table-wrap"><table class="t" id="poLines"></table></div>',
    '<button class="btn primary" data-action="save-po">💾 حفظ أمر الشراء</button><button class="btn ghost" data-close="mPO">إلغاء</button>', 'lg');
  picker(m.querySelector('#poAdd'), { source: q => searchProducts(q, null, 10), render: pkProduct, onPick: (p, inp) => { inp.value = ''; if (!POD.items.find(x => x.id === p.id)) POD.items.push({ id: p.id, name: p.name, code: partCode(p.name, p.brand), qty: 1, cost: num(p.cost) }); poDraw(); } });
  m.querySelector('#poLines').addEventListener('input', e => { const i = e.target.dataset.pi; if (i != null) POD.items[i][e.target.dataset.k] = num(e.target.value); });
  poDraw(); openModal('mPO');
}
function poDraw() {
  const t = document.getElementById('poLines'); if (!t) return;
  t.innerHTML = POD.items.length ? '<thead><tr><th>الصنف</th><th>الموجود</th><th>الكمية المطلوبة</th><th>آخر سعر شراء</th><th></th></tr></thead><tbody>' + POD.items.map((x, i) => { const p = S.products.get(x.id) || {};
    return '<tr><td class="small"><b>' + esc(x.name) + '</b></td><td class="num">' + fmtN(p.qty) + '</td><td><input type="number" class="mini num" min="0" step="any" data-pi="' + i + '" data-k="qty" value="' + x.qty + '"></td>' +
      '<td class="num small">' + money(x.cost) + '</td><td><button type="button" class="btn sm ghost" data-action="po-rm" data-i="' + i + '">✕</button></td></tr>'; }).join('') + '</tbody>'
    : '<tr><td><div class="empty small">أضف الأصناف المطلوبة</div></td></tr>';
}
async function savePO() {
  const sid = document.getElementById('poSup').value, sup = S.suppliers.get(sid);
  const items = POD.items.filter(x => num(x.qty) > 0);
  if (!items.length) return toast('أضف أصنافاً', 'error');
  const ref = col('porders').doc(), w = W();
  const doc = { num: docNum('PO'), supplierId: sid, supplierName: sup ? sup.name : '', supplierPhone: sup ? sup.phone || '' : '', items, note: document.getElementById('poNote').value.trim(), status: 'open', createdAt: TS(), by: S.user.email };
  w.set(ref, doc); w.log('create', 'porder', ref.id, doc.num, { items: items.length });
  try { await w.commit(); closeModal('mPO'); toast('تم حفظ أمر الشراء'); go('orders'); loadPOs(); showPO(Object.assign({ id: ref.id }, doc, { createdAt: Date.now() })); } catch (e) { toast(authErr(e), 'error'); }
}
let curPO = null;
const poText = x => 'طلبية من ' + S.settings.company + ' — ' + x.num + '\n' + (x.items || []).map((it, k) => (k + 1) + '. ' + it.name + (it.code ? ' [' + it.code + ']' : '') + ' — العدد: ' + fmtN(it.qty)).join('\n') + (x.note ? '\nملاحظة: ' + x.note : '');
function showPO(x) {
  curPO = x;
  modal('mPOv', '📋 ' + x.num, '<div class="inv-preview"><div class="invoice">' + shopHeader() + '<div style="text-align:left"><h2>أمر شراء</h2><div class="num">' + esc(x.num) + '</div><div>' + fmtDate(x.createdAt) + '</div></div></div>' +
    '<div>إلى المورد: <b>' + esc(x.supplierName || '—') + '</b></div><table class="doc-t"><thead><tr><th>#</th><th>الصنف</th><th>رقم القطعة</th><th>العدد</th></tr></thead><tbody>' +
    (x.items || []).map((it, k) => '<tr><td>' + (k + 1) + '</td><td>' + esc(it.name) + '</td><td class="num">' + esc(it.code || '') + '</td><td class="num">' + fmtN(it.qty) + '</td></tr>').join('') + '</tbody></table>' + (x.note ? '<p>' + esc(x.note) + '</p>' : '') + '</div></div>',
    '<button class="btn primary" data-action="print-po">🖨 طباعة</button><button class="btn green" data-action="wa-po">واتساب للمورد</button>' +
    (x.status === 'open' ? '<button class="btn primary" data-action="receive-po">📥 تم الاستلام ← فاتورة شراء</button><span class="spacer"></span><button class="btn ghost" data-action="cancel-po">إلغاء</button>' : ''), 'lg');
  openModal('mPOv');
}
act({
  'do-transfer': doTransfer,
  'transfer-product': el => { closeModal('mProduct'); go('transfers?pid=' + el.dataset.id); },
  'new-expense': newExpense,
  'del-expense': async el => {
    const x = EXPN.list.find(e => e.id === el.dataset.id); if (!x || !await confirmBox('حذف مصروف ' + x.category + ' ' + money(x.amount) + '؟', 'حذف', true)) return;
    const w = W(); w.delete(col('expenses').doc(x.id)); bumpDay(w, { expenses: -num(x.amount), expCash: x.method === 'نقداً' ? -num(x.amount) : 0 }, x.date); w.log('delete', 'expense', x.id, x.category, { amount: x.amount });
    try { await w.commit(); loadExpenses(); } catch (e) { toast(authErr(e), 'error'); }
  },
  'export-expenses': () => writeXlsx([['المصاريف', EXPN.list.map(x => ({ 'التاريخ': x.date, 'النوع': x.category, 'المبلغ': num(x.amount), 'الطريقة': x.method, 'ملاحظة': x.note || '', 'بواسطة': x.by || '' }))]], 'المصاريف-' + localDay() + '.xlsx'),
  'save-closing': saveClosing,
  'new-po': () => poEditor([]),
  'po-from-reorder': () => { const ps = activeProducts().filter(p => num(p.qty) <= num(p.minQty)); if (!ps.length) return toast('لا توجد قطع تحتاج إعادة طلب', 'info');
    poEditor(ps.map(p => ({ id: p.id, name: p.name, code: partCode(p.name, p.brand), qty: Math.max(1, Math.ceil(num(p.minQty) * 2 - num(p.qty))), cost: num(p.cost) }))); },
  'po-rm': el => { POD.items.splice(+el.dataset.i, 1); poDraw(); },
  'save-po': savePO,
  'view-po': el => { const x = PO.list.find(p => p.id === el.dataset.id); if (x) showPO(x); },
  'print-po': () => printHTML(document.querySelector('#mPOv .inv-preview').innerHTML, 'a4'),
  'wa-po': () => window.open('https://wa.me/' + waPhone(curPO.supplierPhone) + '?text=' + encodeURIComponent(poText(curPO)), '_blank', 'noopener'),
  'receive-po': () => {
    const x = curPO;
    PD = { supplierId: x.supplierId || '', ref: x.num, note: '', poId: x.id, paid: null, currency: 'IQD',
      lines: (x.items || []).filter(it => S.products.get(it.id)).map(it => { const p = S.products.get(it.id); return { id: it.id, name: it.name, qty: num(it.qty), cost: num(p.cost), price: num(p.price), oldPrice: num(p.price) }; }) };
    saveDraft(); closeModal('mPOv'); go('purchases'); setTimeout(() => newPurchase(false), 200);
    toast('راجع الكميات الفعلية المستلمة وأسعار الشراء ثم احفظ', 'info');
  },
  'cancel-po': async () => { if (!await confirmBox('إلغاء أمر الشراء؟', 'إلغاء', true)) return; const w = W(); w.update(col('porders').doc(curPO.id), { status: 'cancelled' }); w.log('cancel', 'porder', curPO.id, curPO.num, null); await w.commit(); closeModal('mPOv'); loadPOs(); }
});
