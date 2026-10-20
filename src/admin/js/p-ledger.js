// ═══════════════════════════════════════════════════════════
// حركة المخزون: كل دخول وخروج لكل منتج (بيع، شراء، جرد، تالف…)
// ═══════════════════════════════════════════════════════════
const LED = { list: [], last: null, done: false, loading: false, pid: '' };

page('ledger', {
  t: 'حركة المخزون', ic: '🔄',
  html: () => `
    <div class="toolbar">
      ${periodSelect('lgPeriod', 'week')}
      <select id="lgType" class="auto"><option value="">كل الأنواع</option>${Object.entries(MOVE_TYPES).map(([k, v]) => '<option value="' + k + '">' + v[0] + '</option>').join('')}</select>
      <div class="grow" style="position:relative;min-width:200px"><input id="lgProd" placeholder="كل المنتجات — اكتب لاختيار منتج"></div>
      <button class="btn ghost" data-action="export-ledger">⬇ Excel</button>
    </div>
    <div class="stats sm" id="lgSum"></div>
    <div class="card"><div class="table-wrap"><table class="t" id="lgTable"></table></div>
      <div class="empty hidden" id="lgMore"><button class="btn ghost" data-action="more-ledger">تحميل المزيد</button></div></div>`,
  init(el) {
    ['lgPeriod', 'lgType'].forEach(id => el.querySelector('#' + id).addEventListener('change', () => loadLedger(true)));
    picker(el.querySelector('#lgProd'), { source: q => searchProducts(q, null, 10), render: pkProduct, onPick: (p, inp) => { inp.value = p.name; LED.pid = p.id; loadLedger(true); } });
    el.querySelector('#lgProd').addEventListener('input', e => { if (!e.target.value.trim() && LED.pid) { LED.pid = ''; loadLedger(true); } });
  },
  enter(p) { if (p.pid && S.products.get(p.pid)) { LED.pid = p.pid; document.getElementById('lgProd').value = S.products.get(p.pid).name; document.getElementById('lgPeriod').value = 'year'; LED.list = []; } },
  render() { if (!LED.list.length && !LED.loading) loadLedger(true); else drawLedger(); }
});
async function loadLedger(reset) {
  if (LED.loading || !document.getElementById('lgPeriod')) return;
  if (reset) { LED.list = []; LED.last = null; LED.done = false; }
  if (LED.done) return;
  LED.loading = true;
  const [a, b] = periodRange(document.getElementById('lgPeriod').value);
  const type = document.getElementById('lgType').value;
  try {
    let q = col('stockMoves');
    if (LED.pid) q = q.where('pid', '==', LED.pid);
    else if (type) q = q.where('type', '==', type);
    q = q.where('at', '>=', a).where('at', '<', new Date(b.getTime() + 864e5)).orderBy('at', 'desc').limit(150);
    if (LED.last) q = q.startAfter(LED.last);
    const qs = await q.get();
    LED.list = LED.list.concat(qs.docs.map(d => Object.assign({ id: d.id }, d.data(snapOpt))));
    LED.last = qs.docs[qs.docs.length - 1] || LED.last; LED.done = qs.size < 150;
  } catch (e) { toast(authErr(e), 'error'); }
  LED.loading = false; drawLedger();
}
function drawLedger() {
  const t = document.getElementById('lgTable'); if (!t) return;
  const type = document.getElementById('lgType').value;
  const list = LED.list.filter(x => !type || x.type === type);
  const inQ = list.filter(x => x.delta > 0).reduce((a, x) => a + x.delta, 0), outQ = list.filter(x => x.delta < 0).reduce((a, x) => a - x.delta, 0);
  document.getElementById('lgSum').innerHTML = statCard('🔄', 'blue', fmtN(list.length), 'حركة') + statCard('📥', 'green', fmtN(inQ), 'قطع داخلة') + statCard('📤', 'red', fmtN(outQ), 'قطع خارجة') +
    (isAdmin() ? statCard('💰', 'purple', money(list.filter(x => x.type === 'out').reduce((a, x) => a - x.delta * num(x.cost), 0)), 'قيمة التالف/المُخرج (تكلفة)') : '');
  document.getElementById('lgMore').classList.toggle('hidden', LED.done);
  t.innerHTML = list.length ? '<thead><tr><th>التاريخ</th><th>المنتج</th><th>النوع</th><th>الكمية</th><th class="hide-sm">قبل ← بعد</th><th class="hide-sm">المرجع / ملاحظة</th><th class="hide-sm">بواسطة</th></tr></thead><tbody>' +
    list.map(x => { const ty = MOVE_TYPES[x.type] || [x.type, 'b-gray'];
      return '<tr><td class="small">' + fmtDate(x.at) + '</td><td class="small"><a href="#" data-action="edit-product" data-id="' + esc(x.pid) + '">' + esc(x.name) + '</a></td><td><span class="badge ' + ty[1] + '">' + ty[0] + '</span></td>' +
        '<td class="num"><b class="' + (x.delta < 0 ? 'red' : 'green') + '">' + (x.delta > 0 ? '+' : '') + fmtN(x.delta) + '</b></td><td class="hide-sm num small">' + fmtN(x.before) + ' ← ' + fmtN(x.after) + '</td>' +
        '<td class="hide-sm small">' + (x.refNum ? '<a href="#" data-action="find-invoice" data-num="' + esc(x.refNum) + '">' + esc(x.refNum) + '</a> ' : '') + esc(x.note || '') + '</td><td class="hide-sm small muted">' + esc((x.by || '').split('@')[0]) + '</td></tr>'; }).join('') + '</tbody>'
    : '<tr><td><div class="empty"><div class="ico">🔄</div>لا توجد حركات في هذه الفترة<div class="small">الحركات تُسجّل تلقائياً من الآن مع كل بيع وشراء وتعديل كمية</div></div></td></tr>';
}
act({
  'more-ledger': () => loadLedger(false),
  'export-ledger': () => writeXlsx([['حركة المخزون', LED.list.map(x => ({ 'التاريخ': fmtDate(x.at), 'المنتج': x.name, 'النوع': (MOVE_TYPES[x.type] || [x.type])[0], 'الكمية': x.delta, 'قبل': x.before, 'بعد': x.after,
    ...(isAdmin() ? { 'التكلفة': num(x.cost) } : {}), 'المرجع': x.refNum || '', 'ملاحظة': x.note || '', 'بواسطة': x.by || '' }))]], 'حركة-المخزون-' + localDay() + '.xlsx')
});

// ═══════════════════════════════════════════════════════════
// الجرد: جلسة جرد لمخزن/قسم/ماركة، العد بالمسح أو الكتابة من عدة أجهزة معاً،
// مقارنة المتوقع بالفعلي، والتطبيق (للمدير) يسجل الفروقات في حركة المخزون
// ═══════════════════════════════════════════════════════════
const ST = { list: [], cur: null, unsub: null, filter: 'all', q: '' };
page('stocktake', {
  t: 'الجرد', ic: '📋',
  html: () => `<div id="stHome">
      <div class="toolbar"><span class="muted small grow">الجرد يقارن الكمية المسجلة بالكمية الموجودة فعلاً على الرفوف. تقدر تعد من أكثر من جهاز بنفس الوقت.</span>
      <button class="btn primary" data-action="new-stocktake">＋ جرد جديد</button></div>
      <div class="card"><div class="table-wrap"><table class="t" id="stTable"></table></div></div></div>
    <div id="stWork" class="hidden"></div>`,
  render() { if (!ST.cur) loadStocktakes(); }
});
async function loadStocktakes() {
  try {
    const qs = await col('stocktakes').orderBy('createdAt', 'desc').limit(30).get();
    ST.list = qs.docs.map(d => Object.assign({ id: d.id }, d.data(snapOpt)));
  } catch (e) { toast(authErr(e), 'error'); }
  const t = document.getElementById('stTable'); if (!t) return;
  t.innerHTML = ST.list.length ? '<thead><tr><th>الجرد</th><th>النطاق</th><th>المعدود</th><th>الحالة</th><th class="hide-sm">التاريخ</th></tr></thead><tbody>' +
    ST.list.map(s => '<tr class="clickable" data-action="open-stocktake" data-id="' + esc(s.id) + '"><td><b>' + esc(s.name) + '</b></td><td class="small">' + esc(scopeText(s.scope)) + '</td><td class="num">' + fmtN(Object.keys(s.counts || {}).length) + '</td>' +
      '<td>' + (s.status === 'applied' ? '<span class="badge b-green">مُطبّق</span>' : '<span class="badge b-yellow">مفتوح</span>') + '</td><td class="hide-sm small">' + fmtDate(s.createdAt) + '</td></tr>').join('') + '</tbody>'
    : '<tr><td><div class="empty"><div class="ico">📋</div>لا توجد عمليات جرد بعد</div></td></tr>';
}
const scopeText = sc => !sc ? 'كل المخزون' : [sc.wh ? whName(sc.wh) : '', sc.cat || '', sc.brand || ''].filter(Boolean).join(' · ') || 'كل المخزون';
function scopeProducts(sc) {
  return activeProducts().filter(p => (!sc || !sc.wh || p.warehouseId === sc.wh || whQ(p, sc.wh) !== 0) && (!sc || !sc.cat || p.category === sc.cat) && (!sc || !sc.brand || normBrand(p.brand) === sc.brand));
}
// الكمية المتوقعة: في جرد مخزن محدد = كمية القطعة في ذلك المخزن فقط
const stExpected = (p, sc) => sc && sc.wh ? whQ(p, sc.wh) : num(p.qty);
async function newStocktake() {
  const ps = activeProducts();
  const cats = [...new Set(ps.map(p => p.category).filter(Boolean))], brands = [...new Set(ps.map(p => normBrand(p.brand)).filter(Boolean))].sort();
  const r = await promptBox('📋 جرد جديد', [
    { name: 'name', label: 'اسم الجرد', required: true, value: 'جرد ' + new Date().toLocaleDateString('en-GB') },
    { name: 'wh', label: 'المخزن', type: 'select', value: '', options: [['', 'كل المخازن']].concat(S.warehouses.map(w => [w.id, w.name])) },
    { name: 'cat', label: 'القسم', type: 'select', value: '', options: [['', 'كل الأقسام']].concat(cats.map(c => [c, c])) },
    { name: 'brand', label: 'الماركة', type: 'select', value: '', options: [['', 'كل الماركات']].concat(brands.map(b => [b, b])) }
  ], 'بدء الجرد');
  if (!r) return;
  const ref = col('stocktakes').doc();
  try {
    await ref.set({ name: r.name.trim(), scope: { wh: r.wh, cat: r.cat, brand: r.brand }, counts: {}, status: 'open', createdAt: TS(), createdBy: S.user.email });
    openStocktake(ref.id);
  } catch (e) { toast(authErr(e), 'error'); }
}
function openStocktake(id) {
  if (ST.unsub) ST.unsub();
  ST.filter = 'all'; ST.q = '';
  const work = document.getElementById('stWork');
  document.getElementById('stHome').classList.add('hidden'); work.classList.remove('hidden');
  work.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
  let built = false;
  ST.unsub = col('stocktakes').doc(id).onSnapshot(s => {
    ST.cur = Object.assign({ id }, s.data(snapOpt));
    if (!built) { buildStocktake(work); built = true; }
    drawStocktake();
  }, e => toast(authErr(e), 'error'));
}
function closeStocktake() { if (ST.unsub) ST.unsub(); ST.unsub = null; ST.cur = null; document.getElementById('stWork').classList.add('hidden'); document.getElementById('stHome').classList.remove('hidden'); loadStocktakes(); }
function buildStocktake(el) {
  const s = ST.cur, open = s.status !== 'applied';
  el.innerHTML = '<div class="toolbar"><button class="btn ghost" data-action="close-stocktake">→ رجوع</button><h3 class="grow">' + esc(s.name) + ' <span class="small muted">' + esc(scopeText(s.scope)) + '</span></h3>' +
    '<button class="btn ghost" data-action="export-stocktake">⬇ Excel</button>' + (open && isAdmin() ? '<button class="btn primary" data-action="apply-stocktake">✔ تطبيق الفروقات</button>' : '') + '</div>' +
    '<div class="stats sm" id="stSum"></div>' +
    (open ? '<div class="card mb"><div class="card-b"><div class="row"><div class="search grow"><span>📦</span><input id="stScan" placeholder="امسح باركود القطعة أو اكتب اسمها — كل مسحة تزيد العدد 1"></div><button class="btn ghost" data-action="st-camera">📷</button></div></div></div>' : '') +
    '<div class="chips mb" id="stF"><button class="chip on" data-f="all">الكل</button><button class="chip" data-f="todo">لم يُعد</button><button class="chip" data-f="diff">فيه فرق</button><button class="chip" data-f="ok">مطابق</button></div>' +
    '<div class="card"><div class="table-wrap"><table class="t" id="stLines"></table></div></div>';
  el.querySelector('#stF').addEventListener('click', e => { const c = e.target.closest('[data-f]'); if (!c) return; ST.filter = c.dataset.f; el.querySelectorAll('#stF .chip').forEach(x => x.classList.toggle('on', x === c)); drawStocktake(); });
  const scan = el.querySelector('#stScan');
  if (scan) {
    picker(scan, {
      source: q => searchProducts(q, scopeProducts(ST.cur.scope), 10), render: pkProduct, exactFirst: true,
      onEnter: (q, inp) => { const pk = findPack(q, scopeProducts(ST.cur.scope)); if (pk) { stCount(pk.p.id, pk.qty, true); inp.value = ''; return true; } const p = findByCode(q, scopeProducts(ST.cur.scope)); if (p) { stCount(p.id, 1, true); inp.value = ''; return true; } if (q) toast('القطعة غير موجودة ضمن نطاق هذا الجرد', 'error'); return false; },
      onPick: (p, inp) => { inp.value = ''; stCount(p.id, 1, true); }
    });
  }
  el.querySelector('#stLines').addEventListener('change', e => {
    const id = e.target.dataset.cnt; if (!id) return;
    if (e.target.value === '') return stCount(id, null);
    stCount(id, Math.max(0, num(e.target.value)));
  });
}
async function stCount(pid, v, inc) {
  const ref = col('stocktakes').doc(ST.cur.id);
  try {
    if (v == null) await ref.update({ ['counts.' + pid]: FV.delete() });
    else await ref.update({ ['counts.' + pid]: inc ? FV.increment(v) : v, updatedAt: TS() });
    if (inc) { const p = S.products.get(pid); toast('✔ ' + (p ? p.name : '') + ' = ' + fmtN(num((ST.cur.counts || {})[pid]) + v)); if (navigator.vibrate) navigator.vibrate(40); }
  } catch (e) { toast(authErr(e), 'error'); }
}
function stLines() {
  const counts = ST.cur.counts || {};
  return scopeProducts(ST.cur.scope).map(p => {
    const c = counts[p.id];
    return { p, c, e: stExpected(p, ST.cur.scope), d: c == null ? null : num(c) - stExpected(p, ST.cur.scope) };
  });
}
function drawStocktake() {
  const t = document.getElementById('stLines'); if (!t || !ST.cur) return;
  const all = stLines(), open = ST.cur.status !== 'applied';
  const counted = all.filter(x => x.c != null), diffs = counted.filter(x => x.d);
  const val = diffs.reduce((a, x) => a + x.d * num(x.p.cost), 0);
  document.getElementById('stSum').innerHTML = statCard('📦', 'blue', fmtN(all.length), 'قطعة في النطاق') + statCard('✔', 'green', fmtN(counted.length), 'تم عدّها', null, Math.round(counted.length / Math.max(1, all.length) * 100) + '%') +
    statCard('⚠️', 'yellow', fmtN(diffs.length), 'فيها فرق') + (isAdmin() ? statCard('💰', val < 0 ? 'red' : 'green', money(val), 'قيمة الفرق (تكلفة)') : '');
  const list = all.filter(x => ST.filter === 'all' || (ST.filter === 'todo' && x.c == null) || (ST.filter === 'diff' && x.d) || (ST.filter === 'ok' && x.c != null && !x.d))
    .sort((a, b) => (a.c == null) - (b.c == null) || Math.abs(b.d || 0) - Math.abs(a.d || 0) || (a.p.name || '').localeCompare(b.p.name || '', 'ar'));
  t.innerHTML = '<thead><tr><th>القطعة</th><th>المسجّل</th><th>المعدود فعلياً</th><th>الفرق</th></tr></thead><tbody>' + list.slice(0, 600).map(x =>
    '<tr' + (x.d ? ' class="warn-row"' : '') + '><td class="small"><b>' + esc(x.p.name) + '</b><div class="muted">' + esc([normBrand(x.p.brand), x.p.location, x.p.barcode].filter(Boolean).join(' · ')) + '</div></td>' +
    '<td class="num">' + fmtN(x.e) + '</td><td>' + (open ? '<input type="number" min="0" step="any" class="mini num" data-cnt="' + esc(x.p.id) + '" value="' + (x.c == null ? '' : x.c) + '" placeholder="—">' : (x.c == null ? '—' : fmtN(x.c))) + '</td>' +
    '<td class="num">' + (x.d == null ? '' : x.d ? '<b class="' + (x.d < 0 ? 'red' : 'green') + '">' + (x.d > 0 ? '+' : '') + fmtN(x.d) + '</b>' : '<span class="green">✔</span>') + '</td></tr>').join('') +
    (list.length > 600 ? '<tr><td colspan="4" class="small muted">يظهر أول 600 — استخدم البحث/الفلاتر</td></tr>' : '') + '</tbody>';
}
async function applyStocktake() {
  const diffs = stLines().filter(x => x.c != null && x.d);
  if (!diffs.length) { if (await confirmBox('لا توجد فروقات. إغلاق الجرد كمطابق؟', 'إغلاق')) { await col('stocktakes').doc(ST.cur.id).update({ status: 'applied', appliedAt: TS(), appliedBy: S.user.email }); closeStocktake(); } return; }
  if (!await confirmBox('سيتم تعديل كمية ' + diffs.length + ' قطعة لتطابق العدّ الفعلي، وتُسجّل كـ"جرد" في حركة المخزون.\nالقطع غير المعدودة لا تتغير. متابعة؟', 'تطبيق')) return;
  const w = W();
  const sc = ST.cur.scope || {};
  // جرد مخزن محدد: نعدّل كمية ذلك المخزن فقط (بالفرق). جرد شامل: نعيّن الكمية الكلية
  diffs.forEach(x => sc.wh ? stockMove(w, x.p, x.d, 'count', { wh: sc.wh, ref: ST.cur.id, refNum: ST.cur.name, note: 'جرد ' + whName(sc.wh) })
    : stockMove(w, x.p, 0, 'count', { setTo: num(x.c), ref: ST.cur.id, refNum: ST.cur.name, note: 'جرد' }));
  w.update(col('stocktakes').doc(ST.cur.id), { status: 'applied', appliedAt: TS(), appliedBy: S.user.email,
    result: { changed: diffs.length, value: diffs.reduce((a, x) => a + x.d * num(x.p.cost), 0) } });
  w.log('stocktake', 'stocktake', ST.cur.id, ST.cur.name, { changed: diffs.length });
  try { await w.commit(); toast('تم تطبيق الجرد ✔'); } catch (e) { toast(authErr(e), 'error'); }
}
act({
  'new-stocktake': newStocktake,
  'open-stocktake': el => openStocktake(el.dataset.id),
  'close-stocktake': closeStocktake,
  'apply-stocktake': applyStocktake,
  'st-camera': () => startScan(code => { const p = findByCode(code, scopeProducts(ST.cur.scope)); if (p) stCount(p.id, 1, true); else toast('القطعة غير موجودة ضمن نطاق الجرد', 'error'); }),
  'export-stocktake': () => writeXlsx([[ST.cur.name, stLines().map(x => ({ 'القطعة': x.p.name, 'الماركة': normBrand(x.p.brand), 'الباركود': x.p.barcode || '', 'الموقع': x.p.location || '', 'المسجّل': x.e,
    'المعدود': x.c == null ? '' : num(x.c), 'الفرق': x.d == null ? '' : x.d, ...(isAdmin() ? { 'قيمة الفرق': x.d ? x.d * num(x.p.cost) : '' } : {}) }))]], ST.cur.name + '.xlsx')
});
