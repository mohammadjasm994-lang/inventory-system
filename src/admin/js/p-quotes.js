// ═══════════════════════════════════════════════════════════
// عروض الأسعار: تُحفظ من سلة البيع بدون تغيير المخزون، تُرسل للزبون،
// وتتحول لفاتورة بضغطة (تنتقل للسلة ثم إتمام البيع)
// ═══════════════════════════════════════════════════════════
const QT = { list: [], status: 'open' };
const QT_ST = { open: ['مفتوح', 'b-blue'], converted: ['تحول لفاتورة', 'b-green'], cancelled: ['ملغي', 'b-gray'] };

page('quotes', {
  t: 'عروض الأسعار', ic: '📝', deps: ['customers'],
  html: () => `<div class="toolbar"><div class="chips grow" id="qtF">
      <button class="chip on" data-st="open">مفتوحة</button><button class="chip" data-st="converted">تحولت لفاتورة</button><button class="chip" data-st="cancelled">ملغية</button><button class="chip" data-st="">الكل</button></div>
      <a class="btn primary" href="#sale">＋ عرض جديد من شاشة البيع</a></div>
    <div class="info-box small">💡 جهّز السلة في شاشة البيع ثم اضغط <b>"📝 حفظ كعرض سعر"</b> — المخزون لا يتغير حتى يتحول العرض لفاتورة.</div>
    <div class="card"><div class="table-wrap"><table class="t" id="qtTable"></table></div></div>`,
  init(el) {
    el.querySelector('#qtF').addEventListener('click', e => { const c = e.target.closest('[data-st]'); if (!c) return; QT.status = c.dataset.st; el.querySelectorAll('#qtF .chip').forEach(x => x.classList.toggle('on', x === c)); loadQuotes(); });
  },
  render: () => loadQuotes()
});
async function loadQuotes() {
  const t = document.getElementById('qtTable'); if (!t) return;
  try {
    let q = col('quotes');
    if (QT.status) q = q.where('status', '==', QT.status);
    const qs = await q.orderBy('createdAt', 'desc').limit(150).get();
    QT.list = qs.docs.map(d => Object.assign({ id: d.id }, d.data(snapOpt)));
  } catch (e) { toast(authErr(e), 'error'); }
  const today = localDay();
  t.innerHTML = QT.list.length ? '<thead><tr><th>الرقم</th><th>الزبون</th><th class="hide-sm">التاريخ</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>' +
    QT.list.map(x => { const st = QT_ST[x.status] || [x.status, 'b-gray']; const expired = x.status === 'open' && x.validUntil && x.validUntil < today;
      return '<tr class="clickable" data-action="view-quote" data-id="' + esc(x.id) + '"><td class="num"><b>' + esc(x.num) + '</b></td><td>' + esc(x.customer || '—') + '</td><td class="hide-sm small">' + fmtDate(x.createdAt) + '</td>' +
        '<td class="num"><b>' + money(x.total) + '</b></td><td><span class="badge ' + st[1] + '">' + st[0] + '</span>' + (expired ? ' <span class="badge b-yellow">منتهي الصلاحية</span>' : '') + '</td></tr>'; }).join('') + '</tbody>'
    : '<tr><td><div class="empty"><div class="ico">📝</div>لا توجد عروض</div></td></tr>';
}
async function saveQuote() {
  if (!POS.cart.length) return toast('السلة فارغة', 'error');
  const k = cartCalc(), cust = S.customers.get(POS.customerId);
  const r = await promptBox('📝 حفظ كعرض سعر', [
    { name: 'days', label: 'صلاحية العرض (أيام)', type: 'number', value: 7 },
    { name: 'note', label: 'ملاحظة على العرض', value: document.getElementById('sNote').value || '' }
  ], 'حفظ العرض');
  if (!r) return;
  const ref = col('quotes').doc(), w = W();
  const doc = { num: await nextNum('quotes', 'QT'), customerId: cust ? cust.id : '', customer: cust ? cust.name : '', customerPhone: cust ? cust.phone || '' : '',
    items: POS.cart.map(c => ({ id: c.id, name: c.name, qty: c.qty, price: c.price, unit: c.unit })), subtotal: k.sub, discount: k.disc, total: k.total,
    note: r.note.trim(), validUntil: localDay(Date.now() + Math.max(1, num(r.days, 7)) * 864e5), status: 'open', createdAt: TS(), by: S.user.email };
  w.set(ref, doc); w.log('create', 'quote', ref.id, doc.num, { total: k.total });
  try {
    await w.commit();
    POS.cart = []; POS.customerId = ''; savePos(); renderCart(); renderSaleGrid();
    toast('تم حفظ عرض السعر ' + doc.num);
    showQuote(Object.assign({ id: ref.id }, doc, { createdAt: Date.now() }));
  } catch (e) { toast(authErr(e), 'error'); }
}
let curQuote = null;
function quoteHTML(x) {
  return '<div class="invoice">' + shopHeader() + '<div style="text-align:left"><h2>عرض سعر</h2><div class="num">' + esc(x.num) + '</div><div>' + fmtDate(x.createdAt) + '</div>' +
    (x.validUntil ? '<div>صالح حتى: <b class="num">' + esc(x.validUntil) + '</b></div>' : '') + '</div></div>' +
    (x.customer ? '<div>السادة: <b>' + esc(x.customer) + '</b></div>' : '') +
    '<table class="doc-t"><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead><tbody>' +
    (x.items || []).map((it, k) => '<tr><td>' + (k + 1) + '</td><td>' + esc(it.name) + '</td><td class="num">' + fmtN(it.qty) + ' ' + esc(it.unit || '') + '</td><td class="num">' + money(it.price) + '</td><td class="num">' + money(it.qty * it.price) + '</td></tr>').join('') +
    '</tbody></table><div class="doc-tot"><div class="tl"><span>المجموع</span><span class="num">' + money(x.subtotal) + '</span></div>' + (num(x.discount) ? '<div class="tl"><span>الخصم</span><span class="num">- ' + money(x.discount) + '</span></div>' : '') +
    '<div class="tl"><span>الإجمالي</span><b class="num">' + money(x.total) + '</b></div>' + '<div class="small">' + esc(amountWords(x.total)) + '</div>' + '</div>' +
    (x.note ? '<p>ملاحظة: ' + esc(x.note) + '</p>' : '') + '<p class="small">الأسعار والتوفر حسب تاريخ العرض.</p></div>';
}
function showQuote(x) {
  curQuote = x;
  modal('mQuote', '📝 ' + x.num, '<div class="inv-preview">' + quoteHTML(x) + '</div>',
    '<button class="btn primary" data-action="print-quote">🖨 طباعة</button><button class="btn green" data-action="wa-quote">واتساب</button>' +
    (x.status === 'open' ? '<button class="btn primary" data-action="quote-to-sale">🛒 تحويل لفاتورة</button><span class="spacer"></span><button class="btn ghost" data-action="cancel-quote">إلغاء العرض</button>' : ''), 'lg');
  openModal('mQuote');
}
act({
  'save-quote': saveQuote,
  'view-quote': el => { const x = QT.list.find(q => q.id === el.dataset.id); if (x) showQuote(x); },
  'print-quote': () => printHTML(quoteHTML(curQuote), 'a4'),
  'wa-quote': () => {
    const x = curQuote;
    const txt = S.settings.company + '\nعرض سعر ' + x.num + (x.validUntil ? ' (صالح حتى ' + x.validUntil + ')' : '') + '\n' + (x.items || []).map(it => '• ' + it.name + ' × ' + fmtN(it.qty) + ' = ' + money(it.qty * it.price)).join('\n') + '\nالإجمالي: ' + money(x.total);
    window.open('https://wa.me/' + waPhone(x.customerPhone) + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  },
  'quote-to-sale': () => {
    const x = curQuote;
    POS.cart = (x.items || []).filter(it => S.products.get(it.id)).map(it => { const p = S.products.get(it.id); return { id: it.id, name: it.name, qty: it.qty, price: it.price, cost: num(p.cost), unit: it.unit || p.unit || '' }; });
    POS.customerId = x.customerId || ''; POS.quoteId = x.id; savePos();
    closeModal('mQuote'); go('sale');
    setTimeout(() => { const d = document.getElementById('cDisc'); if (d) { d.value = num(x.discount); document.getElementById('cDiscT').value = 'amt'; renderCart(); } }, 100);
    toast('العرض في السلة — راجع الكميات واضغط إتمام البيع', 'info');
  },
  'cancel-quote': async () => {
    if (!await confirmBox('إلغاء عرض السعر ' + curQuote.num + '؟', 'إلغاء العرض', true)) return;
    const w = W(); w.update(col('quotes').doc(curQuote.id), { status: 'cancelled', updatedAt: TS() }); w.log('cancel', 'quote', curQuote.id, curQuote.num, null);
    try { await w.commit(); closeModal('mQuote'); loadQuotes(); } catch (e) { toast(authErr(e), 'error'); }
  }
});
