// ═══════════════════════════════════════════════════════════
// الزبائن والديون: قائمة، كشف حساب، استلام دفعات، رصيد افتتاحي، تذكير واتساب
// الرصيد الموجب = على الزبون (دين لنا)
// ═══════════════════════════════════════════════════════════
const CUST = { q: '', only: '' };

page('customers', {
  t: 'الزبائن والديون', short: 'الزبائن', ic: '👥', deps: ['customers', 'settings'],
  html: () => `
    <div class="stats" id="cStats"></div>
    <div class="toolbar">
      <div class="search grow"><span>🔍</span><input id="cSearch" placeholder="اسم أو هاتف الزبون"></div>
      <select id="cOnly" class="auto"><option value="">كل الزبائن</option><option value="debt">عليهم دين</option><option value="credit">لهم رصيد</option></select>
      <button class="btn ghost" data-action="export-customers">⬇ Excel</button>
      <button class="btn primary" data-action="new-customer">＋ زبون</button>
    </div>
    <div class="card"><div class="table-wrap"><table class="t" id="cTable"></table></div></div>`,
  init(el) {
    el.querySelector('#cSearch').addEventListener('input', debounce(e => { CUST.q = e.target.value.trim(); renderCustomers(); }, 150));
    el.querySelector('#cOnly').addEventListener('change', e => { CUST.only = e.target.value; renderCustomers(); });
  },
  render: () => renderCustomers()
});

function renderCustomers() {
  const t = document.getElementById('cTable'); if (!t) return;
  const all = [...S.customers.values()];
  const debtors = all.filter(c => num(c.balance) > 0);
  const totalDebt = debtors.reduce((a, c) => a + num(c.balance), 0);
  document.getElementById('cStats').innerHTML =
    statCard('👥', 'blue', fmtN(all.length), 'زبون') +
    statCard('📒', 'red', money(totalDebt), 'مجموع الديون', null, fmtN(debtors.length) + ' زبون عليهم دين') +
    statCard('💵', 'green', money([...S.stats.values()].filter(d => d.date >= localDay(Date.now() - 29 * 864e5)).reduce((a, d) => a + num(d.collected), 0)), 'تحصيل الديون (30 يوم)');
  let list = all.filter(c => (!CUST.q || matchScore(c.name + ' ' + (c.phone || ''), CUST.q)) &&
    (!CUST.only || (CUST.only === 'debt' ? num(c.balance) > 0 : num(c.balance) < 0)));
  list.sort((a, b) => num(b.balance) - num(a.balance) || (a.name || '').localeCompare(b.name || '', 'ar'));
  t.innerHTML = list.length ? '<thead><tr><th>الزبون</th><th class="hide-sm">الهاتف</th><th>الرصيد</th><th class="hide-sm">آخر فاتورة</th><th></th></tr></thead><tbody>' +
    list.map(c => '<tr class="clickable" data-action="view-customer" data-id="' + esc(c.id) + '"><td><b>' + esc(c.name) + '</b>' + (c.tier === 'wholesale' ? ' <span class="badge b-purple">جملة</span>' : '') + (c.address ? '<div class="small muted">' + esc(c.address) + '</div>' : '') + '</td>' +
      '<td class="hide-sm num">' + esc(c.phone || '—') + '</td><td class="num">' + balBadge(c.balance) + '</td><td class="hide-sm small">' + (c.lastInvoiceAt ? fmtDate(c.lastInvoiceAt) : '—') + '</td>' +
      '<td><div class="acts">' + (num(c.balance) > 0 ? '<button class="btn sm green" data-action="receive-payment" data-id="' + esc(c.id) + '">💵 قبض</button>' : '') + '</div></td></tr>').join('') + '</tbody>'
    : '<tr><td><div class="empty"><div class="ico">👥</div>' + (all.length ? 'لا توجد نتائج' : 'لا يوجد زبائن بعد — أضف زبوناً أو اختره عند البيع') + '</div></td></tr>';
}
const balBadge = b => num(b) > 0 ? '<b class="red">عليه ' + money(b) + '</b>' : num(b) < 0 ? '<b class="green">له ' + money(-num(b)) + '</b>' : '<span class="muted">0</span>';

async function createCustomer(data, opening) {
  const ref = col('customers').doc(), w = W();
  w.set(ref, Object.assign({ name: '', phone: '', address: '', note: '' }, data, { balance: num(opening), createdAt: TS(), createdBy: S.user.email }));
  if (num(opening)) w.set(col('payments').doc(), { kind: 'customer', partyId: ref.id, partyName: data.name, type: 'opening', amount: num(opening), note: 'رصيد سابق (من قبل النظام)', at: TS(), by: S.user.email });
  w.log('create', 'customer', ref.id, data.name, num(opening) ? { opening: num(opening) } : null);
  try { await w.commit(); toast('تمت إضافة الزبون'); return ref.id; } catch (e) { toast(authErr(e), 'error'); return null; }
}
async function editCustomer(id) {
  const c = id ? S.customers.get(id) : null;
  const fields = [
    { name: 'name', label: 'الاسم', required: true, value: c ? c.name : '' },
    { name: 'phone', label: 'الهاتف', type: 'tel', value: c ? c.phone : '' },
    { name: 'address', label: 'العنوان', value: c ? c.address : '' },
    { name: 'tier', label: 'نوع الزبون', type: 'select', value: c ? c.tier || 'retail' : 'retail', options: [['retail', 'مفرد (السعر العادي)'], ['wholesale', 'جملة (سعر الجملة تلقائياً)']] },
    { name: 'note', label: 'ملاحظات', type: 'textarea', value: c ? c.note : '' }
  ];
  if (!c) fields.push({ name: 'opening', label: 'دين سابق عليه (اختياري)', type: 'number', value: 0, hint: 'لو عنده دين قديم من الدفتر' });
  const r = await promptBox(c ? 'تعديل الزبون' : '👤 زبون جديد', fields, c ? 'حفظ' : 'إضافة');
  if (!r || !r.name.trim()) return;
  const data = { name: r.name.trim(), phone: r.phone.trim(), address: r.address.trim(), note: r.note.trim(), tier: r.tier || 'retail' };
  if (!c) return createCustomer(data, num(r.opening));
  const w = W(); w.update(col('customers').doc(id), data); w.log('update', 'customer', id, data.name, null);
  try { await w.commit(); toast('تم الحفظ'); if (document.getElementById('mCust').classList.contains('open')) viewCustomer(id); } catch (e) { toast(authErr(e), 'error'); }
}

// ═══ كشف الحساب ═══
async function partyStatement(kind, id, lim) {
  const isC = kind === 'customer'; lim = lim || 300;
  const [docs, pays] = await Promise.all([
    col(isC ? 'invoices' : 'purchases').where(isC ? 'customerId' : 'supplierId', '==', id).orderBy('createdAt', 'desc').limit(lim).get(),
    col('payments').where('partyId', '==', id).orderBy('at', 'desc').limit(lim).get()
  ]);
  const rows = [];
  docs.docs.forEach(d => {
    const x = d.data(snapOpt);
    if (x.cancelled && !num(x.due) && !(x.returns || []).length) return;
    rows.push({ t: tsMillis(x.createdAt), kind: isC ? 'inv' : 'pur', id: d.id, num: x.num, desc: (isC ? 'فاتورة ' : 'شراء ') + x.num + ' (' + (x.items || []).length + ' صنف)', total: num(x.total), paid: num(x.paid), eff: num(x.due) });
    (x.returns || []).forEach(r => { if (num(r.fromBalance)) rows.push({ t: num(r.at), kind: 'ret', id: d.id, desc: 'مرتجع من ' + x.num, eff: -num(r.fromBalance) }); });
    if (!isC && x.cancelled && num(x.due)) rows.push({ t: tsMillis(x.cancelledAt), kind: 'ret', id: d.id, desc: 'إلغاء ' + x.num, eff: -num(x.due) });
  });
  pays.docs.forEach(d => {
    const x = d.data(snapOpt);
    const eff = x.type === 'opening' ? num(x.amount) : x.type === 'adjust' ? num(x.amount) : -num(x.amount);
    rows.push({ t: tsMillis(x.at), kind: 'pay', id: d.id, type: x.type, desc: x.type === 'opening' ? 'رصيد سابق' : x.type === 'adjust' ? 'تسوية' + (x.note ? ': ' + x.note : '') : (isC ? 'دفعة مستلمة' : 'دفعة للمورد') + (x.method ? ' (' + x.method + ')' : '') + (x.note ? ' — ' + x.note : ''), eff, by: x.by });
  });
  rows.sort((a, b) => b.t - a.t);
  // إذا وصلنا للحد: نقطع عند أحدث نقطة ناقصة حتى لا تظهر فجوة، ويظهر زر "تحميل أقدم"
  const lastT = qs => qs.size >= lim ? (d => tsMillis(d.get('createdAt') || d.get('at')))(qs.docs[qs.size - 1]) : 0;
  const cut = Math.max(lastT(docs), lastT(pays));
  const out = cut ? rows.filter(r => r.t >= cut) : rows;
  out.more = !!cut; out.lim = lim;
  return out;
}
function stmtMoreBtn(rows, kind, id) { return rows.more ? '<div class="mt" style="text-align:center"><button class="btn ghost sm" data-action="stmt-more" data-kind="' + kind + '" data-id="' + esc(id) + '" data-lim="' + rows.lim * 3 + '">⬇ تحميل حركات أقدم</button></div>' : ''; }
act({ 'stmt-more': async el => {
  const kind = el.dataset.kind, id = el.dataset.id, box = el.closest('#custStmt, #supStmt'); el.disabled = true; el.textContent = 'جاري التحميل…';
  try {
    const rows = await partyStatement(kind, id, num(el.dataset.lim, 900));
    const isC = kind === 'customer', p = isC ? S.customers.get(id) : S.suppliers.get(id);
    if (isC) curRows = rows;
    box.innerHTML = statementTable(rows, p ? p.balance : 0, isC) + stmtMoreBtn(rows, kind, id);
  } catch (e) { toast(authErr(e), 'error'); el.disabled = false; }
} });
function statementTable(rows, current, isC) {
  let run = num(current);
  rows.forEach(r => { r.after = run; run -= r.eff; });
  return '<table class="t stmt"><thead><tr><th>التاريخ</th><th>البيان</th><th>' + (isC ? 'عليه (+)' : 'له (+)') + '</th><th>' + (isC ? 'دفع (−)' : 'دفعنا (−)') + '</th><th>الرصيد</th></tr></thead><tbody>' +
    rows.map(r => '<tr' + (r.kind === 'inv' ? ' class="clickable" data-action="view-invoice" data-id="' + esc(r.id) + '"' : r.kind === 'pur' ? ' class="clickable" data-action="view-purchase" data-id="' + esc(r.id) + '"' : '') + '><td class="small">' + fmtDate(r.t) + '</td><td class="small">' + esc(r.desc) +
      (r.total ? '<div class="muted">الإجمالي ' + money(r.total) + (r.paid ? ' · مدفوع ' + money(r.paid) : '') + '</div>' : '') + '</td>' +
      '<td class="num">' + (r.eff > 0 ? money(r.eff) : '') + '</td><td class="num">' + (r.eff < 0 ? money(-r.eff) : '') + '</td><td class="num"><b>' + money(r.after) + '</b></td></tr>').join('') +
    (Math.abs(run) > 0.5 ? '<tr><td colspan="4" class="small muted">رصيد قبل أقدم حركة معروضة</td><td class="num">' + money(run) + '</td></tr>' : '') +
    '</tbody></table>';
}

let curCust = null, curRows = [];
async function viewCustomer(id) {
  const c = S.customers.get(id); if (!c) return;
  curCust = c;
  const m = modal('mCust', '👤 ' + c.name,
    '<div class="party-head"><div><div class="muted small">' + esc([c.phone, c.address].filter(Boolean).join(' · ')) + '</div>' + (c.note ? '<div class="small">' + esc(c.note) + '</div>' : '') + '</div>' +
    '<div class="bal">' + balBadge(c.balance) + '</div></div>' +
    '<div class="row mb">' +
    '<button class="btn green" data-action="receive-payment" data-id="' + esc(c.id) + '">💵 استلام دفعة</button>' +
    '<button class="btn ghost" data-action="sale-for" data-id="' + esc(c.id) + '">🛒 بيع له</button>' +
    (c.phone ? '<button class="btn ghost" data-action="wa-remind" data-id="' + esc(c.id) + '">واتساب تذكير</button>' : '') +
    '<button class="btn ghost" data-action="print-statement">🖨 كشف حساب</button>' +
    '<button class="btn ghost" data-action="edit-customer" data-id="' + esc(c.id) + '">✏️ تعديل</button>' +
    (isAdmin() ? '<button class="btn ghost" data-action="adjust-balance" data-kind="customer" data-id="' + esc(c.id) + '">⚖️ تسوية</button>' : '') +
    (isAdmin() && !num(c.balance) ? '<button class="btn ghost" data-action="del-customer" data-id="' + esc(c.id) + '">🗑</button>' : '') +
    '</div><div id="custStmt"><div class="empty"><div class="spinner"></div></div></div>', '', 'lg');
  openModal('mCust');
  try {
    curRows = await partyStatement('customer', id);
    m.querySelector('#custStmt').innerHTML = curRows.length ? statementTable(curRows, c.balance, true) + stmtMoreBtn(curRows, 'customer', id) : '<div class="empty small">لا توجد حركات بعد</div>';
  } catch (e) { m.querySelector('#custStmt').innerHTML = '<p class="muted">' + esc(authErr(e)) + '</p>'; }
}

async function receivePayment(kind, id) {
  const isC = kind === 'customer';
  const p = isC ? S.customers.get(id) : S.suppliers.get(id); if (!p) return;
  const r = await promptBox((isC ? '💵 استلام دفعة من ' : '💸 دفعة للمورد ') + p.name, [
    { name: 'amount', label: 'المبلغ', type: 'number', required: true, value: Math.max(0, num(p.balance)) || '', hint: 'الرصيد الحالي: ' + money(p.balance) },
    { name: 'method', label: 'طريقة الدفع', type: 'select', value: 'نقداً', options: [['نقداً', 'نقداً'], ['تحويل', 'تحويل / زين كاش / ماستر'], ['صك', 'صك']] },
    { name: 'note', label: 'ملاحظة', value: '' }
  ], 'تسجيل');
  if (!r) return;
  const amt = num(r.amount);
  if (!(amt > 0)) return toast('اكتب مبلغاً صحيحاً', 'error');
  const w = W(), ref = col('payments').doc();
  w.set(ref, { kind, partyId: id, partyName: p.name, type: 'payment', amount: amt, method: r.method, note: r.note.trim(), num: docNum(isC ? 'RCV' : 'PAY'), at: TS(), by: S.user.email });
  w.update(col(isC ? 'customers' : 'suppliers').doc(id), { balance: FV.increment(-amt), lastPaymentAt: TS() });
  const cashy = r.method === 'نقداً';
  bumpDay(w, isC ? { collected: amt, collectedCash: cashy ? amt : 0 } : { paidSuppliers: amt, paidSupCash: cashy ? amt : 0 });
  w.log('payment', kind, id, p.name, { amount: amt });
  try {
    await w.commit();
    toast('تم تسجيل الدفعة ✔');
    if (await confirmBox('تم تسجيل ' + money(amt) + '.\nطباعة سند ' + (isC ? 'قبض' : 'صرف') + '؟', 'طباعة')) printVoucher(isC, p, amt, r, num(p.balance) - amt);
    if (isC && document.getElementById('mCust') && document.getElementById('mCust').classList.contains('open')) viewCustomer(id);
    if (!isC && document.getElementById('mSupp') && document.getElementById('mSupp').classList.contains('open')) viewSupplier(id);
  } catch (e) { toast(authErr(e), 'error'); }
}
function printVoucher(isC, p, amt, r, after) {
  printHTML('<div class="receipt">' + '<div class="c"><h3>' + esc(S.settings.company) + '</h3><b>' + (isC ? 'سند قبض' : 'سند صرف') + '</b></div><hr>' +
    '<div>' + fmtDate(Date.now()) + '</div><div>' + (isC ? 'استلمنا من: ' : 'دفعنا إلى: ') + '<b>' + esc(p.name) + '</b></div>' +
    '<div style="font-size:18px">المبلغ: <b class="num">' + money(amt) + '</b></div><div>الطريقة: ' + esc(r.method) + '</div>' + (r.note ? '<div>' + esc(r.note) + '</div>' : '') +
    '<hr><div>الرصيد المتبقي: <b class="num">' + money(after) + '</b></div><div class="small">المستلم: ' + esc(S.user.email.split('@')[0]) + '</div><br><div>التوقيع: ............</div></div>', 'thermal');
}
async function adjustBalance(kind, id) {
  const isC = kind === 'customer', p = isC ? S.customers.get(id) : S.suppliers.get(id);
  const r = await promptBox('⚖️ تسوية رصيد ' + p.name, [
    { name: 'amount', label: 'مبلغ التسوية (موجب يزيد ' + (isC ? 'دينه' : 'المستحق له') + '، سالب ينقصه)', type: 'number', required: true },
    { name: 'note', label: 'السبب (مطلوب)', required: true }
  ], 'تنفيذ');
  if (!r || !num(r.amount) || !r.note.trim()) return;
  const w = W();
  w.set(col('payments').doc(), { kind, partyId: id, partyName: p.name, type: 'adjust', amount: num(r.amount), note: r.note.trim(), at: TS(), by: S.user.email });
  w.update(col(isC ? 'customers' : 'suppliers').doc(id), { balance: FV.increment(num(r.amount)) });
  w.log('adjust', kind, id, p.name, { amount: num(r.amount), note: r.note.trim() });
  try { await w.commit(); toast('تمت التسوية'); isC ? viewCustomer(id) : viewSupplier(id); } catch (e) { toast(authErr(e), 'error'); }
}

act({
  'new-customer': () => editCustomer(null),
  'edit-customer': el => editCustomer(el.dataset.id),
  'view-customer': el => viewCustomer(el.dataset.id),
  'receive-payment': el => receivePayment('customer', el.dataset.id),
  'adjust-balance': el => adjustBalance(el.dataset.kind, el.dataset.id),
  'sale-for': el => { POS.customerId = el.dataset.id; savePos(); closeModal('mCust'); go('sale'); },
  'del-customer': async el => {
    const c = S.customers.get(el.dataset.id);
    if (!await confirmBox('حذف الزبون "' + c.name + '"؟ (فواتيره تبقى محفوظة)', 'حذف', true)) return;
    const w = W(); w.delete(col('customers').doc(c.id)); w.log('delete', 'customer', c.id, c.name, null);
    try { await w.commit(); closeModal('mCust'); toast('حُذف'); } catch (e) { toast(authErr(e), 'error'); }
  },
  'wa-remind': el => {
    const c = S.customers.get(el.dataset.id);
    const txt = 'مرحباً ' + c.name + '،\nنود تذكيركم بأن الرصيد المستحق لدى ' + S.settings.company + ' هو: ' + money(c.balance) + '\nشكراً لتعاملكم معنا 🌹';
    window.open('https://wa.me/' + waPhone(c.phone) + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  },
  'print-statement': () => {
    const c = curCust;
    printHTML('<div class="invoice">' + shopHeader() + '<div style="text-align:left"><h2>كشف حساب</h2><div>' + fmtDate(Date.now()) + '</div></div></div>' +
      '<div>الزبون: <b>' + esc(c.name) + '</b> ' + esc(c.phone || '') + '</div><div style="font-size:16px">الرصيد الحالي: <b class="num">' + money(c.balance) + '</b></div>' +
      statementTable(curRows.slice(), c.balance, true).replace(/ class="clickable"[^>]*>/g, '>') + '</div>', 'a4');
  },
  'export-customers': () => writeXlsx([['الزبائن', [...S.customers.values()].sort((a, b) => num(b.balance) - num(a.balance)).map(c => ({
    'الاسم': c.name, 'الهاتف': c.phone || '', 'العنوان': c.address || '', 'الرصيد (عليه)': num(c.balance), 'آخر فاتورة': c.lastInvoiceAt ? fmtDate(c.lastInvoiceAt) : '', 'ملاحظات': c.note || '' }))]], 'الزبائن-والديون-' + localDay() + '.xlsx')
});
