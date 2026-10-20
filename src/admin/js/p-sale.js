// ═══════════════════════════════════════════════════════════
// نقطة البيع: سلة، زبون، نقدي/آجل، خصم، فاتورة
// السلة محفوظة على الجهاز (لا تضيع لو انقطع الإنترنت أو أُعيد تحميل الصفحة)
// ═══════════════════════════════════════════════════════════
const POS = { cart: [], customerId: '', pay: 'cash', cat: '' };
try { Object.assign(POS, JSON.parse(localStorage.getItem('pos') || '{}')); } catch (e) {}
const savePos = () => { try { localStorage.setItem('pos', JSON.stringify({ cart: POS.cart, customerId: POS.customerId, pay: POS.pay, quoteId: POS.quoteId || '' })); } catch (e) {} };

page('sale', {
  t: 'البيع', ic: '🛒', deps: ['products', 'customers', 'settings'],
  html: () => `
    <div class="sale-grid">
      <div>
        <div class="toolbar">
          <div class="search grow"><span>🔍</span><input id="sSearch" placeholder="ابحث أو امسح الباركود ثم Enter"></div>
          <button class="btn ghost" data-action="scan-sale">📷 مسح</button>
        </div>
        <div class="fav-row" id="sFav"></div>
        <div class="chips mb" id="sCats"></div>
        <div class="pgrid" id="sGrid"></div>
      </div>
      <button type="button" class="cart-fab hidden" id="cartFab" data-action="goto-cart"></button>
      <div class="card cart-card" id="cartCard">
        <div class="card-h"><h3>🛒 الفاتورة</h3><span class="spacer"></span><button class="btn sm ghost" data-action="clear-cart">تفريغ</button></div>
        <div class="card-b">
          <div class="field cust-field"><label class="f">الزبون</label>
            <div class="row" style="flex-wrap:nowrap"><div class="grow" style="position:relative"><input id="sCust" placeholder="زبون نقدي — اكتب اسم أو هاتف"></div>
            <button class="btn sm ghost" data-action="quick-customer" title="زبون جديد">＋</button></div>
            <div id="sCustInfo" class="small mt"></div></div>
          <div id="cartList"></div>
          <div class="totals">
            <div class="row"><span class="muted">المجموع</span><span class="spacer"></span><b id="cSub" class="num">0</b></div>
            <div class="row"><span class="muted">الخصم</span><span class="spacer"></span><input id="cDisc" type="number" min="0" value="0" class="mini num"><select id="cDiscT" class="mini" style="width:64px"><option value="amt">د.ع</option><option value="pct">%</option></select></div>
            <div class="row total"><span>الإجمالي</span><span class="spacer"></span><b id="cTotal" class="num">0</b></div>
          </div>
          <div class="seg mb" id="sPay"><button type="button" data-pay="cash">💵 نقدي</button><button type="button" data-pay="credit">📒 آجل / دين</button></div>
          <div id="sPaidRow" class="row mb hidden"><span class="muted">المدفوع الآن</span><span class="spacer"></span><input id="sPaid" type="number" min="0" value="0" class="mini num"></div>
          <div id="sDueRow" class="small mb"></div>
          <div class="field"><input id="sNote" placeholder="ملاحظة على الفاتورة (اختياري)"></div>
          <button class="btn green block big" data-action="checkout" id="checkoutBtn">✔ إتمام البيع</button>
          <button class="btn ghost block mt" data-action="save-quote">📝 حفظ كعرض سعر (بدون بيع)</button>
          <div class="small muted mt" style="text-align:center">اختصار: F9 لإتمام البيع</div>
        </div>
      </div>
    </div>`,
  init(el) {
    const s = el.querySelector('#sSearch');
    s.addEventListener('input', debounce(renderSaleGrid, 150));
    s.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = s.value.trim(); if (!q) return;
      const pk = findPack(q);
      if (pk) { addToCart(pk.p.id, pk.qty); toast('أضيف ' + (pk.p.packName || 'كرتون') + ' = ' + pk.qty + ' قطعة'); s.value = ''; renderSaleGrid(); return; }
      const p = findByCode(q) || (searchProducts(q).length === 1 ? searchProducts(q)[0] : null);
      if (p) { addToCart(p.id); s.value = ''; renderSaleGrid(); }
      else toast('لا يوجد منتج بهذا الباركود', 'error');
    });
    el.querySelector('#sCats').addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (c) { POS.cat = c.dataset.cat; renderSaleGrid(); } });
    el.querySelector('#sGrid').addEventListener('click', e => { const c = e.target.closest('[data-add]'); if (c) addToCart(c.dataset.add); });
    el.querySelector('#sFav').addEventListener('click', e => { const c = e.target.closest('[data-add]'); if (c) addToCart(c.dataset.add); });
    picker(el.querySelector('#sCust'), {
      source: q => [...S.customers.values()].filter(c => matchScore(c.name + ' ' + (c.phone || ''), q)).slice(0, 10),
      render: c => c._new ? pkNew(c, 'زبون') : '<div class="row"><b class="grow">' + esc(c.name) + '</b><span class="small muted num">' + esc(c.phone || '') + '</span>' + (num(c.balance) > 0 ? '<span class="badge b-red num">عليه ' + money(c.balance) + '</span>' : '') + '</div>',
      extra: q => q ? { _new: true, name: q } : null,
      onPick: (c, inp) => {
        if (c._new) { quickCustomer(c.name).then(id => { if (id) { POS.customerId = id; savePos(); renderCart(); } }); return; }
        POS.customerId = c.id; repriceCart(); renderCart();
        if (c.tier === 'wholesale') toast('زبون جملة — طُبّق سعر الجملة', 'info');
      }
    });
    el.querySelector('#sCust').addEventListener('input', e => { if (!e.target.value.trim() && POS.customerId) { POS.customerId = ''; repriceCart(); renderCart(true); } });
    el.querySelector('#sPay').addEventListener('click', e => {
      const b = e.target.closest('[data-pay]'); if (!b) return;
      POS.pay = b.dataset.pay; savePos();
      document.getElementById('sPaid').value = 0;
      renderCart();
    });
    el.querySelector('#cartList').addEventListener('change', e => {
      const qi = e.target.dataset.cq, pi = e.target.dataset.cp;
      if (qi != null) { const v = num(e.target.value); if (v > 0) POS.cart[qi].qty = v; else POS.cart.splice(qi, 1); }
      if (pi != null) { POS.cart[pi].price = Math.max(0, num(e.target.value)); POS.cart[pi].manual = true; }
      savePos(); renderCart();
    });
    ['cDisc', 'cDiscT', 'sPaid'].forEach(id => el.querySelector('#' + id).addEventListener('input', () => renderCart()));
  },
  render() { renderSaleGrid(); renderCart(); }
});

document.addEventListener('keydown', e => { if (e.key === 'F9' && S.page === 'sale') { e.preventDefault(); checkout(); } });

function renderSaleGrid() {
  const el = document.getElementById('sGrid'); if (!el) return;
  const ps = activeProducts();
  const cats = [...new Set(ps.map(p => p.category).filter(Boolean))].sort();
  document.getElementById('sCats').innerHTML = ['<button class="chip' + (!POS.cat ? ' on' : '') + '" data-cat="">الكل</button>']
    .concat(cats.map(c => '<button class="chip' + (POS.cat === c ? ' on' : '') + '" data-cat="' + esc(c) + '">' + (CAT_ICON[c] || '') + ' ' + esc(c) + '</button>')).join('');
  const q = document.getElementById('sSearch').value.trim();
  // الأكثر مبيعاً آخر 30 يوم (من الإحصائيات اليومية)
  const since = localDay(Date.now() - 29 * 864e5), sold = {};
  [...S.stats.values()].filter(d => d.date >= since).forEach(d => Object.entries(d.qty || {}).forEach(([k, v]) => sold[k] = (sold[k] || 0) + num(v)));
  const fav = Object.entries(sold).filter(([k, v]) => v > 0 && S.products.get(k) && !S.products.get(k).deleted).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => S.products.get(k));
  document.getElementById('sFav').innerHTML = fav.length && !q ? '<span class="small muted">⭐ الأكثر مبيعاً:</span>' + fav.map(p => '<button type="button" class="fav" data-add="' + esc(p.id) + '" title="' + esc(p.name) + '">' + esc(partCode(p.name, p.brand) || p.name.slice(0, 18)) + '<small class="num">' + money(p.price) + '</small></button>').join('') : '';
  let list = ps.filter(p => !POS.cat || p.category === POS.cat);
  list = q ? searchProducts(q, list) : list.sort((a, b) => (num(b.qty) > 0) - (num(a.qty) > 0) || (sold[b.id] || 0) - (sold[a.id] || 0) || tsMillis(b.lastSoldAt) - tsMillis(a.lastSoldAt));
  const max = q ? 120 : (innerWidth < 860 ? 24 : 120);
  el.innerHTML = list.slice(0, max).map(p =>
    '<button type="button" class="pcard' + (num(p.qty) <= 0 ? ' out' : '') + '" data-add="' + esc(p.id) + '">' + thumbHtml(p) +
    '<div class="pn">' + esc(p.name) + '</div><div class="pp num">' + (num(p.price) > 0 ? money(p.price) : '<span class="small muted">بدون سعر</span>') + '</div><div class="small muted">متوفر: <span class="num">' + fmtN(p.qty) + '</span></div></button>').join('') ||
    '<div class="empty">لا توجد نتائج</div>';
}
function addToCart(id, qty) {
  const p = S.products.get(id); if (!p) return;
  qty = qty || 1;
  const it = POS.cart.find(c => c.id === id);
  const inCart = it ? it.qty : 0;
  if (inCart + qty > num(p.qty)) toast('تنبيه: المتوفر ' + fmtN(p.qty) + ' فقط من ' + p.name, 'info');
  if (!(num(p.price) > 0) && !it) toast('هذا المنتج بدون سعر — اكتب السعر في السلة', 'info');
  if (it) it.qty += qty;
  else POS.cart.push({ id, name: p.name, price: tierPrice(p), cost: num(p.cost), unit: p.unit || '', qty });
  savePos(); renderCart();
}
// سعر الجملة للزبون المصنّف "جملة" (إن وُجد للقطعة)
function tierPrice(p) { const c = S.customers.get(POS.customerId); return c && c.tier === 'wholesale' && num(p.price2) > 0 ? num(p.price2) : num(p.price); }
function repriceCart() {
  POS.cart.forEach(l => { if (l.manual) return; const p = S.products.get(l.id); if (p) l.price = tierPrice(p); });
  savePos();
}
function cartCalc() {
  const sub = POS.cart.reduce((a, c) => a + c.qty * c.price, 0);
  const dv = num((document.getElementById('cDisc') || {}).value), dt = (document.getElementById('cDiscT') || {}).value;
  const disc = Math.min(sub, Math.max(0, dt === 'pct' ? Math.round(sub * dv / 100) : dv));
  const total = sub - disc;
  const paid = POS.pay === 'cash' ? total : Math.min(total, Math.max(0, num((document.getElementById('sPaid') || {}).value)));
  return { sub, disc, total, paid, due: total - paid };
}
function renderCart(keepInput) {
  const el = document.getElementById('cartList'); if (!el) return;
  el.innerHTML = POS.cart.length ? POS.cart.map((c, i) => {
    const p = S.products.get(c.id);
    const warn = p && c.qty > num(p.qty) ? ' <span class="badge b-yellow">المتوفر ' + fmtN(p.qty) + '</span>' : '';
    return '<div class="cart-item"><div class="grow"><b class="small ellipsis">' + esc(c.name) + '</b>' + warn +
      '<div class="row small" style="flex-wrap:nowrap"><input type="number" class="mini num" style="width:96px" data-cp="' + i + '" value="' + c.price + '"><span class="muted num">= ' + money(c.qty * c.price) + '</span></div></div>' +
      '<div class="qty"><button data-action="cart-qty" data-i="' + i + '" data-d="1">+</button><input type="number" step="any" class="num" data-cq="' + i + '" value="' + c.qty + '"><button data-action="cart-qty" data-i="' + i + '" data-d="-1">−</button></div>' +
      '<button class="btn sm ghost" data-action="cart-rm" data-i="' + i + '" aria-label="حذف">✕</button></div>';
  }).join('') : '<div class="empty small">السلة فارغة — اضغط على منتج أو امسح الباركود</div>';
  if (POS.quoteId && POS.cart.length) el.insertAdjacentHTML('afterbegin', '<div class="badge b-blue mb">📝 من عرض سعر — يتحول لفاتورة عند الإتمام</div>');
  if (!POS.cart.length) POS.quoteId = '';
  const c = S.customers.get(POS.customerId);
  if (POS.customerId && !c) POS.customerId = '';
  const ci = document.getElementById('sCust');
  if (!keepInput && document.activeElement !== ci) ci.value = c ? c.name : '';
  document.getElementById('sCustInfo').innerHTML = c ? '👤 <b>' + esc(c.name) + '</b> ' + esc(c.phone || '') + (num(c.balance) ? ' · رصيده: <b class="num ' + (num(c.balance) > 0 ? 'red' : 'green') + '">' + money(c.balance) + '</b>' : '') : '<span class="muted">زبون نقدي</span>';
  document.querySelectorAll('#sPay [data-pay]').forEach(b => b.classList.toggle('on', b.dataset.pay === POS.pay));
  document.getElementById('sPaidRow').classList.toggle('hidden', POS.pay !== 'credit');
  const k = cartCalc();
  document.getElementById('cSub').textContent = money(k.sub);
  document.getElementById('cTotal').textContent = money(k.total);
  document.getElementById('sDueRow').innerHTML = POS.pay === 'credit' ? 'يُسجّل ديناً على الزبون: <b class="num red">' + money(k.due) + '</b>' + (c ? ' — رصيده بعدها: <b class="num">' + money(num(c.balance) + k.due) + '</b>' : '') : '';
  document.getElementById('checkoutBtn').textContent = '✔ إتمام البيع — ' + money(k.total);
  // شريط السلة الثابت على الجوال
  const fab = document.getElementById('cartFab'), n = POS.cart.reduce((a, c) => a + num(c.qty), 0);
  fab.classList.toggle('hidden', !POS.cart.length);
  fab.innerHTML = '🛒 <b class="num">' + fmtN(n) + '</b> قطعة · <b class="num">' + money(k.total) + '</b><span>عرض الفاتورة ⬇</span>';
}
act({ 'goto-cart': () => document.getElementById('cartCard').scrollIntoView({ behavior: 'smooth' }) });

async function quickCustomer(name) {
  const r = await promptBox('👤 زبون جديد', [
    { name: 'name', label: 'الاسم', required: true, value: name || '' },
    { name: 'phone', label: 'الهاتف', type: 'tel' },
    { name: 'opening', label: 'دين سابق عليه (اختياري)', type: 'number', value: 0, hint: 'لو عنده دين قديم من الدفتر، اكتبه هنا حتى يبدأ كشف حسابه صحيحاً' }
  ], 'إضافة');
  if (!r || !r.name.trim()) return null;
  return createCustomer({ name: r.name.trim(), phone: r.phone.trim() }, num(r.opening));
}

async function checkout() {
  if (!POS.cart.length) return toast('السلة فارغة', 'error');
  const zero = POS.cart.filter(c => !(c.price > 0));
  if (zero.length && !await confirmBox('أصناف بسعر صفر: ' + zero.map(c => c.name).join('، ') + '\nمتابعة؟', 'متابعة')) return;
  const k = cartCalc();
  const cust = S.customers.get(POS.customerId);
  if (k.due > 0 && !cust) return toast('البيع الآجل يحتاج اختيار زبون', 'error');
  const btn = document.getElementById('checkoutBtn'); btn.disabled = true;
  try {
    // الكمية: نتحقق من السيرفر نفسه (أحدث رقم) — والإعداد "منع البيع بالسالب" يمنع نهائياً
    let short = await serverShortages(POS.cart);
    if (!navigator.onLine) short = POS.cart.filter(c => c.qty > num((S.products.get(c.id) || {}).qty)).map(c => ({ name: c.name, have: num((S.products.get(c.id) || {}).qty), need: c.qty }));
    if (short.length) {
      const msg = short.map(s => '• ' + s.name + ': المطلوب ' + fmtN(s.need) + ' والمتوفر ' + fmtN(s.have)).join('\n');
      if (S.settings.blockNegative) { btn.disabled = false; return choiceBox('⛔ الكمية غير كافية', '<p style="white-space:pre-line">' + esc(msg) + '</p><p class="small muted mt">البيع بكمية أكبر من المتوفر ممنوع من الإعدادات. إذا كانت القطعة موجودة فعلاً، عدّل كميتها أولاً (جرد).</p>', []); }
      if (!await confirmBox('الكمية غير كافية:\n' + msg + '\n\nإتمام البيع على أي حال؟ (ستصبح الكمية سالبة)', 'إتمام')) { btn.disabled = false; return; }
    }
    const ref = col('invoices').doc();
    const items = POS.cart.map(c => ({ id: c.id, name: c.name, qty: c.qty, price: c.price, cost: c.cost, unit: c.unit }));
    const profit = items.reduce((a, c) => a + c.qty * (c.price - c.cost), 0) - k.disc;
    const inv = {
      num: await nextNum('invoices', 'INV'), customerId: cust ? cust.id : '', customer: cust ? cust.name : 'زبون نقدي', customerPhone: cust ? (cust.phone || '') : '',
      items, subtotal: k.sub, discount: k.disc, total: k.total, paid: k.paid, due: k.due, payType: k.due > 0 ? 'credit' : 'cash',
      profit, note: document.getElementById('sNote').value.trim(), by: S.user.email, createdAt: TS(), day: localDay(),
      cancelled: false, returnedTotal: 0
    };
    const w = W();
    w.set(ref, inv);
    const qty = {}, val = {};
    items.forEach(it => {
      const p = S.products.get(it.id);
      if (p) stockOut(w, p, it.qty, 'sale', { ref: ref.id, refNum: inv.num, cost: it.cost });
      qty[it.id] = (qty[it.id] || 0) + it.qty; val[it.id] = (val[it.id] || 0) + it.qty * it.price;
    });
    if (cust && k.due) w.update(col('customers').doc(cust.id), { balance: FV.increment(k.due), lastInvoiceAt: TS() });
    if (POS.quoteId) { inv.quoteId = POS.quoteId; w.update(col('quotes').doc(POS.quoteId), { status: 'converted', invoiceId: ref.id, invoiceNum: inv.num, convertedAt: TS() }); }
    bumpDay(w, { sales: k.total, discount: k.disc, profit, count: 1, cash: k.paid, credit: k.due, qty, val });
    w.log('sale', 'invoice', ref.id, inv.num, { total: k.total, due: k.due || null });
    await w.commit();
    toast('تم البيع ✔ ' + inv.num);
    POS.cart = []; POS.customerId = ''; POS.pay = 'cash'; POS.quoteId = ''; savePos();
    ['cDisc', 'sPaid'].forEach(id => document.getElementById(id).value = 0);
    document.getElementById('sNote').value = '';
    renderSaleGrid(); renderCart();
    showInvoice(Object.assign({ id: ref.id }, inv, { createdAt: Date.now() }));
  } catch (e) { toast(authErr(e), 'error'); }
  btn.disabled = false;
}

act({
  checkout,
  'scan-sale': () => startScan(code => { const pk = findPack(code); if (pk) { addToCart(pk.p.id, pk.qty); toast('أضيف ' + (pk.p.packName || 'كرتون') + ' = ' + pk.qty + ' قطعة'); return; } const p = findByCode(code); if (p) { addToCart(p.id); toast('أضيف: ' + p.name); } else toast('لا يوجد منتج بالباركود ' + code, 'error'); }),
  'cart-qty': el => { const c = POS.cart[el.dataset.i]; c.qty += num(el.dataset.d); if (c.qty <= 0) POS.cart.splice(el.dataset.i, 1); savePos(); renderCart(); },
  'cart-rm': el => { POS.cart.splice(el.dataset.i, 1); savePos(); renderCart(); },
  'clear-cart': async () => { if (POS.cart.length && !await confirmBox('تفريغ السلة؟', 'تفريغ')) return; POS.cart = []; POS.customerId = ''; savePos(); renderCart(); },
  'quick-customer': () => quickCustomer('').then(id => { if (id) { POS.customerId = id; savePos(); renderCart(); } })
});
