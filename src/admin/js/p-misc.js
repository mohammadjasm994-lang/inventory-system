// ═══════════════════════════════════════════════════════════
// المخازن، ملصقات الباركود، استيراد/تصدير Excel
// ═══════════════════════════════════════════════════════════

// ═══ المخازن ═══
page('warehouses', {
  t: 'المخازن', ic: '🏭', deps: ['products', 'warehouses'],
  html: () => '<div class="toolbar"><span class="spacer"></span><button class="btn primary admin-only" data-action="edit-wh">＋ مخزن جديد</button></div><div class="whgrid" id="whGrid"></div>',
  render() {
    document.querySelectorAll('#pg-warehouses .admin-only').forEach(x => x.classList.toggle('hidden', !isAdmin()));
    const ps = activeProducts();
    document.getElementById('whGrid').innerHTML = S.warehouses.map(w => {
      const items = ps.filter(p => whQ(p, w.id) !== 0 || (p.warehouseId === w.id && !p.whQty));
      const val = items.reduce((a, p) => a + Math.max(0, whQ(p, w.id)) * num(p.price), 0);
      const units = items.reduce((a, p) => a + Math.max(0, whQ(p, w.id)), 0);
      return '<div class="card"><div class="card-b"><div class="row mb"><div class="thumb" style="background:' + esc(w.color || '#e8890c') + '22">' + esc(w.icon || '🏭') + '</div><div class="grow"><b>' + esc(w.name) + '</b><div class="small muted">' + esc(w.location || '') + '</div></div>' +
        (isAdmin() ? '<button class="btn sm ghost" data-action="edit-wh" data-id="' + esc(w.id) + '">✏️</button><button class="btn sm ghost" data-action="del-wh" data-id="' + esc(w.id) + '">🗑</button>' : '') + '</div>' +
        '<div class="row small"><span>المنتجات: <b class="num">' + items.length + '</b></span><span class="spacer"></span><span>منخفض: <b class="num">' + items.filter(p => num(p.qty) <= num(p.minQty)).length + '</b></span></div>' +
        '<div class="small">القطع: <b class="num">' + fmtN(units) + '</b> · قيمة البيع: <b class="num">' + money(val) + '</b></div>' +
        '<a class="btn sm ghost block mt" href="#products" data-action="wh-products" data-id="' + esc(w.id) + '">عرض المنتجات</a></div></div>';
    }).join('') + (ps.some(p => !p.warehouseId || !S.warehouses.find(w => w.id === p.warehouseId)) ? '<div class="card"><div class="card-b"><b>بدون مخزن</b><div class="small">' + ps.filter(p => !S.warehouses.find(w => w.id === p.warehouseId)).length + ' منتج غير مرتبط بمخزن — استخدم التعديل الجماعي لنقلها</div></div></div>' : '') ||
      '<div class="empty"><div class="ico">🏭</div>لا توجد مخازن</div>';
  }
});
async function editWh(id) {
  const w = S.warehouses.find(x => x.id === id) || { icon: '🏭', color: '#e8890c' };
  const r = await promptBox(id ? 'تعديل المخزن' : '🏭 مخزن جديد', [
    { name: 'name', label: 'الاسم', required: true, value: w.name || '' }, { name: 'location', label: 'الموقع', value: w.location || '' },
    { name: 'icon', label: 'أيقونة', value: w.icon || '🏭' }, { name: 'color', label: 'اللون', type: 'color', value: w.color || '#e8890c' }
  ]);
  if (!r || !r.name.trim()) return;
  const ref = id ? col('warehouses').doc(id) : col('warehouses').doc(), x = W();
  x.set(ref, { name: r.name.trim(), location: r.location.trim(), icon: r.icon.trim() || '🏭', color: r.color }, { merge: true });
  x.log(id ? 'update' : 'create', 'warehouse', ref.id, r.name.trim(), null);
  try { await x.commit(); toast('تم الحفظ'); } catch (e) { toast(authErr(e), 'error'); }
}
act({
  'edit-wh': el => editWh(el.dataset.id || null),
  'del-wh': async el => {
    const w = S.warehouses.find(x => x.id === el.dataset.id);
    if (activeProducts().some(p => p.warehouseId === w.id)) return toast('لا يمكن حذف مخزن فيه منتجات — انقلها أولاً بالتعديل الجماعي', 'error');
    if (!await confirmBox('حذف المخزن "' + w.name + '"؟', 'حذف', true)) return;
    const x = W(); x.delete(col('warehouses').doc(w.id)); x.log('delete', 'warehouse', w.id, w.name, null);
    try { await x.commit(); toast('تم الحذف'); } catch (e) { toast(authErr(e), 'error'); }
  },
  'wh-products': el => setTimeout(() => { const s = document.getElementById('pWh'); if (s) { s.dataset.want = el.dataset.id; renderProducts(); } }, 30)
});

// ═══ ملصقات الباركود ═══
page('labels', {
  t: 'ملصقات الباركود', ic: '🏷', deps: ['products'],
  html: () => `<div class="toolbar">
      <div class="grow" style="position:relative;min-width:220px"><input id="lAdd" placeholder="ابحث لإضافة قطعة… أو امسح الباركود"></div>
      <button class="btn ghost" data-action="labels-low">＋ كل المنخفض</button>
    </div>
    <div class="card mb"><div class="card-b"><div class="row">
      <label class="row small"><input type="checkbox" id="lName" checked> الاسم</label>
      <label class="row small"><input type="checkbox" id="lCode" checked> رقم القطعة</label>
      <label class="row small"><input type="checkbox" id="lPrice" checked> السعر</label>
      <select id="lType" class="auto"><option value="bar">باركود</option><option value="qr">QR</option></select>
      <select id="lSize" class="auto"><option value="a4">A4 — 3 أعمدة</option><option value="a4-4">A4 — 4 أعمدة</option><option value="roll">طابعة ملصقات 50×30mm</option></select>
      <span class="spacer"></span><button class="btn ghost" data-action="clear-labels">مسح القائمة</button><button class="btn primary" data-action="print-labels">🖨 طباعة</button>
    </div></div></div>
    <div class="card"><div class="table-wrap"><table class="t" id="lQueue"></table></div></div>`,
  init(el) {
    picker(el.querySelector('#lAdd'), { source: q => searchProducts(q, null, 10), render: pkProduct, exactFirst: true,
      onEnter: (q, inp) => { const p = findByCode(q); if (p) { labelAdd(p.id); inp.value = ''; return true; } return false; },
      onPick: (p, inp) => { inp.value = ''; labelAdd(p.id); } });
    el.querySelector('#lQueue').addEventListener('change', e => { const i = e.target.dataset.ln; if (i != null) S.labels[i].n = Math.max(1, parseInt(e.target.value) || 1); });
  },
  render: () => drawLabels()
});
function labelAdd(id) { const l = S.labels.find(x => x.id === id); if (l) l.n++; else S.labels.push({ id, n: 1 }); drawLabels(); }
function drawLabels() {
  const t = document.getElementById('lQueue'); if (!t) return;
  S.labels = S.labels.filter(l => S.products.get(l.id));
  const noBc = S.labels.filter(l => !S.products.get(l.id).barcode).length;
  t.innerHTML = S.labels.length ? '<thead><tr><th>القطعة</th><th>الباركود</th><th>السعر</th><th>عدد النسخ</th><th></th></tr></thead><tbody>' + S.labels.map((l, i) => { const p = S.products.get(l.id);
    return '<tr><td class="small"><b>' + esc(p.name) + '</b></td><td class="num small">' + (p.barcode ? esc(p.barcode) : '<span class="badge b-yellow">بدون — يُطبع رقم داخلي</span>') + '</td><td class="num small">' + money(p.price) + '</td>' +
      '<td><input type="number" min="1" class="mini num" style="width:70px" data-ln="' + i + '" value="' + l.n + '"></td><td><button class="btn sm ghost" data-action="label-rm" data-i="' + i + '">✕</button></td></tr>'; }).join('') + '</tbody>' +
    (noBc && isAdmin() ? '<tfoot><tr><td colspan="5"><button class="btn sm ghost" data-action="labels-genbc">توليد باركود لـ ' + noBc + ' قطعة بدون باركود</button></td></tr></tfoot>' : '')
    : '<tr><td><div class="empty"><div class="ico">🏷</div>ابحث عن قطع لإضافتها، أو حدد منتجات من صفحة المنتجات واضغط "ملصقات"</div></td></tr>';
}
function printLabels() {
  if (!S.labels.length) return toast('أضف قطعاً أولاً', 'error');
  const g = id => document.getElementById(id);
  const type = g('lType').value, size = g('lSize').value;
  const box = document.createElement('div');
  S.labels.forEach(l => {
    const p = S.products.get(l.id); if (!p) return;
    const code = p.barcode || p.id;
    for (let k = 0; k < l.n; k++) {
      const d = document.createElement('div'); d.className = 'label';
      if (g('lName').checked) { const b = document.createElement('b'); b.textContent = p.name; d.appendChild(b); }
      if (type === 'qr') { const q = document.createElement('div'); q.className = 'qr'; d.appendChild(q); new QRCode(q, { text: code, width: 80, height: 80 }); }
      else { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); d.appendChild(s);
        const fmt = /^\d{13}$/.test(code) ? 'EAN13' : 'CODE128';
        try { JsBarcode(s, code, { format: fmt, height: 36, width: 1.5, fontSize: 11, margin: 0 }); } catch (e) { JsBarcode(s, code, { format: 'CODE128', height: 36, width: 1.4, fontSize: 11, margin: 0 }); } }
      const info = [g('lCode').checked ? partCode(p.name, p.brand) : '', g('lPrice').checked && num(p.price) > 0 ? money(p.price) : ''].filter(Boolean).join(' · ');
      if (info) { const i = document.createElement('div'); i.className = 'li'; i.textContent = info; d.appendChild(i); }
      box.appendChild(d);
    }
  });
  printHTML('<div class="labels ' + size + '">' + box.innerHTML + '</div>', size === 'roll' ? 'roll' : 'labels');
}
act({
  'label-rm': el => { S.labels.splice(+el.dataset.i, 1); drawLabels(); },
  'clear-labels': () => { S.labels = []; drawLabels(); },
  'print-labels': printLabels,
  'labels-low': () => { activeProducts().filter(p => num(p.qty) <= num(p.minQty)).forEach(p => { if (!S.labels.find(l => l.id === p.id)) S.labels.push({ id: p.id, n: 1 }); }); drawLabels(); },
  'labels-genbc': async () => { const taken = new Set(activeProducts().map(p => p.barcode));
    const res = await bulkApply('توليد باركود للملصقات', S.labels.map(l => S.products.get(l.id)).filter(p => p && !p.barcode).map(p => ({ id: p.id, set: { barcode: newBarcode(taken) } })));
    undoToast(res, 'توليد باركود'); setTimeout(drawLabels, 500); }
});

// ═══ Excel ═══
const XL_MAP = {
  'المعرف (للاستيراد)': 'id', 'id': 'id', 'اسم المنتج': 'name', 'الاسم': 'name', 'المنتج': 'name', 'name': 'name', 'الباركود': 'barcode', 'barcode': 'barcode',
  'النوع / القسم': 'category', 'القسم': 'category', 'الفئه': 'category', 'النوع': 'category', 'category': 'category',
  'الماركه / الشركه': 'brand', 'الماركه': 'brand', 'الشركه': 'brand', 'brand': 'brand', 'الوحده': 'unit', 'unit': 'unit',
  'الكميه': 'qty', 'العدد': 'qty', 'qty': 'qty', 'حد التنبيه': 'minQty', 'الحد الادني': 'minQty',
  'سعر الشراء': 'cost', 'التكلفه': 'cost', 'cost': 'cost', 'سعر البيع': 'price', 'السعر': 'price', 'price': 'price',
  'الموقع في المخزن': 'location', 'الموقع': 'location', 'المخزن': 'warehouse', 'الوصف': 'desc', 'يظهر للزبائن': 'showInStore'
};
const xlKey = h => XL_MAP[normAr(String(h).trim())] || XL_MAP[String(h).trim().toLowerCase()];
page('excel', {
  t: 'Excel', ic: '📗',
  html: () => `<div class="dash-grid">
    <div class="card"><div class="card-h"><h3>⬇ تصدير</h3></div><div class="card-b stack">
      <button class="btn primary block" data-action="export-dialog">📦 المنتجات (اختر الماركة، القسم، الأعمدة…)</button>
      <a class="btn ghost block" href="#invoices">🧾 الفواتير ← من صفحة الفواتير</a>
      <button class="btn ghost block" data-action="export-customers">👥 الزبائن والديون</button>
      <a class="btn ghost block" href="#ledger">🔄 حركة المخزون ← من صفحتها</a>
      <a class="btn ghost block admin-only" href="#reports">📊 التقارير ← من صفحتها</a>
    </div></div>
    <div class="card admin-only"><div class="card-h"><h3>⬆ استيراد / تحديث منتجات</h3></div><div class="card-b">
      <p class="small mb"><b>طريقة سريعة لتعديل الأسعار:</b> صدّر المنتجات مع عمود "المعرّف"، عدّل الأسعار في Excel، ثم استورد الملف هنا — يتحدث كل منتج حسب معرّفه.</p>
      <p class="muted small mb">بدون معرّف: يُطابق بالباركود ثم بالاسم. الجديد يُضاف. لا يُحذف أي شيء. فقط الأعمدة الموجودة بالملف تتغير.</p>
      <button class="btn ghost block mb" data-action="xl-template">📄 تحميل قالب فارغ</button>
      <label class="btn primary block">📂 اختيار ملف Excel<input type="file" id="importFile" accept=".xlsx,.xls,.csv" hidden></label>
    </div></div></div>`,
  init(el) { el.querySelector('#importFile').addEventListener('change', importFile); },
  render() { document.querySelectorAll('#pg-excel .admin-only').forEach(x => x.classList.toggle('hidden', !isAdmin())); }
});
async function importFile(e) {
  const file = e.target.files[0]; e.target.value = '';
  if (!file || !needXlsx()) return;
  let rows;
  try { const wb = XLSX.read(await file.arrayBuffer()); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }); }
  catch (err) { return toast('تعذر قراءة الملف', 'error'); }
  const ps = activeProducts(), byId = new Map(ps.map(p => [p.id, p]));
  const items = rows.map(r => {
    const o = {};
    Object.keys(r).forEach(h => { const k = xlKey(h); if (k) o[k] = typeof r[h] === 'string' ? r[h].trim() : r[h]; });
    if (o.barcode != null) o.barcode = String(o.barcode).trim();
    if (o.id != null) o.id = String(o.id).trim();
    const match = (o.id && byId.get(o.id)) || (o.barcode && ps.find(p => p.barcode === o.barcode)) || (o.name && ps.find(p => normAr(p.name) === normAr(o.name)));
    return { o, match };
  }).filter(x => (x.o.name && !/^المجموع/.test(String(x.o.name))) || x.match);
  if (!items.length) return toast('لم أجد صفوفاً صالحة — تأكد أن الصف الأول فيه أسماء الأعمدة', 'error');
  // حساب التغييرات فقط
  const nums = ['minQty', 'cost', 'price', 'qty'];
  const prepared = items.map(({ o, match }) => {
    const d = {};
    ['name', 'barcode', 'category', 'brand', 'unit', 'location', 'desc'].forEach(k => { if (o[k] != null && o[k] !== '') d[k] = String(o[k]); });
    nums.forEach(k => { if (o[k] !== '' && o[k] != null && isFinite(num(o[k], NaN))) d[k] = num(o[k]); });
    if (o.warehouse) { const w = S.warehouses.find(x => normAr(x.name) === normAr(o.warehouse)); if (w) d.warehouseId = w.id; }
    if (o.showInStore !== '' && o.showInStore != null) d.showInStore = !/^(لا|no|false|0)$/i.test(String(o.showInStore).trim());
    if (!match) {
      // منتج "جديد" لكن يطابق منتجاً موجوداً بالباركود أو رقم القطعة أو الاسم → مكرر محتمل
      const dd = findDuplicates({ name: d.name, barcode: d.barcode, brand: d.brand }).filter(x => x.level !== 'similar');
      if (dd.length) {
        const cand = dd[0].p, ch = {};
        Object.keys(d).forEach(k => { if (k !== 'name' && String(cand[k] == null ? '' : cand[k]) !== String(d[k])) ch[k] = d[k]; });
        return { kind: 'dup', d, match: cand, ch, why: dd[0].why };
      }
      return { kind: 'new', d };
    }
    const ch = {};
    Object.keys(d).forEach(k => { if (String(match[k] == null ? '' : match[k]) !== String(d[k])) ch[k] = d[k]; });
    return { kind: Object.keys(ch).length ? 'upd' : 'same', match, ch };
  });
  const nNew = prepared.filter(x => x.kind === 'new').length, upd = prepared.filter(x => x.kind === 'upd'), dupRows = prepared.filter(x => x.kind === 'dup');
  const fieldCount = {}; upd.forEach(u => Object.keys(u.ch).forEach(k => fieldCount[k] = (fieldCount[k] || 0) + 1));
  const FN = { name: 'الاسم', barcode: 'الباركود', category: 'القسم', brand: 'الماركة', unit: 'الوحدة', qty: 'الكمية', minQty: 'حد التنبيه', cost: 'الشراء', price: 'البيع', location: 'الموقع', desc: 'الوصف', warehouseId: 'المخزن', showInStore: 'الظهور' };
  const m = modal('mImport', 'معاينة استيراد ' + file.name,
    '<div class="stats sm">' + statCard('🆕', 'green', fmtN(nNew), 'منتج جديد') + statCard('✏️', 'yellow', fmtN(upd.length), 'منتج سيتحدث') + statCard('＝', 'blue', fmtN(prepared.length - nNew - upd.length - dupRows.length), 'بدون تغيير') +
      (dupRows.length ? statCard('👯', 'red', fmtN(dupRows.length), 'مكرر محتمل') : '') + '</div>' +
    (dupRows.length ? '<div class="dup-panel mb"><h4>👯 ' + dupRows.length + ' صف يبدو أنه منتج موجود مسبقاً</h4><label class="row mb"><input type="checkbox" id="impMergeDup" checked> دمجها مع الموجود (تحديث بدل إضافة نسخة ثانية) — <b>موصى به</b></label>' +
      dupRows.slice(0, 40).map(x => '<div class="small">• <b>' + esc(x.d.name || '') + '</b> ← ' + esc(x.match.name) + ' <span class="badge b-yellow">' + esc(x.why) + '</span> <span class="muted">' + esc(placeText(x.match)) + '</span></div>').join('') + '</div>' : '') +
    (upd.length ? '<p class="small mb">الحقول المتغيرة: ' + Object.entries(fieldCount).map(([k, n]) => '<span class="badge b-gray">' + (FN[k] || k) + ' ' + n + '</span>').join(' ') + '</p>' : '') +
    '<div class="table-wrap" style="max-height:45vh"><table class="t"><thead><tr><th></th><th>المنتج</th><th>التغيير</th></tr></thead><tbody>' +
    prepared.filter(x => x.kind !== 'same').slice(0, 300).map(x => x.kind === 'new' ? '<tr><td><span class="badge b-green">جديد</span></td><td class="small">' + esc(x.d.name || '') + '</td><td class="small num">' + (x.d.qty != null ? 'كمية ' + x.d.qty : '') + (x.d.price != null ? ' · سعر ' + fmtN(x.d.price) : '') + '</td></tr>'
      : '<tr><td><span class="badge b-yellow">تحديث</span></td><td class="small">' + esc(x.match.name) + '</td><td class="small">' + Object.keys(x.ch).map(k => (FN[k] || k) + ': ' + esc(x.match[k] == null ? '—' : x.match[k]) + ' ← <b>' + esc(x.ch[k]) + '</b>').join(' · ') + '</td></tr>').join('') +
    '</tbody></table></div>' +
    (upd.some(u => 'qty' in u.ch) ? '<div class="field mt"><label class="f">الكميات في الملف تعني</label><select id="impQtyMode"><option value="set">الكمية الفعلية الآن (جرد)</option><option value="add">كمية تُضاف للموجود (استلام)</option></select></div>' : ''),
    '<button class="btn primary" id="importGo"' + (!nNew && !upd.length && !dupRows.length ? ' disabled' : '') + '>تنفيذ</button><button class="btn ghost" data-close="mImport">إلغاء</button>', 'lg');
  m.querySelector('#importGo').onclick = async () => {
    const btn = m.querySelector('#importGo'); btn.disabled = true;
    const qtyMode = (m.querySelector('#impQtyMode') || {}).value || 'set';
    const mergeDup = !m.querySelector('#impMergeDup') || m.querySelector('#impMergeDup').checked;
    const defWh = (S.warehouses[0] || {}).id || '';
    try {
      const w = W();
      prepared.forEach(x => { if (x.kind === 'dup') x.kind = mergeDup ? 'upd' : 'new'; });
      prepared.forEach(x => {
        if (x.kind === 'new') {
          const ref = col('products').doc();
          const full = Object.assign({ barcode: '', category: 'أخرى', brand: '', unit: 'قطعة', minQty: num(S.settings.minstock, 5), cost: 0, price: 0, location: '', desc: '',
            warehouseId: defWh, showInStore: true, deleted: false, createdAt: TS(), updatedAt: TS(), updatedBy: S.user.email }, x.d, { qty: 0 });
          w.set(ref, full);
          if (num(x.d.qty)) stockMove(w, Object.assign({ id: ref.id }, full), num(x.d.qty), 'import', { note: file.name });
        } else if (x.kind === 'upd') {
          const ch = Object.assign({}, x.ch); const q = ch.qty; delete ch.qty;
          if (Object.keys(ch).length) w.update(col('products').doc(x.match.id), Object.assign(ch, { updatedAt: TS(), updatedBy: S.user.email }));
          if (q != null) qtyMode === 'add' ? stockMove(w, x.match, q, 'import', { note: file.name }) : stockMove(w, x.match, 0, 'import', { setTo: q, note: file.name });
        }
      });
      w.log('import', 'product', '', file.name, { new: nNew, updated: upd.length });
      w.catalog = true;
      await w.commit((i, n) => { btn.textContent = 'جاري الحفظ ' + i + '/' + n; });
      toast('تم الاستيراد: ' + nNew + ' جديد، ' + upd.length + ' تحديث'); closeModal('mImport');
    } catch (err) { toast(authErr(err), 'error'); btn.disabled = false; btn.textContent = 'تنفيذ'; }
  };
  openModal('mImport');
}
act({
  'xl-template': () => writeXlsx([['المنتجات', [{ 'اسم المنتج': 'بولبرين NU220', 'الباركود': '', 'النوع / القسم': 'ميكانيكي', 'الماركة / الشركة': 'FAG', 'الوحدة': 'قطعة', 'الكمية': 10, 'حد التنبيه': 2, 'سعر الشراء': 90000, 'سعر البيع': 120000, 'الموقع في المخزن': 'A-1', 'المخزن': (S.warehouses[0] || {}).name || '', 'الوصف': '', 'يظهر للزبائن': 'نعم' }]]], 'قالب-استيراد-المنتجات.xlsx')
});
