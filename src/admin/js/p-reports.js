// ═══════════════════════════════════════════════════════════
// الرئيسية + التقارير — مبنية على وثائق الإحصائيات اليومية (قراءات قليلة جداً)
// ═══════════════════════════════════════════════════════════
const dayNet = d => num(d.sales) - num(d.returns);
function aggDays(days) {
  const t = { sales: 0, returns: 0, discount: 0, profit: 0, count: 0, cash: 0, credit: 0, collected: 0, refunds: 0, purchases: 0, paidSuppliers: 0,
    expenses: 0, expCash: 0, collectedCash: 0, paidSupCash: 0, purCash: 0, qty: {}, val: {} };
  days.forEach(d => {
    Object.keys(t).forEach(k => { if (typeof t[k] === 'number') t[k] += num(d[k]); });
    ['qty', 'val'].forEach(k => Object.entries(d[k] || {}).forEach(([pid, v]) => t[k][pid] = (t[k][pid] || 0) + num(v)));
  });
  t.net = t.sales - t.returns;
  t.cashIn = t.cash + t.collected - t.refunds;
  t.netProfit = t.profit - t.expenses;
  return t;
}
async function statsRange(a, b) {
  const from = localDay(a), to = localDay(b);
  const minLocal = localDay(Date.now() - 70 * 864e5);
  if (from >= minLocal) return [...S.stats.values()].filter(d => d.date >= from && d.date <= to);
  const qs = await col('stats').where('date', '>=', from).where('date', '<=', to).get();
  return qs.docs.map(d => d.data());
}
function topProducts(t, by, n) {
  return Object.entries(t[by]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n || 10)
    .map(([pid, v]) => ({ p: S.products.get(pid) || { id: pid, name: '(منتج محذوف)' }, v, q: t.qty[pid] || 0, val: t.val[pid] || 0 }));
}
function inventoryStats() {
  const ps = activeProducts(), dead = Date.now() - 90 * 864e5;
  const pos = p => Math.max(0, num(p.qty));
  return {
    ps, units: ps.reduce((a, p) => a + pos(p), 0),
    cost: ps.reduce((a, p) => a + pos(p) * num(p.cost), 0), sale: ps.reduce((a, p) => a + pos(p) * num(p.price), 0),
    low: ps.filter(p => num(p.qty) > 0 && num(p.qty) <= num(p.minQty)), out: ps.filter(p => num(p.qty) <= 0),
    dead: ps.filter(p => num(p.qty) > 0 && tsMillis(p.lastSoldAt) < dead && tsMillis(p.createdAt) < dead)
  };
}

// ═══ الرئيسية ═══
let dashMeta = null;
page('dashboard', {
  t: 'الرئيسية', ic: '🏠', deps: ['products', 'stats', 'customers', 'suppliers', 'settings'],
  html: () => `<div id="dashAlerts"></div><div class="stats" id="dStats"></div>
    <div class="dash-grid">
      <div class="card span2"><div class="card-h"><h3>📈 المبيعات — آخر 14 يوم</h3><span class="spacer"></span><a href="#reports" class="small admin-only">التقارير ←</a></div><div class="card-b" id="dChart"></div></div>
      <div class="card"><div class="card-h"><h3>⚠️ يحتاج طلب (منخفض/نفد)</h3><span class="spacer"></span><a href="#products?filter=low" class="small">الكل</a></div><div id="dLow"></div></div>
      <div class="card"><div class="card-h"><h3>🏆 الأكثر مبيعاً (30 يوم)</h3></div><div class="card-b" id="dTop"></div></div>
      <div class="card"><div class="card-h"><h3>🧾 آخر الفواتير</h3><span class="spacer"></span><a href="#invoices" class="small">الكل</a></div><div id="dInv"></div></div>
      <div class="card"><div class="card-h"><h3>📒 أكبر الديون</h3><span class="spacer"></span><a href="#customers" class="small">الكل</a></div><div id="dDebt"></div></div>
    </div>`,
  init() {
    if (isAdmin()) col('settings').doc('meta').get().then(s => { dashMeta = s.data() || {}; renderDashboard(); }).catch(() => {});
  },
  render: () => { renderDashboard(); loadRecentInvoices(); }
});
function renderDashboard() {
  if (!document.getElementById('dStats')) return;
  document.querySelectorAll('#pg-dashboard .admin-only').forEach(x => x.classList.toggle('hidden', !isAdmin()));
  const today = localDay(), m0 = localDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const all = [...S.stats.values()];
  const td = aggDays(all.filter(d => d.date === today)), mo = aggDays(all.filter(d => d.date >= m0));
  const inv = inventoryStats();
  const debts = [...S.customers.values()].reduce((a, c) => a + Math.max(0, num(c.balance)), 0);
  const sup = [...S.suppliers.values()].reduce((a, s) => a + Math.max(0, num(s.balance)), 0);
  document.getElementById('dStats').innerHTML =
    statCard('💰', 'green', money(td.net), 'مبيعات اليوم', '#invoices', fmtN(td.count) + ' فاتورة · نقداً ' + money(td.cashIn)) +
    statCard('📅', 'blue', money(mo.net), 'مبيعات الشهر', isAdmin() ? '#reports' : null, fmtN(mo.count) + ' فاتورة') +
    (isAdmin() ? statCard('📈', 'purple', money(mo.netProfit), 'صافي ربح الشهر', '#reports', 'ربح المبيعات ' + money(mo.profit) + (mo.expenses ? ' − مصاريف ' + money(mo.expenses) : '')) : '') +
    statCard('📒', 'red', money(debts), 'ديون الزبائن', '#customers') +
    (isAdmin() ? statCard('🚚', 'yellow', money(sup), 'مستحق للموردين', '#suppliers') : '') +
    statCard('📦', 'blue', fmtN(inv.ps.length), 'منتج', '#products', fmtN(inv.units) + ' قطعة') +
    (isAdmin() ? statCard('🏷', 'green', money(inv.cost), 'قيمة المخزون (تكلفة)', null, 'بسعر البيع ' + money(inv.sale)) : statCard('🛍', 'green', money(inv.sale), 'قيمة المخزون (بيع)')) +
    statCard('⚠️', 'yellow', fmtN(inv.low.length) + ' / ' + fmtN(inv.out.length), 'منخفض / نفد', '#products?filter=low');
  // التنبيهات
  const al = [];
  if (isAdmin() && dashMeta) {
    const last = Math.max(tsMillis(dashMeta.lastBackupAt), tsMillis(dashMeta.lastAutoBackupAt));
    const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    if (days == null || days >= 7) al.push(['b-red', '💾 ' + (days == null ? 'لم تُؤخذ نسخة احتياطية بعد' : 'آخر نسخة احتياطية قبل ' + days + ' يوم') + ' — <a href="#backup">خذ نسخة الآن</a>']);
  }
  const neg = inv.ps.filter(p => num(p.qty) < 0).length;
  if (neg) al.push(['b-yellow', '➖ ' + neg + ' منتج كميته سالبة — يحتاج جرد. <a href="#stocktake">الجرد</a>']);
  const noPrice = inv.ps.filter(p => !(num(p.price) > 0)).length;
  if (isAdmin() && noPrice > inv.ps.length * 0.2) al.push(['b-blue', '🏷 ' + fmtN(noPrice) + ' منتج بدون سعر بيع (لا يظهر سعرها للزبائن). <a href="#products?filter=noPrice&edit=1">✏️ أدخل الأسعار بسرعة</a> · <a href="#cleanup">تنظيف البيانات</a>']);
  document.getElementById('dashAlerts').innerHTML = al.map(a => '<div class="alert ' + a[0] + '">' + a[1] + '</div>').join('');
  // الرسم
  const days = daysBetween(new Date(Date.now() - 13 * 864e5), new Date());
  document.getElementById('dChart').innerHTML = barChart(days.map(d => { const x = S.stats.get(d) || {}; return { label: d, short: d.slice(8) + '/' + d.slice(5, 7), v: dayNet(x), v2: isAdmin() ? num(x.profit) : null }; }), { l1: 'صافي المبيعات', l2: isAdmin() ? 'الربح' : null });
  document.getElementById('dLow').innerHTML = inv.out.concat(inv.low).sort((a, b) => num(a.qty) - num(b.qty)).slice(0, 8).map(p =>
    '<div class="list-row" data-action="edit-product" data-id="' + esc(p.id) + '">' + thumbHtml(p) + '<div class="grow" style="min-width:0"><b class="ellipsis">' + esc(p.name) + '</b><div class="small muted">' + esc(normBrand(p.brand)) + '</div></div><span class="num small">' + fmtN(p.qty) + ' / ' + fmtN(p.minQty) + '</span>' + stockBadge(p) + '</div>').join('') || '<div class="empty small">👍 لا يوجد</div>';
  const t30 = aggDays(all.filter(d => d.date >= localDay(Date.now() - 29 * 864e5)));
  const top = topProducts(t30, 'qty', 6), mx = top.length ? top[0].v : 1;
  document.getElementById('dTop').innerHTML = top.map(x => hbar(x.p.name, x.v, mx)).join('') || '<div class="empty small">لا توجد مبيعات بعد</div>';
  const deb = [...S.customers.values()].filter(c => num(c.balance) > 0).sort((a, b) => num(b.balance) - num(a.balance)).slice(0, 6);
  document.getElementById('dDebt').innerHTML = deb.map(c => '<div class="list-row" data-action="view-customer" data-id="' + esc(c.id) + '"><b class="grow">' + esc(c.name) + '</b><span class="num red">' + money(c.balance) + '</span></div>').join('') || '<div class="empty small">لا توجد ديون</div>';
}
let recentAt = 0;
async function loadRecentInvoices() {
  if (Date.now() - recentAt < 30000) return; recentAt = Date.now();
  try {
    const qs = await col('invoices').orderBy('createdAt', 'desc').limit(6).get();
    const el = document.getElementById('dInv'); if (!el) return;
    el.innerHTML = qs.docs.map(d => { const i = d.data(snapOpt); return '<div class="list-row" data-action="view-invoice" data-id="' + esc(d.id) + '"><div class="grow"><b class="num">' + esc(i.num) + '</b> · ' + esc(i.customer || '') + '<div class="small muted">' + fmtDate(i.createdAt) + '</div></div><b class="num">' + money(i.total) + '</b>' + (i.cancelled ? '<span class="badge b-red">ملغاة</span>' : '') + '</div>'; }).join('') || '<div class="empty small">لا توجد فواتير بعد</div>';
  } catch (e) {}
}

// ═══ التقارير ═══
page('reports', {
  t: 'التقارير', ic: '📊', admin: true, deps: ['stats'],
  html: () => `<div class="toolbar">${periodSelect('rpPeriod', 'month')}<input type="date" id="rpFrom" class="auto hidden"><input type="date" id="rpTo" class="auto hidden">
    <span class="spacer"></span><button class="btn ghost" data-action="print-report">🖨 طباعة</button><button class="btn ghost" data-action="export-report">⬇ Excel</button></div>
    <div id="rpBody"><div class="empty"><div class="spinner"></div></div></div>`,
  init(el) {
    el.querySelector('#rpPeriod').addEventListener('change', e => { ['rpFrom', 'rpTo'].forEach(id => el.querySelector('#' + id).classList.toggle('hidden', e.target.value !== 'custom')); renderReport(); });
    ['rpFrom', 'rpTo'].forEach(id => el.querySelector('#' + id).addEventListener('change', renderReport));
  },
  render: () => renderReport()
});
let RP = null;
async function renderReport() {
  const el = document.getElementById('rpBody'); if (!el) return;
  const key = document.getElementById('rpPeriod').value;
  const [a, b] = periodRange(key, document.getElementById('rpFrom').value, document.getElementById('rpTo').value);
  let days;
  try { days = await statsRange(a, b); } catch (e) { el.innerHTML = '<p>' + esc(authErr(e)) + '</p>'; return; }
  const t = aggDays(days), inv = inventoryStats();
  const byDate = Object.fromEntries(days.map(d => [d.date, d]));
  const allDays = daysBetween(a, b);
  let series;
  if (allDays.length > 62) {
    const m = {};
    allDays.forEach(d => { const k = d.slice(0, 7); m[k] = m[k] || { v: 0, v2: 0 }; const x = byDate[d] || {}; m[k].v += dayNet(x); m[k].v2 += num(x.profit); });
    series = Object.entries(m).map(([k, v]) => ({ label: k, short: k.slice(5) + '/' + k.slice(2, 4), v: v.v, v2: v.v2 }));
  } else series = allDays.map(d => { const x = byDate[d] || {}; return { label: d, short: d.slice(8), v: dayNet(x), v2: num(x.profit) }; });
  const group = f => { const m = {}; Object.entries(t.val).forEach(([pid, v]) => { const p = S.products.get(pid); const k = p ? f(p) || '—' : '(محذوف)'; m[k] = (m[k] || 0) + v; }); return Object.entries(m).filter(x => x[1] > 0).sort((x, y) => y[1] - x[1]); };
  const byCat = group(p => p.category), byBrand = group(p => normBrand(p.brand)).slice(0, 12);
  const topQ = topProducts(t, 'qty', 15), topV = topProducts(t, 'val', 15);
  const valBy = f => { const m = {}; inv.ps.forEach(p => { const k = f(p) || '—'; m[k] = m[k] || { n: 0, q: 0, c: 0, s: 0 }; m[k].n++; m[k].q += Math.max(0, num(p.qty)); m[k].c += Math.max(0, num(p.qty)) * num(p.cost); m[k].s += Math.max(0, num(p.qty)) * num(p.price); }); return Object.entries(m).sort((x, y) => y[1].c - x[1].c); };
  const reorder = inv.out.concat(inv.low).map(p => ({ p, need: Math.max(1, Math.ceil(num(p.minQty) * 2 - num(p.qty))), sold: t.qty[p.id] || 0 })).sort((x, y) => y.sold - x.sold || num(x.p.qty) - num(y.p.qty));
  const deadVal = inv.dead.reduce((s, p) => s + num(p.qty) * num(p.cost), 0);
  RP = { label: PERIODS[key], a, b, t, byCat, byBrand, topQ, topV, valCat: valBy(p => p.category), valWh: valBy(p => whName(p.warehouseId)), reorder, dead: inv.dead, inv };
  const k = (ic, tone, v, l, sub) => statCard(ic, tone, v, l, null, sub);
  const maxCat = byCat.length ? byCat[0][1] : 1, maxBr = byBrand.length ? byBrand[0][1] : 1;
  el.innerHTML =
    '<div class="stats">' + k('💰', 'green', money(t.net), 'صافي المبيعات', 'إجمالي ' + money(t.sales) + ' − مرتجع ' + money(t.returns)) +
    k('📈', 'purple', money(t.profit), 'ربح المبيعات', t.net ? 'هامش ' + (t.profit / t.net * 100).toFixed(1) + '%' : '') +
    k('💸', 'red', money(t.expenses), 'المصاريف', '<a href="#expenses">التفاصيل</a>') +
    k('💰', t.netProfit >= 0 ? 'green' : 'red', money(t.netProfit), 'الربح الصافي', 'بعد المصاريف') +
    k('🧾', 'blue', fmtN(t.count), 'فاتورة', t.count ? 'متوسط ' + money(t.net / t.count) : '') +
    k('💵', 'green', money(t.cashIn), 'النقد الداخل', 'مبيعات نقدية ' + money(t.cash) + ' + تحصيل ' + money(t.collected)) +
    k('📒', 'red', money(t.credit), 'بيع آجل (ديون جديدة)', 'تحصيل ديون ' + money(t.collected)) +
    k('📥', 'yellow', money(t.purchases), 'المشتريات', 'دفعنا للموردين ' + money(t.paidSuppliers)) +
    k('🏷', 'blue', money(t.discount), 'الخصومات') + '</div>' +
    '<div class="card mb"><div class="card-h"><h3>📈 المبيعات والربح</h3></div><div class="card-b">' + barChart(series, { l1: 'صافي المبيعات', l2: 'الربح' }) + '</div></div>' +
    '<div class="dash-grid">' +
    '<div class="card"><div class="card-h"><h3>🏆 الأكثر مبيعاً (كمية)</h3></div><div class="card-b">' + (topQ.map(x => hbar(x.p.name, x.v, topQ[0].v)).join('') || '<div class="empty small">لا توجد مبيعات</div>') + '</div></div>' +
    '<div class="card"><div class="card-h"><h3>💎 الأعلى قيمة</h3></div><div class="card-b">' + (topV.map(x => hbar(x.p.name, x.v, topV[0].v, money(x.v))).join('') || '<div class="empty small">—</div>') + '</div></div>' +
    '<div class="card"><div class="card-h"><h3>📂 المبيعات حسب القسم</h3></div><div class="card-b">' + (byCat.map(([c, v]) => hbar(c, v, maxCat, money(v))).join('') || '<div class="empty small">—</div>') + '</div></div>' +
    '<div class="card"><div class="card-h"><h3>🏷 المبيعات حسب الماركة</h3></div><div class="card-b">' + (byBrand.map(([c, v]) => hbar(c, v, maxBr, money(v))).join('') || '<div class="empty small">—</div>') + '</div></div>' +
    '</div><h3 class="mt mb">📦 المخزون الآن</h3><div class="stats">' +
    k('🏷', 'green', money(inv.cost), 'قيمة المخزون (تكلفة)', fmtN(inv.units) + ' قطعة') + k('🛍', 'blue', money(inv.sale), 'قيمة المخزون (بيع)', 'ربح محتمل ' + money(inv.sale - inv.cost)) +
    k('🐢', 'yellow', fmtN(inv.dead.length), 'راكد (لم يُبع 90 يوم)', 'رأس مال مجمّد ' + money(deadVal)) + k('⚠️', 'red', fmtN(reorder.length), 'يحتاج إعادة طلب') + '</div>' +
    '<div class="dash-grid">' +
    '<div class="card"><div class="card-h"><h3>القيمة حسب القسم</h3></div><div class="table-wrap"><table class="t"><thead><tr><th>القسم</th><th>منتجات</th><th>قطع</th><th>تكلفة</th><th>بيع</th></tr></thead><tbody>' + RP.valCat.map(([c, v]) => '<tr><td>' + esc(c) + '</td><td class="num">' + v.n + '</td><td class="num">' + fmtN(v.q) + '</td><td class="num">' + money(v.c) + '</td><td class="num">' + money(v.s) + '</td></tr>').join('') + '</tbody></table></div></div>' +
    '<div class="card"><div class="card-h"><h3>🛒 قائمة إعادة الطلب</h3><span class="spacer"></span><button class="btn sm ghost" data-action="export-reorder">⬇ Excel للمورد</button></div><div class="table-wrap" style="max-height:360px"><table class="t"><thead><tr><th>القطعة</th><th>الموجود</th><th>المقترح</th><th>بيع بالفترة</th></tr></thead><tbody>' +
    reorder.slice(0, 80).map(x => '<tr><td class="small">' + esc(x.p.name) + '</td><td class="num">' + fmtN(x.p.qty) + '</td><td class="num"><b>' + fmtN(x.need) + '</b></td><td class="num">' + fmtN(x.sold) + '</td></tr>').join('') + '</tbody></table></div></div></div>';
}
function reportSheets() {
  const t = RP.t;
  return [
    ['الملخص', [['الفترة', RP.label + ' (' + localDay(RP.a) + ' → ' + localDay(RP.b) + ')'], ['إجمالي المبيعات', t.sales], ['المرتجعات', t.returns], ['صافي المبيعات', t.net], ['الخصومات', t.discount], ['ربح المبيعات', t.profit], ['المصاريف', t.expenses], ['الربح الصافي', t.netProfit],
      ['عدد الفواتير', t.count], ['مبيعات نقدية', t.cash], ['بيع آجل', t.credit], ['تحصيل ديون', t.collected], ['مبالغ مُرجعة', t.refunds], ['النقد الداخل', t.cashIn], ['المشتريات', t.purchases], ['دفعات للموردين', t.paidSuppliers],
      ['قيمة المخزون (تكلفة)', RP.inv.cost], ['قيمة المخزون (بيع)', RP.inv.sale]].map(r => ({ 'البند': r[0], 'القيمة': r[1] }))],
    ['الأكثر مبيعاً', RP.topQ.map(x => ({ 'القطعة': x.p.name, 'الكمية': x.q, 'القيمة': x.val }))],
    ['حسب القسم', RP.byCat.map(([c, v]) => ({ 'القسم': c, 'المبيعات': v }))],
    ['حسب الماركة', RP.byBrand.map(([c, v]) => ({ 'الماركة': c, 'المبيعات': v }))],
    ['قيمة المخزون', RP.valCat.map(([c, v]) => ({ 'القسم': c, 'المنتجات': v.n, 'القطع': v.q, 'التكلفة': v.c, 'البيع': v.s }))],
    ['إعادة الطلب', reorderRows()],
    ['الراكد', RP.dead.map(p => ({ 'القطعة': p.name, 'الماركة': normBrand(p.brand), 'الكمية': num(p.qty), 'التكلفة': num(p.qty) * num(p.cost), 'آخر بيع': p.lastSoldAt ? fmtDate(p.lastSoldAt) : 'لم يُبع' }))]
  ];
}
const reorderRows = () => RP.reorder.map(x => ({ 'القطعة': x.p.name, 'رقم القطعة': partCode(x.p.name, x.p.brand), 'الماركة': normBrand(x.p.brand), 'الموجود': num(x.p.qty), 'حد التنبيه': num(x.p.minQty), 'الكمية المقترحة': x.need, 'آخر سعر شراء': num(x.p.cost) }));
act({
  'export-report': () => RP && writeXlsx(reportSheets(), 'تقرير-' + localDay(RP.a) + '-' + localDay(RP.b) + '.xlsx'),
  'export-reorder': () => RP && writeXlsx([['طلبية', reorderRows()]], 'طلبية-إعادة-تعبئة-' + localDay() + '.xlsx'),
  'print-report': () => { if (!RP) return; printHTML('<div class="invoice">' + shopHeader() + '<div style="text-align:left"><h2>تقرير ' + esc(RP.label) + '</h2><div>' + localDay(RP.a) + ' → ' + localDay(RP.b) + '</div></div></div>' + document.getElementById('rpBody').innerHTML + '</div>', 'a4'); }
});
