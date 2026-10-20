// ═══════════════════════════════════════════════════════════
// الفواتير: بحث بالفترة/الزبون/الرقم، عرض وطباعة (A4 أو حراري 80mm)،
// مرتجعات جزئية، إلغاء كامل — كلها تُسجّل في حركة المخزون والإحصائيات
// ═══════════════════════════════════════════════════════════
const INV = { list: [], last: null, done: false, loading: false, period: 'month' };
const waPhone = p => { p = String(p || '').replace(/\D/g, ''); return p.startsWith('0') ? '964' + p.slice(1) : p; };

page('invoices', {
  t: 'الفواتير', ic: '🧾', deps: ['settings'],
  html: () => `
    <div class="toolbar">
      ${periodSelect('iPeriod', 'month')}
      <input type="date" id="iFrom" class="auto hidden"><input type="date" id="iTo" class="auto hidden">
      <div class="grow" style="position:relative;min-width:180px"><input id="iCust" placeholder="كل الزبائن — اكتب لاختيار زبون"></div>
      <div class="search" style="min-width:160px"><span>#</span><input id="iNum" placeholder="رقم الفاتورة"></div>
      <select id="iStatus" class="auto"><option value="">كل الفواتير</option><option value="credit">آجل (عليها دين)</option><option value="returned">فيها مرتجع</option><option value="cancelled">ملغاة</option></select>
      <button class="btn ghost" data-action="export-invoices">⬇ Excel</button>
    </div>
    <div class="stats sm" id="iSum"></div>
    <div class="card"><div class="table-wrap"><table class="t" id="iTable"></table></div>
      <div class="empty hidden" id="iMore"><button class="btn ghost" data-action="more-invoices">تحميل المزيد</button></div></div>`,
  init(el) {
    el.querySelector('#iPeriod').addEventListener('change', e => { el.querySelector('#iFrom').classList.toggle('hidden', e.target.value !== 'custom'); el.querySelector('#iTo').classList.toggle('hidden', e.target.value !== 'custom'); loadInvoices(true); });
    ['iFrom', 'iTo', 'iStatus'].forEach(id => el.querySelector('#' + id).addEventListener('change', () => loadInvoices(true)));
    el.querySelector('#iNum').addEventListener('keydown', e => { if (e.key === 'Enter') findInvoice(e.target.value.trim()); });
    picker(el.querySelector('#iCust'), {
      source: q => [...S.customers.values()].filter(c => matchScore(c.name + ' ' + (c.phone || ''), q)).slice(0, 10),
      render: c => '<b>' + esc(c.name) + '</b> <span class="small muted">' + esc(c.phone || '') + '</span>',
      onPick: (c, inp) => { inp.value = c.name; inp.dataset.id = c.id; loadInvoices(true); }
    });
    el.querySelector('#iCust').addEventListener('input', e => { if (!e.target.value.trim() && e.target.dataset.id) { delete e.target.dataset.id; loadInvoices(true); } });
  },
  enter(p) { if (p.customer) { const c = S.customers.get(p.customer); const i = document.getElementById('iCust'); if (c) { i.value = c.name; i.dataset.id = c.id; document.getElementById('iPeriod').value = 'year'; } } },
  render() { if (!INV.list.length && !INV.loading) loadInvoices(true); else drawInvoices(); }
});

function invQuery() {
  const [a, b] = periodRange(document.getElementById('iPeriod').value, document.getElementById('iFrom').value, document.getElementById('iTo').value);
  const cid = document.getElementById('iCust').dataset.id;
  let q = col('invoices');
  if (cid) q = q.where('customerId', '==', cid);
  return q.where('createdAt', '>=', a).where('createdAt', '<', new Date(b.getTime() + 864e5)).orderBy('createdAt', 'desc');
}
async function loadInvoices(reset) {
  if (INV.loading || !document.getElementById('iPeriod')) { INV.list = []; return; }
  if (reset) { INV.list = []; INV.last = null; INV.done = false; }
  if (INV.done) return;
  INV.loading = true;
  const t = document.getElementById('iTable');
  if (reset && t) t.innerHTML = '<tr><td><div class="empty"><div class="spinner"></div></div></td></tr>';
  try {
    let q = invQuery().limit(100);
    if (INV.last) q = q.startAfter(INV.last);
    const qs = await q.get();
    INV.list = INV.list.concat(qs.docs.map(d => Object.assign({ id: d.id }, d.data(snapOpt))));
    INV.last = qs.docs[qs.docs.length - 1] || INV.last;
    INV.done = qs.size < 100;
  } catch (e) { toast(authErr(e), 'error'); }
  INV.loading = false;
  drawInvoices();
}
function invStatus(i) {
  if (i.cancelled) return '<span class="badge b-red">ملغاة</span>';
  let s = '';
  if (num(i.returnedTotal) > 0) s += '<span class="badge b-purple">مرتجع ' + money(i.returnedTotal) + '</span> ';
  if (num(i.due) > 0) s += '<span class="badge b-yellow">آجل</span>';
  return s || '<span class="badge b-green">نقدي</span>';
}
function drawInvoices() {
  const t = document.getElementById('iTable'); if (!t) return;
  const st = document.getElementById('iStatus').value;
  const list = INV.list.filter(i => !st || (st === 'credit' && num(i.due) > 0 && !i.cancelled) || (st === 'returned' && num(i.returnedTotal) > 0) || (st === 'cancelled' && i.cancelled));
  const valid = list.filter(i => !i.cancelled);
  const sum = f => valid.reduce((a, i) => a + num(f(i)), 0);
  document.getElementById('iSum').innerHTML =
    statCard('🧾', 'blue', fmtN(valid.length), 'فاتورة' + (INV.done ? '' : ' (محمّل حتى الآن)')) +
    statCard('💰', 'green', money(sum(i => i.total) - sum(i => i.returnedTotal)), 'صافي المبيعات') +
    statCard('📒', 'yellow', money(sum(i => i.due)), 'منها آجل') +
    (isAdmin() ? statCard('📈', 'purple', money(sum(i => i.profit) - sum(i => i.returnedProfit)), 'الربح التقديري') : '');
  document.getElementById('iMore').classList.toggle('hidden', INV.done);
  t.innerHTML = list.length ? '<thead><tr><th>الرقم</th><th>الزبون</th><th class="hide-sm">التاريخ</th><th class="hide-sm">الأصناف</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>' +
    list.map(i => '<tr class="clickable" data-action="view-invoice" data-id="' + esc(i.id) + '"><td class="num"><b>' + esc(i.num) + '</b></td><td>' + esc(i.customer || '') +
      '</td><td class="hide-sm small">' + fmtDate(i.createdAt) + '<div class="muted">' + esc((i.by || '').split('@')[0]) + '</div></td><td class="hide-sm">' + (i.items || []).length + '</td><td class="num"><b>' + money(i.total) + '</b>' +
      (num(i.due) > 0 ? '<div class="small red">دين ' + money(i.due) + '</div>' : '') + '</td><td>' + invStatus(i) + '</td></tr>').join('') + '</tbody>'
    : '<tr><td><div class="empty"><div class="ico">🧾</div>لا توجد فواتير في هذه الفترة</div></td></tr>';
}
async function findInvoice(numStr) {
  numStr = String(numStr || '').trim().toUpperCase(); if (!numStr) return;
  try {
    for (const c of ['invoices', 'purchases']) {
      const qs = await col(c).where('num', '==', numStr).limit(1).get();
      if (!qs.empty) { const d = qs.docs[0]; return c === 'invoices' ? showInvoice(Object.assign({ id: d.id }, d.data(snapOpt))) : showPurchase(Object.assign({ id: d.id }, d.data(snapOpt))); }
    }
    toast('لا توجد فاتورة بهذا الرقم', 'error');
  } catch (e) { toast(authErr(e), 'error'); }
}
async function openInvoiceById(id) {
  const local = INV.list.find(x => x.id === id);
  if (local) return showInvoice(local);
  try { const s = await col('invoices').doc(id).get(); if (s.exists) showInvoice(Object.assign({ id: s.id }, s.data(snapOpt))); } catch (e) { toast(authErr(e), 'error'); }
}

// ═══ عرض الفاتورة ═══
let curInv = null;
function returnedQty(inv) {
  const r = {};
  (inv.returns || []).forEach(x => (x.items || []).forEach(it => r[it.id] = (r[it.id] || 0) + num(it.qty)));
  return r;
}
function invoiceHTML(inv, fmt) {
  const s = S.settings, rq = returnedQty(inv);
  const rows = (inv.items || []).map((it, k) => {
    const r = rq[it.id] ? '<div class="small" style="color:#a0f">مرتجع: ' + fmtN(rq[it.id]) + '</div>' : '';
    return fmt === 'thermal'
      ? '<tr><td colspan="3"><b>' + esc(it.name) + '</b>' + r + '</td></tr><tr><td class="num">' + fmtN(it.qty) + ' × ' + fmtN(it.price) + '</td><td></td><td class="num" style="text-align:left">' + fmtN(it.qty * it.price) + '</td></tr>'
      : '<tr><td>' + (k + 1) + '</td><td>' + esc(it.name) + r + '</td><td class="num">' + fmtN(it.qty) + ' ' + esc(it.unit || '') + '</td><td class="num">' + money(it.price) + '</td><td class="num">' + money(it.qty * it.price) + '</td></tr>';
  }).join('');
  const line = (l, v, b) => '<div class="tl"><span>' + l + '</span><' + (b ? 'b' : 'span') + ' class="num">' + v + '</' + (b ? 'b' : 'span') + '></div>';
  const tot = line('المجموع', money(inv.subtotal)) + (num(inv.discount) ? line('الخصم', '- ' + money(inv.discount)) : '') + line('الإجمالي', money(inv.total), 1) +
    (num(inv.returnedTotal) ? line('المرتجع', '- ' + money(inv.returnedTotal)) + line('الصافي', money(num(inv.total) - num(inv.returnedTotal)), 1) : '') +
    (num(inv.due) > 0 ? line('المدفوع', money(inv.paid)) + line('المتبقي (دين)', money(inv.due), 1) : '');
  const cust = '<div>الزبون: <b>' + esc(inv.customer || 'زبون نقدي') + '</b>' + (inv.customerPhone ? ' — <span class="num">' + esc(inv.customerPhone) + '</span>' : '') + '</div>';
  const bc = barcodeSvg(inv.num);
  if (fmt === 'thermal') {
    return '<div class="receipt"><div class="c"><h3>' + esc(s.company) + '</h3>' + (s.address ? '<div>' + esc(s.address) + '</div>' : '') + (s.phone ? '<div class="num">' + esc(s.phone) + '</div>' : '') + '</div><hr>' +
      '<div class="num">' + esc(inv.num) + '</div><div>' + fmtDate(inv.createdAt) + '</div>' + cust + (inv.cancelled ? '<h3 class="c">⛔ ملغاة</h3>' : '') + '<hr>' +
      '<table>' + rows + '</table><hr>' + tot + '<hr>' + (inv.note ? '<div>' + esc(inv.note) + '</div>' : '') + '<div class="c">' + esc(s.footer || '') + '</div><div class="c">' + bc + '</div></div>';
  }
  return '<div class="invoice">' + shopHeader() + '<div style="text-align:left"><h2>فاتورة بيع</h2><div class="num">' + esc(inv.num) + '</div><div>' + fmtDate(inv.createdAt) + '</div></div></div>' +
    cust + (inv.cancelled ? '<h3 style="color:#c00">⛔ فاتورة ملغاة</h3>' : '') +
    '<table class="doc-t"><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="doc-tot">' + tot + '<div class="small">' + esc(amountWords(num(inv.total) - num(inv.returnedTotal))) + '</div></div>' + (inv.note ? '<p>ملاحظة: ' + esc(inv.note) + '</p>' : '') +
    '<div class="doc-foot"><span>' + esc(s.footer || '') + '</span>' + bc + '</div></div>';
}
function barcodeSvg(code) {
  try { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); JsBarcode(s, code, { format: 'CODE128', height: 34, width: 1.3, fontSize: 11, margin: 0, displayValue: true }); return s.outerHTML; } catch (e) { return ''; }
}
function showInvoice(inv) {
  curInv = inv;
  const canRet = !inv.cancelled && inv.id && (inv.items || []).some(it => num(it.qty) > num(returnedQty(inv)[it.id]));
  const foot = '<button class="btn primary" data-action="print-invoice" data-fmt="' + (S.settings.receipt || 'a4') + '">🖨 طباعة</button>' +
    '<button class="btn ghost" data-action="print-invoice" data-fmt="' + (S.settings.receipt === 'thermal' ? 'a4' : 'thermal') + '">' + (S.settings.receipt === 'thermal' ? 'A4' : 'إيصال 80mm') + '</button>' +
    '<button class="btn green" data-action="wa-invoice">واتساب</button>' +
    (canRet ? '<button class="btn ghost" data-action="return-invoice">↩️ مرتجع</button>' : '') +
    (isAdmin() && !inv.cancelled && inv.id ? '<span class="spacer"></span><button class="btn danger" data-action="cancel-invoice">إلغاء الفاتورة</button>' : '');
  modal('mInvoice', '🧾 ' + inv.num, '<div class="inv-preview">' + invoiceHTML(inv, 'a4') + '</div>' +
    ((inv.returns || []).length ? '<h4 class="mt">سجل المرتجعات</h4>' + inv.returns.map(r => '<div class="small">↩️ ' + fmtDate(r.at) + ' — ' + money(r.amount) + ' (' + (r.refund === 'balance' ? 'خُصم من الدين' : r.refund === 'mixed' ? money(r.fromBalance) + ' من الدين والباقي نقداً' : 'نقداً') + ') — ' + esc((r.by || '').split('@')[0]) + '</div>').join('') : '') +
    '<div class="small muted mt">البائع: ' + esc(inv.by || '') + '</div>', foot, 'lg');
  openModal('mInvoice');
}

// ═══ المرتجع ═══
function returnDialog() {
  const inv = curInv, rq = returnedQty(inv);
  const ratio = num(inv.subtotal) > 0 ? num(inv.total) / num(inv.subtotal) : 1;
  const m = modal('mReturn', '↩️ مرتجع من ' + inv.num,
    '<table class="t"><thead><tr><th>الصنف</th><th>المباع</th><th>رُجّع سابقاً</th><th>يُرجع الآن</th></tr></thead><tbody>' +
    inv.items.map((it, i) => { const left = num(it.qty) - num(rq[it.id]); return '<tr><td class="small">' + esc(it.name) + '<div class="muted num">' + money(it.price) + '</div></td><td class="num">' + fmtN(it.qty) + '</td><td class="num">' + fmtN(rq[it.id] || 0) + '</td>' +
      '<td><input type="number" class="mini num" min="0" max="' + left + '" step="any" value="0" data-ri="' + i + '"' + (left <= 0 ? ' disabled' : '') + '></td></tr>'; }).join('') +
    '</tbody></table>' +
    (inv.customerId ? '<div class="field mt"><label class="f">طريقة الإرجاع</label><select id="rRefund"><option value="' + (num(inv.due) > 0 ? 'balance' : 'cash') + '">' + (num(inv.due) > 0 ? 'خصم من دين الزبون' : 'إرجاع المبلغ نقداً') + '</option><option value="' + (num(inv.due) > 0 ? 'cash' : 'balance') + '">' + (num(inv.due) > 0 ? 'إرجاع المبلغ نقداً' : 'رصيد للزبون (يُخصم من مشترياته القادمة)') + '</option></select></div>' : '') +
    '<div class="field"><label class="f">السبب</label><input id="rNote" placeholder="مثال: قطعة غير مطابقة"></div>' +
    '<div class="info-box" id="rSum">المبلغ المُرجع: 0</div>',
    '<button class="btn primary" id="rGo">تنفيذ المرتجع</button><button class="btn ghost" data-close="mReturn">إلغاء</button>', 'lg');
  const calc = () => {
    let amt = 0, cogs = 0; const items = [];
    m.querySelectorAll('[data-ri]').forEach(inp => {
      const it = inv.items[inp.dataset.ri]; const left = num(it.qty) - num(rq[it.id]);
      const q = Math.min(left, Math.max(0, num(inp.value)));
      if (q > 0) { items.push({ id: it.id, name: it.name, qty: q, price: it.price, cost: it.cost }); amt += q * it.price * ratio; cogs += q * num(it.cost); }
    });
    return { items, amount: Math.round(amt), cogs };
  };
  m.addEventListener('input', () => { m.querySelector('#rSum').innerHTML = 'المبلغ المُرجع: <b class="num">' + money(calc().amount) + '</b>'; });
  m.querySelector('#rGo').onclick = async () => {
    const c = calc();
    if (!c.items.length) return toast('حدد كمية للإرجاع', 'error');
    const refund = inv.customerId ? m.querySelector('#rRefund').value : 'cash';
    m.querySelector('#rGo').disabled = true;
    try {
      await applyReturn(inv, c, refund, m.querySelector('#rNote').value.trim(), false);
      toast('تم المرتجع ✔'); closeModal('mReturn'); closeModal('mInvoice');
    } catch (e) { toast(authErr(e), 'error'); m.querySelector('#rGo').disabled = false; }
  };
  openModal('mReturn');
}
// fromBalance: كم من المبلغ يُخصم من دين الزبون (والباقي يُرجع نقداً)
async function applyReturn(inv, c, refund, note, cancel, fromBalance) {
  const w = W(), ref = col('invoices').doc(inv.id);
  if (fromBalance == null) fromBalance = (inv.customerId && refund === 'balance') ? c.amount : 0;
  const entry = { at: Date.now(), by: S.user.email, items: c.items.map(i => ({ id: i.id, qty: i.qty, price: i.price })), amount: c.amount, refund, fromBalance, note: note || '' };
  const upd = { returns: FV.arrayUnion(entry), returnedTotal: FV.increment(c.amount), returnedProfit: FV.increment(c.amount - c.cogs) };
  if (cancel) Object.assign(upd, { cancelled: true, cancelledAt: TS(), cancelledBy: S.user.email });
  w.update(ref, upd);
  const qty = {}, val = {};
  c.items.forEach(it => {
    const p = S.products.get(it.id);
    if (p) stockMove(w, p, it.qty, cancel ? 'cancel' : 'return', { ref: inv.id, refNum: inv.num, note, cost: it.cost });
    qty[it.id] = (qty[it.id] || 0) - it.qty; val[it.id] = (val[it.id] || 0) - it.qty * it.price;
  });
  if (inv.customerId && fromBalance) w.update(col('customers').doc(inv.customerId), { balance: FV.increment(-fromBalance) });
  bumpDay(w, { returns: c.amount, profit: -(c.amount - c.cogs), refunds: c.amount - fromBalance, qty, val });
  w.log(cancel ? 'cancel' : 'return', 'invoice', inv.id, inv.num, { amount: c.amount, refund });
  await w.commit();
}
async function cancelInvoice() {
  const inv = curInv, rq = returnedQty(inv);
  const ratio = num(inv.subtotal) > 0 ? num(inv.total) / num(inv.subtotal) : 1;
  const items = inv.items.map(it => ({ id: it.id, name: it.name, qty: num(it.qty) - num(rq[it.id]), price: it.price, cost: it.cost })).filter(i => i.qty > 0);
  const amount = Math.round(items.reduce((a, i) => a + i.qty * i.price * ratio, 0));
  const cogs = items.reduce((a, i) => a + i.qty * num(i.cost), 0);
  const fromDebt = inv.customerId ? Math.min(num(inv.due), amount) : 0;
  if (!await confirmBox('إلغاء الفاتورة ' + inv.num + '؟\n• تُرجع كل الكميات للمخزون\n• المبلغ: ' + money(amount) + (fromDebt ? '\n• يُخصم ' + money(fromDebt) + ' من دين الزبون' : '') + '\nلا يمكن التراجع.', 'إلغاء الفاتورة', true)) return;
  try {
    await applyReturn(inv, { items, amount, cogs }, fromDebt ? (fromDebt < amount ? 'mixed' : 'balance') : 'cash', 'إلغاء الفاتورة', true, fromDebt);
    toast('أُلغيت الفاتورة'); closeModal('mInvoice'); loadInvoices(true);
  } catch (e) { toast(authErr(e), 'error'); }
}

act({
  'view-invoice': el => openInvoiceById(el.dataset.id),
  'find-invoice': el => findInvoice(el.dataset.num),
  'more-invoices': () => loadInvoices(false),
  'print-invoice': el => printHTML(invoiceHTML(curInv, el.dataset.fmt), el.dataset.fmt === 'thermal' ? 'thermal' : 'a4'),
  'wa-invoice': () => {
    const inv = curInv;
    const txt = S.settings.company + '\nفاتورة ' + inv.num + ' — ' + fmtDate(inv.createdAt) + '\n' + (inv.items || []).map(it => '• ' + it.name + ' × ' + fmtN(it.qty) + ' = ' + money(it.qty * it.price)).join('\n') +
      '\nالإجمالي: ' + money(inv.total) + (num(inv.due) > 0 ? '\nالمتبقي عليك: ' + money(inv.due) : '') + '\n' + (S.settings.footer || '');
    window.open('https://wa.me/' + waPhone(inv.customerPhone) + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  },
  'return-invoice': returnDialog,
  'cancel-invoice': cancelInvoice,
  'export-invoices': () => {
    const rows = INV.list.map(i => ({ 'رقم الفاتورة': i.num, 'التاريخ': fmtDate(i.createdAt), 'الزبون': i.customer || '', 'الهاتف': i.customerPhone || '', 'عدد الأصناف': (i.items || []).length,
      'المجموع': num(i.subtotal), 'الخصم': num(i.discount), 'الإجمالي': num(i.total), 'المدفوع': num(i.paid), 'الدين': num(i.due), 'المرتجع': num(i.returnedTotal),
      ...(isAdmin() ? { 'الربح': num(i.profit) - num(i.returnedProfit) } : {}), 'الحالة': i.cancelled ? 'ملغاة' : 'مكتملة', 'البائع': i.by || '' }));
    const lines = [];
    INV.list.filter(i => !i.cancelled).forEach(i => (i.items || []).forEach(it => lines.push({ 'رقم الفاتورة': i.num, 'التاريخ': fmtDate(i.createdAt), 'الزبون': i.customer || '', 'الصنف': it.name, 'الكمية': num(it.qty), 'السعر': num(it.price), 'المجموع': num(it.qty) * num(it.price), ...(isAdmin() ? { 'الربح': num(it.qty) * (num(it.price) - num(it.cost)) } : {}) })));
    writeXlsx([['الفواتير', rows], ['تفاصيل الأصناف', lines]], 'الفواتير-' + localDay() + '.xlsx');
  }
});
