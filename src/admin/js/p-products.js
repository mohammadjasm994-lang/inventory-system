// ═══════════════════════════════════════════════════════════
// المنتجات: القائمة، الفلاتر، التحديد، نافذة المنتج، تعديل الكمية،
// التعديل الجماعي، التصدير المخصص
// ═══════════════════════════════════════════════════════════
const PSIZE = 100;
const PF = { limit: PSIZE, sort: 'updated' };

page('products', {
  t: 'المنتجات', ic: '📦', deps: ['products', 'warehouses', 'settings'],
  html: () => `
    <div class="toolbar">
      <div class="search grow"><span>🔍</span><input id="pSearch" placeholder="ابحث بالاسم، رقم القطعة، الباركود، الماركة... (قارئ الباركود يعمل هنا)"></div>
      <button class="btn ghost" data-action="product-scan" title="مسح بالكاميرا">📷</button>
      <button class="btn ghost ai-btn" data-action="ai-new" title="صوّر القطعة والذكاء الاصطناعي يعبّئ البيانات">🤖 إضافة بالكاميرا</button>
      <button class="btn primary" data-action="new-product">＋ منتج جديد</button>
    </div>
    <div class="toolbar filters-row">
      <select id="pCat" class="auto"></select>
      <select id="pBrand" class="auto"></select>
      <select id="pWh" class="auto"></select>
      <select id="pStock" class="auto">
        <option value="">كل الحالات</option><option value="ok">متوفر</option><option value="low">منخفض</option><option value="out">نفد</option>
        <option value="noPrice">بدون سعر</option><option value="noBarcode">بدون باركود</option><option value="noBrand">بدون ماركة</option>
        <option value="noImage">بدون صورة</option><option value="hidden">مخفي عن الزبائن</option><option value="dead">راكد (لم يُبع 90 يوم)</option>
      </select>
      <select id="pSort" class="auto">
        <option value="updated">الأحدث تعديلاً</option><option value="name">الاسم</option><option value="qtyAsc">الكمية ↑</option><option value="qtyDesc">الكمية ↓</option>
        <option value="priceDesc">السعر ↓</option><option value="valueDesc">قيمة المخزون ↓</option>
      </select>
      <button class="linkbtn" data-action="p-reset">مسح الفلاتر</button>
      <span class="spacer"></span>
      <button class="btn sm ghost" id="pEditBtn" data-action="toggle-quick-edit" title="تعديل الأسعار والكميات والمواقع مباشرة في الجدول">✏️ تعديل سريع</button>
      <button class="btn sm ghost" data-action="burst-photos" title="تصوير المنتجات واحداً تلو الآخر">📸 تصوير متتالي</button>
    </div>
    <div id="pEditHint" class="info-box hidden">✏️ <b>وضع التعديل السريع:</b> اكتب القيمة واضغط <kbd>Enter</kbd> للانتقال للمنتج الذي تحته — يُحفظ كل تغيير تلقائياً. تعديل الكمية يُسجَّل كـ"جرد" في حركة المخزون.</div>
    <div class="card">
      <div class="card-h"><span class="muted small" id="pCount"></span>
        <span id="selBar" class="sel-bar hidden"><b id="selN">0</b> محدد
          <button class="btn sm primary" data-action="export-selected">⬇ Excel</button>
          <button class="btn sm ghost" data-action="sel-labels">🏷 ملصقات</button>
          <button class="btn sm ghost admin-only" data-action="bulk-edit">✏️ تعديل جماعي</button>
          <button class="btn sm ghost admin-only" data-action="bulk-trash">🗑</button>
          <button class="btn sm ghost" data-action="sel-clear">✕</button></span>
        <span class="spacer"></span>
        <span class="small muted hide-sm" id="pTotals"></span>
        <button class="btn sm ghost" data-action="export-dialog">⬇ تصدير Excel…</button>
      </div>
      <div class="table-wrap"><table class="t" id="pTable"></table></div>
      <div id="pMore" class="empty hidden"><button class="btn ghost" data-action="more-products">عرض المزيد</button></div>
    </div>`,
  init(el) {
    el.querySelector('#pSearch').addEventListener('input', debounce(() => { PF.limit = PSIZE; renderProducts(); }, 180));
    el.querySelector('#pSearch').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = e.target.value.trim();
      const p = findByCode(q);
      if (p) { e.target.select(); openProduct(p.id); }
    });
    ['pCat', 'pBrand', 'pWh', 'pStock', 'pSort'].forEach(id => el.querySelector('#' + id).addEventListener('change', () => { PF.limit = PSIZE; renderProducts(); }));
    const t = el.querySelector('#pTable');
    t.addEventListener('change', e => { if (e.target.dataset.ie) quickSave(e.target); });
    t.addEventListener('keydown', e => {
      if (!e.target.dataset.ie || e.key !== 'Enter') return;
      e.preventDefault();
      const next = t.querySelector('[data-ie="' + e.target.dataset.ie + '"][data-row="' + (+e.target.dataset.row + (e.shiftKey ? -1 : 1)) + '"]');
      quickSave(e.target); // حفظ مباشر (لا نعتمد على حدث change)
      if (next) { next.focus(); next.select(); } else e.target.blur();
    });
  },
  enter(params) {
    if (params.filter) document.getElementById('pStock').value = params.filter;
    if (params.brand != null) document.getElementById('pBrand').dataset.want = params.brand;
    if (params.q) document.getElementById('pSearch').value = params.q;
    if (params.edit) { PF.edit = true; }
  },
  // أثناء الكتابة في وضع التعديل السريع لا نعيد رسم الجدول (حتى لا يضيع المؤشر)
  render: () => { if (PF.edit && document.activeElement && document.activeElement.closest && document.activeElement.closest('#pTable')) { PF.dirty = true; return; } renderProducts(); }
});

// ═══ التعديل السريع داخل الجدول ═══
const IE_FIELDS = () => [['barcode', 'الباركود', 'text', 1], ['location', 'الرف', 'text', 1], ['qty', 'الكمية', 'number', 1], ['minQty', 'حد التنبيه', 'number', 1], ['price', 'سعر البيع', 'number', 1], ['cost', 'سعر الشراء', 'number', isAdmin()]].filter(f => f[3]);
async function quickSave(inp) {
  const p = S.products.get(inp.dataset.id), k = inp.dataset.ie; if (!p) return;
  const raw = inp.value.trim();
  const v = inp.type === 'number' ? (raw === '' ? null : num(raw, NaN)) : raw;
  if (inp.type === 'number' && (v == null || isNaN(v))) { inp.value = p[k] == null ? '' : p[k]; return; }
  if (String(p[k] == null ? '' : p[k]) === String(v)) return;
  if (k === 'barcode' && v) {
    const d = findDuplicates({ barcode: v }, p.id).find(x => x.level === 'block');
    if (d) { toast('الباركود مستخدم لـ: ' + d.p.name + ' (' + placeText(d.p) + ')', 'error'); inp.value = p.barcode || ''; inp.classList.add('ie-err'); return; }
  }
  inp.classList.remove('ie-err'); inp.classList.add('ie-saving');
  try {
    const w = W();
    if (k === 'qty') stockMove(w, p, 0, 'count', { setTo: v, note: 'تعديل سريع' });
    else w.update(col('products').doc(p.id), { [k]: v, updatedAt: TS(), updatedBy: S.user.email });
    w.log(k === 'qty' ? 'stock-count' : 'update', 'product', p.id, p.name, { [k]: [p[k] == null ? null : p[k], v] });
    w.catalog = true;
    await w.commit();
    inp.classList.replace('ie-saving', 'ie-ok');
    setTimeout(() => inp.classList.remove('ie-ok'), 1200);
  } catch (e) { inp.classList.remove('ie-saving'); inp.classList.add('ie-err'); toast(authErr(e), 'error'); }
}
document.addEventListener('focusout', e => {
  // بعد الخروج من الجدول نرسم التحديثات المؤجلة
  if (PF.dirty && e.target.closest && e.target.closest('#pTable')) setTimeout(() => { if (!document.activeElement.closest('#pTable')) { PF.dirty = false; renderProducts(); } }, 300);
});

function fillSelect(id, first, entries) {
  const el = document.getElementById(id); if (!el) return;
  const cur = el.dataset.want != null ? el.dataset.want : el.value;
  delete el.dataset.want;
  el.innerHTML = '<option value="">' + first + '</option>' + entries.map(([v, t]) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
}
function productFilterLists() {
  const ps = activeProducts();
  const cnt = f => { const m = {}; ps.forEach(p => { const k = f(p); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  fillSelect('pCat', 'كل الأقسام', cnt(p => p.category).map(([k, n]) => [k, k + ' (' + n + ')']));
  fillSelect('pBrand', 'كل الماركات', cnt(p => normBrand(p.brand)).map(([k, n]) => [k, k + ' (' + n + ')']));
  fillSelect('pWh', 'كل المخازن', S.warehouses.map(w => [w.id, w.name]));
}
function filteredProducts() {
  const q = document.getElementById('pSearch').value.trim();
  const cat = document.getElementById('pCat').value, br = document.getElementById('pBrand').value;
  const wh = document.getElementById('pWh').value, st = document.getElementById('pStock').value;
  const deadT = Date.now() - 90 * 864e5;
  let list = activeProducts().filter(p => {
    if (cat && p.category !== cat) return false;
    if (br && normBrand(p.brand) !== br) return false;
    if (wh && p.warehouseId !== wh && !(whQ(p, wh) > 0)) return false;
    const q0 = num(p.qty), mn = num(p.minQty);
    switch (st) {
      case 'ok': return q0 > mn;
      case 'low': return q0 > 0 && q0 <= mn;
      case 'out': return q0 <= 0;
      case 'noPrice': return !(num(p.price) > 0);
      case 'noBarcode': return !p.barcode;
      case 'noBrand': return !p.brand;
      case 'noImage': return !imgSrc(p);
      case 'hidden': return p.showInStore === false;
      case 'dead': return q0 > 0 && tsMillis(p.lastSoldAt) < deadT && tsMillis(p.createdAt) < deadT;
    }
    return true;
  });
  if (q) return searchProducts(q, list);
  const sort = document.getElementById('pSort').value;
  const by = {
    updated: (a, b) => tsMillis(b.updatedAt || b.createdAt) - tsMillis(a.updatedAt || a.createdAt),
    name: (a, b) => (a.name || '').localeCompare(b.name || '', 'ar'),
    qtyAsc: (a, b) => num(a.qty) - num(b.qty), qtyDesc: (a, b) => num(b.qty) - num(a.qty),
    priceDesc: (a, b) => num(b.price) - num(a.price),
    valueDesc: (a, b) => num(b.qty) * num(b.price) - num(a.qty) * num(a.price)
  }[sort];
  return list.sort(by);
}
function renderProducts() {
  if (!document.getElementById('pTable')) return;
  productFilterLists();
  document.querySelectorAll('#pg-products .admin-only').forEach(b => b.classList.toggle('hidden', !isAdmin()));
  const list = filteredProducts();
  document.getElementById('pCount').textContent = fmtN(list.length) + ' منتج';
  const units = list.reduce((a, p) => a + Math.max(0, num(p.qty)), 0);
  document.getElementById('pTotals').textContent = 'القطع: ' + fmtN(units) + ' · قيمة البيع: ' + money(list.reduce((a, p) => a + Math.max(0, num(p.qty)) * num(p.price), 0));
  updateSelBar();
  const shown = list.slice(0, PF.limit);
  document.getElementById('pMore').classList.toggle('hidden', list.length <= PF.limit);
  const t = document.getElementById('pTable');
  document.getElementById('pEditBtn').classList.toggle('primary', !!PF.edit);
  document.getElementById('pEditBtn').classList.toggle('ghost', !PF.edit);
  document.getElementById('pEditHint').classList.toggle('hidden', !PF.edit);
  if (!list.length) { t.innerHTML = '<tr><td><div class="empty"><div class="ico">📦</div>لا توجد منتجات مطابقة</div></td></tr>'; return; }
  if (PF.edit) {
    const fs = IE_FIELDS();
    t.innerHTML = '<thead><tr><th>المنتج</th>' + fs.map(f => '<th>' + f[1] + '</th>').join('') + '</tr></thead><tbody>' +
      shown.map((p, i) => '<tr><td><div class="pcell">' + thumbHtml(p) + '<div><b class="pn">' + esc(p.name) + '</b><span class="small muted">' + esc([normBrand(p.brand), whName(p.warehouseId)].filter(Boolean).join(' · ')) + '</span></div></div></td>' +
        fs.map(f => '<td><input class="ie' + (f[2] === 'number' ? ' num' : '') + (f[0] === 'price' && !(num(p.price) > 0) ? ' ie-empty' : '') + '" type="' + f[2] + '"' + (f[2] === 'number' ? ' step="any"' : '') +
          ' data-ie="' + f[0] + '" data-id="' + esc(p.id) + '" data-row="' + i + '" value="' + esc(p[f[0]] == null ? '' : p[f[0]]) + '" aria-label="' + f[1] + ' — ' + esc(p.name) + '"></td>').join('') + '</tr>').join('') + '</tbody>';
    return;
  }
  const allOn = shown.every(p => S.sel.has(p.id));
  t.innerHTML = '<thead><tr><th class="ck"><input type="checkbox" data-sel-all' + (allOn ? ' checked' : '') + ' title="تحديد الظاهر"></th><th>المنتج</th><th class="hide-sm">رقم القطعة / الباركود</th><th class="hide-sm">القسم</th><th class="hide-sm">المخزن</th><th>الكمية</th><th>السعر</th>' +
    (isAdmin() ? '<th class="hide-sm">الشراء</th>' : '') + '<th></th></tr></thead><tbody>' +
    shown.map(p => '<tr class="clickable' + (S.sel.has(p.id) ? ' picked' : '') + '" data-action="edit-product" data-id="' + esc(p.id) + '">' +
      '<td class="ck"><input type="checkbox" data-sel="' + esc(p.id) + '"' + (S.sel.has(p.id) ? ' checked' : '') + '></td>' +
      '<td><div class="pcell">' + thumbHtml(p) + '<div><b class="pn">' + esc(p.name) + '</b><span class="small muted">' + esc([normBrand(p.brand), p.location].filter(Boolean).join(' · ')) +
      (p.showInStore === false ? ' <span class="badge b-gray">مخفي</span>' : '') + '</span></div></div></td>' +
      '<td class="hide-sm"><span class="code">' + esc(partCode(p.name, p.brand) || '—') + '</span><div class="small muted num">' + esc(p.barcode || '') + '</div></td>' +
      '<td class="hide-sm"><span class="badge b-blue">' + esc(p.category || '—') + '</span></td>' +
      '<td class="hide-sm small">' + esc(whName(p.warehouseId)) + '</td>' +
      '<td><b class="num">' + fmtN(p.qty) + '</b> <span class="small muted">' + esc(p.unit || '') + '</span><br>' + stockBadge(p) + '</td>' +
      '<td class="num">' + (num(p.price) > 0 ? money(p.price) : '<span class="badge b-yellow">بدون سعر</span>') + '</td>' +
      (isAdmin() ? '<td class="hide-sm num muted">' + money(p.cost) + '</td>' : '') +
      '<td><div class="acts"><button class="btn sm ghost" data-action="stock-adjust" data-id="' + esc(p.id) + '" title="تعديل الكمية">±</button>' +
      (isAdmin() ? '<button class="btn sm ghost" data-action="del-product" data-id="' + esc(p.id) + '" title="نقل للمحذوفات">🗑</button>' : '') + '</div></td></tr>').join('') + '</tbody>';
}

// ═══ التحديد ═══
window.onSelectBox = cb => {
  if (cb.hasAttribute('data-sel-all')) {
    filteredProducts().slice(0, PF.limit).forEach(p => cb.checked ? S.sel.add(p.id) : S.sel.delete(p.id));
    renderProducts();
  } else {
    cb.checked ? S.sel.add(cb.dataset.sel) : S.sel.delete(cb.dataset.sel);
    const tr = cb.closest('tr'); if (tr) tr.classList.toggle('picked', cb.checked);
  }
  updateSelBar();
};
function updateSelBar() {
  [...S.sel].forEach(id => { const p = S.products.get(id); if (!p || p.deleted) S.sel.delete(id); });
  const bar = document.getElementById('selBar'); if (!bar) return;
  bar.classList.toggle('hidden', !S.sel.size);
  document.getElementById('selN').textContent = fmtN(S.sel.size);
}
const selected = () => [...S.sel].map(id => S.products.get(id)).filter(p => p && !p.deleted);

// ═══ نافذة المنتج ═══
let PM = { id: null, img: null, imgChanged: false };
function openProduct(id, prefill) {
  const p = id ? S.products.get(id) : null;
  if (id && !p) return toast('المنتج غير موجود', 'error');
  PM = { id: id || null, img: null, imgChanged: false };
  const d = Object.assign({ unit: 'قطعة', qty: 0, minQty: S.settings.minstock, cost: 0, price: 0, showInStore: true, warehouseId: (S.warehouses[0] || {}).id || '' }, p || {}, prefill || {});
  const whOpts = S.warehouses.map(w => '<option value="' + esc(w.id) + '"' + (w.id === d.warehouseId ? ' selected' : '') + '>' + esc((w.icon || '') + ' ' + w.name) + '</option>').join('') || '<option value="">— أضف مخزناً —</option>';
  const v = k => esc(d[k] == null ? '' : d[k]);
  const body =
    (p ? '<div class="tabs mb" id="pmTabs"><div class="tab on" data-tab="info">البيانات</div><div class="tab" data-tab="moves">حركة المخزون</div>' + (isAdmin() ? '<div class="tab" data-tab="log">السجل</div>' : '') + '</div>' : '') +
    '<div data-pane="info"><form id="productForm"><div class="pform">' +
    '<div class="img-pick"><div id="mpImg" class="img-box">📷<span class="small muted">صورة المنتج</span></div>' +
    '<div class="row mt"><label class="btn sm ghost grow">📷 صورة<input type="file" id="mpImgFile" accept="image/*" hidden></label><button type="button" class="btn sm ghost" data-action="rm-img">حذف</button></div>' +
    (S.settings.aiOn !== false ? '<button type="button" class="btn sm ai-btn block mt" data-action="ai-fill">🤖 تعبئة ذكية</button>' : '') + '</div>' +
    '<div class="grow"><div class="field"><label class="f">اسم المنتج *</label><input name="name" required value="' + v('name') + '"></div>' +
    '<div class="field"><label class="f">الباركود</label><div class="row"><input name="barcode" class="grow num" value="' + v('barcode') + '">' +
    '<button type="button" class="btn ghost sm" data-action="scan-field">📷</button><button type="button" class="btn ghost sm" data-action="gen-barcode">توليد</button></div></div></div></div>' +
    '<div id="dupPanel" class="dup-panel hidden" aria-live="polite"></div>' +
    '<div class="grid3">' +
    '<div class="field"><label class="f">القسم</label><input name="category" list="catList" value="' + v('category') + '"></div>' +
    '<div class="field"><label class="f">الماركة / الشركة</label><input name="brand" list="brandList" value="' + v('brand') + '"></div>' +
    '<div class="field"><label class="f">الوحدة</label><input name="unit" list="unitList" value="' + v('unit') + '"></div>' +
    '<div class="field"><label class="f">الكمية' + (p ? ' <button type="button" class="linkbtn" data-action="stock-adjust" data-id="' + esc(p.id) + '">± تعديل</button>' : ' الافتتاحية') + '</label><input name="qty" type="number" step="any" value="' + v('qty') + '"' + (p ? ' disabled title="غيّر الكمية من زر ± حتى تُسجَّل الحركة"' : '') + '></div>' +
    '<div class="field"><label class="f">حد التنبيه</label><input name="minQty" type="number" step="any" value="' + v('minQty') + '"></div>' +
    '<div class="field"><label class="f">المخزن</label><select name="warehouseId">' + whOpts + '</select></div>' +
    (isAdmin() ? '<div class="field"><label class="f">سعر الشراء (التكلفة)</label><input name="cost" type="number" step="any" value="' + v('cost') + '"></div>' : '') +
    '<div class="field"><label class="f">سعر البيع' + (isAdmin() ? ' <span class="small muted" id="mpMargin"></span>' : '') + '</label><input name="price" type="number" step="any" value="' + v('price') + '"></div>' +
    '<div class="field"><label class="f">الموقع في المخزن</label><input name="location" placeholder="A-1" value="' + v('location') + '"></div>' +
    '<div class="field"><label class="f">سعر الجملة <span class="small muted">(لزبائن الجملة)</span></label><input name="price2" type="number" step="any" value="' + v('price2') + '"></div>' +
    '</div><details class="pack-box"' + (d.packQty ? ' open' : '') + '><summary>📦 تعبئة (كرتون / علبة) — اختياري</summary><div class="grid3">' +
    '<div class="field"><label class="f">اسم التعبئة</label><input name="packName" placeholder="كرتون" value="' + v('packName') + '"></div>' +
    '<div class="field"><label class="f">كم قطعة فيها</label><input name="packQty" type="number" min="0" step="any" value="' + v('packQty') + '"></div>' +
    '<div class="field"><label class="f">باركود التعبئة</label><input name="packBarcode" class="num" value="' + v('packBarcode') + '"></div></div>' +
    '<p class="small muted">مسح باركود الكرتون عند البيع أو الشراء يضيف كل قطعه دفعة واحدة.</p></details><div class="field"><label class="f">الوصف / المواصفات</label><textarea name="desc">' + esc(d.desc || '') + '</textarea></div>' +
    (p && S.warehouses.length > 1 ? '<div class="wh-break"><b>الكمية حسب المخزن:</b> ' + whList(p).map(([w, v]) => '<span class="badge b-gray">' + esc(whName(w)) + ': <b class="num">' + fmtN(v) + '</b></span>').join(' ') +
      ' <button type="button" class="linkbtn" data-action="transfer-product" data-id="' + esc(p.id) + '">🔀 نقل لمخزن آخر</button></div>' : '') +
    '<label class="row"><input type="checkbox" name="showInStore"' + (d.showInStore !== false ? ' checked' : '') + '> يظهر في موقع الزبائن</label>' +
    (p ? '<div class="small muted mt">آخر تعديل: ' + fmtDate(p.updatedAt) + (p.updatedBy ? ' — ' + esc(p.updatedBy) : '') + (p.lastSoldAt ? ' · آخر بيع: ' + fmtDate(p.lastSoldAt) : '') + '</div>' : '') +
    '</form></div>' +
    (p ? '<div data-pane="moves" class="hidden"><div class="spinner"></div></div><div data-pane="log" class="hidden"><div class="spinner"></div></div>' : '');
  const foot = '<button class="btn primary" data-action="save-product">💾 حفظ</button><button class="btn ghost" data-close="mProduct">إلغاء</button>' +
    (p ? '<span class="spacer"></span><button class="btn ghost" data-action="dup-product" data-id="' + esc(p.id) + '" title="منتج جديد بنفس البيانات">⧉ نسخ</button>' : '');
  const m = modal('mProduct', p ? p.name : 'منتج جديد', body, foot, 'lg');
  if (!document.getElementById('catList')) document.body.insertAdjacentHTML('beforeend', '<datalist id="catList"></datalist><datalist id="brandList"></datalist><datalist id="unitList"><option>قطعة</option><option>متر</option><option>كيلو</option><option>طن</option><option>لتر</option><option>علبة</option><option>كرتون</option><option>طقم</option></datalist>');
  const ps = activeProducts();
  document.getElementById('catList').innerHTML = [...new Set(ps.map(x => x.category).filter(Boolean))].map(c => '<option>' + esc(c) + '</option>').join('');
  document.getElementById('brandList').innerHTML = [...new Set(ps.map(x => normBrand(x.brand)).filter(Boolean))].map(c => '<option>' + esc(c) + '</option>').join('');
  setImgBox(imgSrc(d) || null);
  if (p && (p.hasImage || p.imageUrl)) Images.full(p).then(src => { if (PM.id === p.id && !PM.imgChanged && src) setImgBox(src); });
  m.querySelector('#mpImgFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) { PM.img = await compressImage(f, 1000, 0.8); PM.imgChanged = true; setImgBox(PM.img); }
  });
  const form = m.querySelector('#productForm');
  const margin = () => {
    const el = m.querySelector('#mpMargin'); if (!el) return;
    const c = num(form.elements.cost.value), pr = num(form.elements.price.value);
    el.textContent = c > 0 && pr > 0 ? '(ربح ' + Math.round((pr - c) / c * 100) + '%)' : '';
  };
  form.addEventListener('input', margin); margin();
  // كشف المكرر أثناء الكتابة: الباركود، رقم القطعة، الاسم
  const dupCheck = () => renderDupPanel(form, PM.id);
  form.addEventListener('input', debounce(e => { if (['name', 'barcode', 'brand'].includes(e.target.name)) dupCheck(); }, 250));
  dupCheck();
  if (p) {
    m.querySelector('#pmTabs').addEventListener('click', e => {
      const t = e.target.closest('[data-tab]'); if (!t) return;
      m.querySelectorAll('#pmTabs .tab').forEach(x => x.classList.toggle('on', x === t));
      m.querySelectorAll('[data-pane]').forEach(x => x.classList.toggle('hidden', x.dataset.pane !== t.dataset.tab));
      m.querySelector('.modal-foot').classList.toggle('hidden', t.dataset.tab !== 'info');
      if (t.dataset.tab === 'moves') loadMoves(p.id, m.querySelector('[data-pane=moves]'));
      if (t.dataset.tab === 'log') loadProductLog(p.id, m.querySelector('[data-pane=log]'));
    });
  }
  openModal('mProduct');
  if (!p) setTimeout(() => form.elements.name.focus(), 100);
}
function renderDupPanel(form, excludeId) {
  const box = document.getElementById('dupPanel'); if (!box) return [];
  const el = form.elements;
  const dups = findDuplicates({ name: el.name.value, barcode: el.barcode.value, brand: el.brand.value }, excludeId);
  if (!dups.length) { box.classList.add('hidden'); return dups; }
  const lvl = dups[0].level;
  box.className = 'dup-panel' + (lvl === 'block' ? ' block' : '');
  box.innerHTML = '<h4>' + (lvl === 'block' ? '⛔ هذا الباركود مسجل لمنتج آخر — لا يمكن تكراره' : lvl === 'strong' ? (excludeId ? '⚠️ يوجد منتج آخر مطابق — قد يكون مكرراً' : '⚠️ هذا المنتج مسجل مسبقاً — لا تضفه مرتين') : 'ℹ️ منتجات مشابهة — تأكد أنه ليس نفس المنتج') + '</h4>' +
    dupListHtml(dups, true);
  return dups;
}
function setImgBox(src) {
  const b = document.getElementById('mpImg'); if (!b) return;
  b.innerHTML = src ? '<img src="' + esc(src) + '" alt="">' : '📷<span class="small muted">صورة المنتج</span>';
}
async function loadMoves(pid, el) {
  try {
    const qs = await col('stockMoves').where('pid', '==', pid).orderBy('at', 'desc').limit(60).get();
    el.innerHTML = qs.empty ? '<div class="empty small">لا توجد حركات مسجلة بعد</div>' : '<table class="t"><thead><tr><th>التاريخ</th><th>النوع</th><th>الكمية</th><th>قبل ← بعد</th><th class="hide-sm">المرجع</th></tr></thead><tbody>' +
      qs.docs.map(d => { const x = d.data(snapOpt); const t = MOVE_TYPES[x.type] || [x.type, 'b-gray'];
        return '<tr><td class="small">' + fmtDate(x.at) + '<div class="muted">' + esc((x.by || '').split('@')[0]) + '</div></td><td><span class="badge ' + t[1] + '">' + t[0] + '</span></td>' +
          '<td class="num"><b class="' + (x.delta < 0 ? 'red' : 'green') + '">' + (x.delta > 0 ? '+' : '') + fmtN(x.delta) + '</b></td><td class="num small">' + fmtN(x.before) + ' ← ' + fmtN(x.after) + '</td>' +
          '<td class="hide-sm small">' + esc(x.refNum || '') + (x.note ? '<div class="muted">' + esc(x.note) + '</div>' : '') + '</td></tr>'; }).join('') + '</tbody></table>';
  } catch (e) { el.innerHTML = '<p class="muted small">' + esc(authErr(e)) + '</p>'; }
}
async function loadProductLog(pid, el) {
  try {
    const qs = await col('logs').where('entityId', '==', pid).orderBy('at', 'desc').limit(50).get();
    el.innerHTML = qs.empty ? '<div class="empty small">لا يوجد سجل</div>' : qs.docs.map(d => logRow(d.data(snapOpt))).join('');
  } catch (e) { el.innerHTML = '<p class="muted small">' + esc(authErr(e)) + '</p>'; }
}

async function saveProduct() {
  const form = document.getElementById('productForm'), el = form.elements;
  const name = el.name.value.trim();
  if (!name) { toast('اسم المنتج مطلوب', 'error'); el.name.focus(); return; }
  const before = PM.id ? S.products.get(PM.id) : null;
  const barcode = el.barcode.value.trim();
  const dups = findDuplicates({ name, barcode, brand: el.brand.value }, PM.id);
  const blocked = dups.filter(d => d.level === 'block');
  if (blocked.length) {
    if (!S.settings.allowDupBarcode) {
      await choiceBox('⛔ الباركود مكرر', '<p class="mb">الباركود <b class="num">' + esc(barcode) + '</b> مسجل لهذا المنتج — نفس الباركود لا يمكن أن يكون لمنتجين:</p>' + dupListHtml(blocked, false) +
        '<p class="small muted mt">إذا كان نفس المنتج: افتحه وأضف له الكمية. إذا كان منتجاً مختلفاً: غيّر الباركود أو اضغط "توليد".</p>', []);
      return;
    }
    if (!await confirmBox('الباركود مكرر مع "' + blocked[0].p.name + '". الحفظ على أي حال؟', 'حفظ')) return;
  }
  const strong = dups.filter(d => d.level === 'strong');
  if (!before && strong.length) {
    const c = await choiceBox('⚠️ المنتج مسجل مسبقاً', '<p class="mb">وجدنا منتجاً مطابقاً — حتى لا تتوزع نفس القطعة في أماكن متفرقة، الأفضل إضافة الكمية للموجود:</p>' + dupListHtml(strong, false), [
      { label: '＋ إضافة الكمية للموجود', value: 'add', cls: 'primary' }, { label: 'فتح الموجود', value: 'open' }, { label: 'إضافة كمنتج منفصل رغم ذلك', value: 'new', cls: 'danger' }]);
    if (c === 'add') { const q = num(el.qty.value); closeModal('mProduct'); return stockAdjust(strong[0].p.id, { type: 'in', qty: q || '' }); }
    if (c === 'open') return openProduct(strong[0].p.id);
    if (c !== 'new') return;
  }
  const btn = document.querySelector('[data-action=save-product]'); if (btn) btn.disabled = true;
  try {
    const data = {
      name, barcode, category: el.category.value.trim() || 'أخرى', brand: el.brand.value.trim(), unit: el.unit.value.trim() || 'قطعة',
      minQty: num(el.minQty.value), price: num(el.price.value), location: el.location.value.trim(), desc: el.desc.value.trim(),
      warehouseId: el.warehouseId.value, showInStore: el.showInStore.checked, deleted: false, updatedAt: TS(), updatedBy: S.user.email,
      price2: num(el.price2.value), packName: el.packName.value.trim(), packQty: num(el.packQty.value), packBarcode: el.packBarcode.value.trim()
    };
    if (data.packBarcode) {
      const pd = findDuplicates({ barcode: data.packBarcode }, PM.id).find(x => x.level === 'block');
      if (pd || data.packBarcode === barcode) { toast('باركود التعبئة مستخدم: ' + (pd ? pd.p.name : 'نفس باركود القطعة'), 'error'); if (btn) btn.disabled = false; return; }
    }
    if (el.cost) data.cost = num(el.cost.value);
    const ref = PM.id ? col('products').doc(PM.id) : col('products').doc();
    const w = W();
    if (PM.imgChanged) Object.assign(data, await Images.put(w, ref.id, PM.img));
    if (!before) {
      data.createdAt = TS(); data.qty = 0; if (data.cost == null) data.cost = 0;
      w.set(ref, data);
      const q0 = num(el.qty.value);
      if (q0) stockMove(w, Object.assign({ id: ref.id, qty: 0 }, data), q0, 'init', { note: 'رصيد أول عند الإضافة' });
    } else w.update(ref, data);
    w.log(before ? 'update' : 'create', 'product', ref.id, name, diff(before, data));
    w.catalog = true;
    await w.commit();
    toast(before ? 'تم تحديث المنتج' : 'تمت إضافة المنتج');
    closeModal('mProduct');
  } catch (e) { toast(authErr(e), 'error'); }
  if (btn) btn.disabled = false;
}

async function trashProducts(list) {
  if (!list.length) return;
  if (!await confirmBox((list.length === 1 ? 'نقل "' + list[0].name + '"' : 'نقل ' + list.length + ' منتج') + ' إلى سلة المحذوفات؟\nيمكن استرجاعها لاحقاً.', 'حذف', true)) return;
  const w = W();
  list.forEach(p => { w.update(col('products').doc(p.id), { deleted: true, deletedAt: TS(), deletedBy: S.user.email, updatedAt: TS() }); w.log('delete', 'product', p.id, p.name, null); S.sel.delete(p.id); });
  w.catalog = true;
  try { await w.commit(); toast('نُقل إلى المحذوفات'); } catch (e) { toast(authErr(e), 'error'); }
}

// ═══ تعديل الكمية (يُسجّل في حركة المخزون) ═══
const ADJ_REASONS = { in: ['استلام بضاعة', 'مرتجع من زبون', 'تصحيح خطأ', 'أخرى'], out: ['تالف', 'مفقود', 'استهلاك داخلي', 'مرتجع للمورد', 'تصحيح خطأ', 'أخرى'], count: ['جرد'] };
function stockAdjust(id, preset) {
  const p = S.products.get(id); if (!p) return;
  const m = modal('mAdj', '± تعديل كمية: ' + p.name,
    '<p class="mb">الكمية الحالية: <b class="num" style="font-size:20px">' + fmtN(p.qty) + '</b> ' + esc(p.unit || '') + '</p>' +
    '<div class="seg mb" id="adjType"><button type="button" class="on" data-t="in">➕ إدخال</button><button type="button" data-t="out">➖ إخراج</button><button type="button" data-t="count">📋 جرد (الكمية الفعلية)</button></div>' +
    '<div class="grid2"><div class="field"><label class="f" id="adjLbl">الكمية المضافة</label><input id="adjQty" type="number" step="any" min="0" class="num"></div>' +
    '<div class="field"><label class="f">السبب</label><select id="adjReason"></select></div></div>' +
    '<div class="field"><label class="f">ملاحظة (اختياري)</label><input id="adjNote" placeholder="مثال: فاتورة المورد رقم 15"></div>' +
    '<div id="adjPrev" class="small muted mb"></div>',
    '<button class="btn primary" id="adjGo">حفظ</button><button class="btn ghost" data-close="mAdj">إلغاء</button>', 'sm');
  let type = 'in';
  const upd = () => {
    m.querySelectorAll('#adjType button').forEach(b => b.classList.toggle('on', b.dataset.t === type));
    m.querySelector('#adjLbl').textContent = type === 'in' ? 'الكمية المضافة' : type === 'out' ? 'الكمية المُخرجة' : 'الكمية الموجودة فعلياً';
    m.querySelector('#adjReason').innerHTML = ADJ_REASONS[type].map(r => '<option>' + r + '</option>').join('');
    prev();
  };
  const prev = () => {
    const q = num(m.querySelector('#adjQty').value, NaN);
    if (isNaN(q)) { m.querySelector('#adjPrev').textContent = ''; return; }
    const after = type === 'in' ? num(p.qty) + q : type === 'out' ? num(p.qty) - q : q;
    m.querySelector('#adjPrev').innerHTML = 'بعد الحفظ: <b class="num">' + fmtN(after) + '</b>' + (after < 0 ? ' <span class="red">⚠ سالب</span>' : '');
  };
  m.querySelector('#adjType').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { type = b.dataset.t; upd(); } });
  m.querySelector('#adjQty').addEventListener('input', prev);
  m.querySelector('#adjGo').onclick = async () => {
    const q = num(m.querySelector('#adjQty').value, NaN);
    if (isNaN(q) || q < 0) return toast('اكتب كمية صحيحة', 'error');
    const note = [m.querySelector('#adjReason').value, m.querySelector('#adjNote').value.trim()].filter(Boolean).join(' — ');
    const w = W();
    if (type === 'count') stockMove(w, p, 0, 'count', { setTo: q, note });
    else stockMove(w, p, type === 'in' ? q : -q, type, { note });
    if (!w.ops.length) { closeModal('mAdj'); return toast('لا يوجد تغيير', 'info'); }
    w.log('stock-' + type, 'product', p.id, p.name, { qty: [num(p.qty), w.qty[p.id]], note });
    try { await w.commit(); toast('تم تعديل الكمية'); closeModal('mAdj'); } catch (e) { toast(authErr(e), 'error'); }
  };
  if (preset) { type = preset.type || 'in'; m.querySelector('#adjQty').value = preset.qty == null ? '' : preset.qty; }
  upd(); openModal('mAdj');
  setTimeout(() => m.querySelector('#adjQty').focus(), 80);
}

// ═══ التعديل الجماعي (للمدير) ═══
function bulkEditDialog() {
  const list = selected();
  if (!list.length) return toast('حدد منتجات أولاً', 'info');
  const ps = activeProducts();
  const opts = arr => '<option value="">— بدون تغيير —</option>' + arr.map(x => '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>').join('');
  const cats = [...new Set(ps.map(p => p.category).filter(Boolean))].map(c => [c, c]);
  const m = modal('mBulk', '✏️ تعديل جماعي — ' + fmtN(list.length) + ' منتج',
    '<p class="muted small mb">اترك أي حقل على "بدون تغيير" حتى لا يتأثر. بعد التنفيذ يظهر زر <b>تراجع</b>.</p>' +
    '<div class="grid3">' +
    '<div class="field"><label class="f">القسم</label><select id="bkCat">' + opts(cats.concat([['__new', '+ قسم جديد…']])) + '</select></div>' +
    '<div class="field"><label class="f">الماركة</label><input id="bkBrand" list="brandList" placeholder="بدون تغيير"></div>' +
    '<div class="field"><label class="f">المخزن</label><select id="bkWh">' + opts(S.warehouses.map(w => [w.id, w.name])) + '</select></div>' +
    '<div class="field"><label class="f">الوحدة</label><input id="bkUnit" list="unitList" placeholder="بدون تغيير"></div>' +
    '<div class="field"><label class="f">حد التنبيه</label><input id="bkMin" type="number" step="any" placeholder="بدون تغيير"></div>' +
    '<div class="field"><label class="f">الظهور للزبائن</label><select id="bkShow"><option value="">— بدون تغيير —</option><option value="1">يظهر</option><option value="0">مخفي</option></select></div>' +
    '<div class="field"><label class="f">الموقع في المخزن</label><input id="bkLoc" placeholder="بدون تغيير"></div>' +
    '</div>' +
    '<h4 class="mt mb">💰 الأسعار</h4><div class="grid3">' +
    '<div class="field"><label class="f">طريقة تغيير سعر البيع</label><select id="bkPMode"><option value="">— بدون تغيير —</option><option value="set">تعيين سعر ثابت</option><option value="inc">زيادة بنسبة %</option><option value="dec">تخفيض بنسبة %</option><option value="add">زيادة مبلغ ثابت</option><option value="markup">سعر الشراء + نسبة ربح %</option><option value="usd">سعر الشراء بالدولار × سعر الصرف الحالي (' + fmtN(S.settings.exrate) + ') + ربح %</option></select></div>' +
    '<div class="field"><label class="f">القيمة</label><input id="bkPVal" type="number" step="any"></div>' +
    '<div class="field"><label class="f">التقريب لأقرب</label><select id="bkRound"><option value="0">بدون</option><option value="250">250</option><option value="500">500</option><option value="1000" selected>1,000</option><option value="5000">5,000</option></select></div>' +
    '</div><label class="row small mb"><input type="checkbox" id="bkOnlyPriced"> تطبيق السعر فقط على المنتجات اللي عندها سعر حالياً</label>' +
    '<div id="bkPrev"></div>',
    '<button class="btn primary" id="bkGo">تنفيذ</button><button class="btn ghost" data-close="mBulk">إلغاء</button>', 'lg');
  const g = id => m.querySelector('#' + id);
  const compute = () => {
    const mode = g('bkPMode').value, val = num(g('bkPVal').value, NaN), rnd = +g('bkRound').value, onlyP = g('bkOnlyPriced').checked;
    let cat = g('bkCat').value;
    if (cat === '__new') cat = g('bkCat').dataset.newVal || '';
    return list.map(p => {
      const set = {};
      if (cat) set.category = cat;
      if (g('bkBrand').value.trim()) set.brand = g('bkBrand').value.trim();
      if (g('bkWh').value) set.warehouseId = g('bkWh').value;
      if (g('bkUnit').value.trim()) set.unit = g('bkUnit').value.trim();
      if (g('bkMin').value !== '') set.minQty = num(g('bkMin').value);
      if (g('bkShow').value) set.showInStore = g('bkShow').value === '1';
      if (g('bkLoc').value.trim()) set.location = g('bkLoc').value.trim();
      if (mode && !isNaN(val) && !(onlyP && !(num(p.price) > 0))) {
        let np = num(p.price);
        if (mode === 'set') np = val;
        else if (mode === 'inc') np = np * (1 + val / 100);
        else if (mode === 'dec') np = np * (1 - val / 100);
        else if (mode === 'add') np = np + val;
        else if (mode === 'markup') np = num(p.cost) > 0 ? num(p.cost) * (1 + val / 100) : np;
        else if (mode === 'usd') np = num(p.costUsd) > 0 ? num(p.costUsd) * num(S.settings.exrate, 1300) * (1 + val / 100) : np;
        if (rnd) np = Math.round(np / rnd) * rnd;
        np = Math.max(0, Math.round(np));
        if (np !== num(p.price)) set.price = np;
      }
      return { id: p.id, p, set };
    });
  };
  const prev = () => {
    const ch = compute().filter(c => Object.keys(c.set).length);
    const priced = ch.filter(c => 'price' in c.set);
    g('bkPrev').innerHTML = '<div class="info-box">سيتغير <b>' + fmtN(ch.length) + '</b> منتج' + (priced.length ? '، منها ' + fmtN(priced.length) + ' تغيير سعر' : '') + '</div>' +
      (priced.length ? '<div class="table-wrap" style="max-height:220px"><table class="t"><thead><tr><th>المنتج</th><th>السعر الحالي</th><th>الجديد</th></tr></thead><tbody>' +
        priced.slice(0, 40).map(c => '<tr><td class="small">' + esc(c.p.name) + '</td><td class="num">' + money(c.p.price) + '</td><td class="num"><b>' + money(c.set.price) + '</b></td></tr>').join('') + '</tbody></table></div>' : '');
  };
  m.addEventListener('input', debounce(prev, 150));
  m.addEventListener('change', async e => {
    if (e.target.id === 'bkCat' && e.target.value === '__new') {
      const r = await promptBox('قسم جديد', [{ name: 'c', label: 'اسم القسم', required: true }], 'تم');
      if (r && r.c.trim()) { e.target.dataset.newVal = r.c.trim(); e.target.insertAdjacentHTML('beforeend', '<option value="__new" selected>' + esc(r.c.trim()) + '</option>'); e.target.value = '__new'; } else e.target.value = '';
    }
    prev();
  });
  g('bkGo').onclick = async () => {
    const ch = compute().filter(c => Object.keys(c.set).length);
    if (!ch.length) return toast('لم تحدد أي تغيير', 'info');
    if (!await confirmBox('تطبيق التعديل على ' + fmtN(ch.length) + ' منتج؟', 'تنفيذ')) return;
    g('bkGo').disabled = true;
    try {
      const res = await bulkApply('تعديل جماعي', ch.map(c => ({ id: c.id, set: c.set })));
      closeModal('mBulk'); undoToast(res, 'تعديل جماعي');
    } catch (e) { toast(authErr(e), 'error'); g('bkGo').disabled = false; }
  };
  prev(); openModal('mBulk');
}

// ═══ التصدير المخصص إلى Excel ═══
const EX_COLS = [
  { k: 'name', t: 'اسم المنتج', v: p => p.name || '', basic: 1 },
  { k: 'code', t: 'رقم القطعة', v: p => partCode(p.name, p.brand), basic: 1 },
  { k: 'barcode', t: 'الباركود', v: p => p.barcode || '', basic: 1 },
  { k: 'category', t: 'النوع / القسم', v: p => p.category || '', basic: 1 },
  { k: 'brand', t: 'الماركة / الشركة', v: p => normBrand(p.brand), basic: 1 },
  { k: 'unit', t: 'الوحدة', v: p => p.unit || '', basic: 1 },
  { k: 'qty', t: 'الكمية', v: p => num(p.qty), basic: 1, sum: 1 },
  { k: 'minQty', t: 'حد التنبيه', v: p => num(p.minQty) },
  { k: 'status', t: 'الحالة', v: stName, basic: 1 },
  { k: 'price', t: 'سعر البيع', v: p => num(p.price), basic: 1 },
  { k: 'price2', t: 'سعر الجملة', v: p => num(p.price2) || '' },
  { k: 'pack', t: 'التعبئة', v: p => p.packQty ? (p.packName || 'تعبئة') + ' = ' + p.packQty + (p.packBarcode ? ' (' + p.packBarcode + ')' : '') : '' },
  { k: 'cost', t: 'سعر الشراء', v: p => num(p.cost), admin: 1, basic: 1 },
  { k: 'costUsd', t: 'سعر الشراء $', v: p => num(p.costUsd) || '', admin: 1 },
  { k: 'margin', t: 'ربح القطعة', v: p => num(p.price) - num(p.cost), admin: 1 },
  { k: 'valSale', t: 'قيمة المخزون (بيع)', v: p => num(p.qty) * num(p.price), sum: 1 },
  { k: 'valCost', t: 'قيمة المخزون (شراء)', v: p => num(p.qty) * num(p.cost), admin: 1, sum: 1 },
  { k: 'warehouse', t: 'المخزن', v: p => whName(p.warehouseId), basic: 1 },
  { k: 'whBreak', t: 'الكمية حسب المخزن', v: p => whList(p).map(([w, v]) => whName(w) + ': ' + v).join(' | ') },
  { k: 'location', t: 'الموقع في المخزن', v: p => p.location || '', basic: 1 },
  { k: 'desc', t: 'الوصف', v: p => p.desc || '' },
  { k: 'showInStore', t: 'يظهر للزبائن', v: p => p.showInStore === false ? 'لا' : 'نعم' },
  { k: 'lastSold', t: 'آخر بيع', v: p => p.lastSoldAt ? fmtDate(p.lastSoldAt) : '' },
  { k: 'createdAt', t: 'تاريخ الإضافة', v: p => p.createdAt ? fmtDate(p.createdAt) : '' },
  { k: 'updatedAt', t: 'آخر تعديل', v: p => p.updatedAt ? fmtDate(p.updatedAt) : '' },
  { k: 'id', t: 'المعرّف (للاستيراد)', v: p => p.id }
];
const exCols = () => EX_COLS.filter(c => !c.admin || isAdmin());
const EX = { src: 'filter', cats: new Set(), brands: new Set(), whs: new Set(), st: new Set(), excluded: new Set(), cols: new Set() };

function openExport(src) {
  if (!needXlsx()) return;
  EX.src = src || (S.sel.size ? 'selected' : 'filter');
  EX.excluded.clear();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('exCols') || 'null'); } catch (e) {}
  EX.cols = new Set((saved || exCols().filter(c => c.basic).map(c => c.k)).filter(k => exCols().some(c => c.k === k)));
  const m = modal('mExport', '⬇ تصدير المنتجات إلى Excel',
    '<div class="ex-src" id="exSrc"></div><div id="exFilters">' +
    '<div class="ex-sec"><div class="ex-h">🔍 بحث <span class="muted small">(اسم، رقم قطعة، باركود)</span></div><input id="exQ" placeholder="مثال: NU22 أو كونتاكتور"></div>' +
    '<div class="ex-sec"><div class="ex-h">📂 النوع / القسم <button type="button" class="linkbtn" data-ex-all="cats">الكل</button></div><div class="ex-chips" id="exCats"></div></div>' +
    '<div class="ex-sec"><div class="ex-h">🏷 الماركة / الشركة <button type="button" class="linkbtn" data-ex-all="brands">الكل</button></div><input id="exBrandQ" class="mb" placeholder="ابحث عن ماركة..."><div class="ex-chips scroll" id="exBrands"></div></div>' +
    '<div class="grid2"><div class="ex-sec"><div class="ex-h">🏭 المخزن</div><div class="ex-chips" id="exWhs"></div></div><div class="ex-sec"><div class="ex-h">📊 الحالة</div><div class="ex-chips" id="exSt"></div></div></div>' +
    '<div class="grid3"><div class="field"><label class="f">سعر البيع من</label><input id="exMin" type="number" min="0"></div><div class="field"><label class="f">إلى</label><input id="exMax" type="number" min="0"></div>' +
    '<div class="field"><label class="f">&nbsp;</label><label class="row"><input type="checkbox" id="exHidden" checked> يشمل المخفي عن الزبائن</label></div></div></div>' +
    '<div class="ex-sec"><div class="ex-h">📦 المنتجات المختارة: <b id="exN" class="num">0</b><span class="spacer"></span><button type="button" class="linkbtn" data-ex-pick="all">تحديد الكل</button> · <button type="button" class="linkbtn" data-ex-pick="none">إلغاء الكل</button></div>' +
    '<p class="muted small">أزل علامة ✓ عن أي منتج لا تريده في الملف.</p><div class="ex-list" id="exList"></div></div>' +
    '<div class="ex-sec"><div class="ex-h">🧾 الأعمدة <button type="button" class="linkbtn" data-ex-cols="all">الكل</button> · <button type="button" class="linkbtn" data-ex-cols="basic">الأساسية</button></div><div class="ex-chips" id="exCols"></div></div>' +
    '<div class="grid3"><div class="field"><label class="f">تقسيم الملف إلى أوراق حسب</label><select id="exGroup"><option value="">بدون — ورقة واحدة</option><option value="category">النوع / القسم</option><option value="brand">الماركة</option><option value="warehouse">المخزن</option></select></div>' +
    '<div class="field"><label class="f">اسم الملف</label><input id="exName" value="المنتجات"></div><div class="field"><label class="f">&nbsp;</label><label class="row"><input type="checkbox" id="exTotals" checked> صف المجاميع</label></div></div>',
    '<button class="btn primary" id="exGo">⬇ تصدير</button><button class="btn ghost" data-close="mExport">إلغاء</button>', 'lg');
  m.addEventListener('click', exClick);
  m.addEventListener('change', exChange);
  ['exQ', 'exMin', 'exMax'].forEach(id => m.querySelector('#' + id).addEventListener('input', debounce(() => { EX.excluded.clear(); renderExList(); }, 200)));
  m.querySelector('#exBrandQ').addEventListener('input', debounce(renderExport, 150));
  m.querySelector('#exGo').onclick = runExport;
  renderExport(); openModal('mExport');
}
function exBase() {
  if (EX.src === 'selected') return selected();
  const q = document.getElementById('exQ').value.trim();
  const min = parseFloat(document.getElementById('exMin').value), max = parseFloat(document.getElementById('exMax').value);
  const hidden = document.getElementById('exHidden').checked;
  let l = activeProducts().filter(p =>
    (!EX.cats.size || EX.cats.has(p.category || '')) && (!EX.brands.size || EX.brands.has(normBrand(p.brand))) &&
    (!EX.whs.size || EX.whs.has(p.warehouseId || '')) && (!EX.st.size || EX.st.has(stName(p))) &&
    (isNaN(min) || num(p.price) >= min) && (isNaN(max) || num(p.price) <= max) && (hidden || p.showInStore !== false));
  if (q) l = searchProducts(q, l);
  return l.sort((a, b) => (a.category || '').localeCompare(b.category || '', 'ar') || (a.name || '').localeCompare(b.name || '', 'ar'));
}
function exChips(id, set, entries) {
  document.getElementById(id).innerHTML = entries.map(([v, label, n]) =>
    '<button type="button" class="chip' + (set.has(v) ? ' on' : '') + '" data-ex-chip="' + id + '" data-v="' + esc(v) + '">' + esc(label) + (n != null ? '<span class="n num">' + n + '</span>' : '') + '</button>').join('');
}
function renderExport() {
  const ps = activeProducts();
  document.getElementById('exSrc').innerHTML = S.sel.size
    ? '<label><input type="radio" name="exSrc" value="selected"' + (EX.src === 'selected' ? ' checked' : '') + '> ✓ المنتجات المحددة من الجدول (' + fmtN(S.sel.size) + ')</label>' +
      '<label><input type="radio" name="exSrc" value="filter"' + (EX.src === 'filter' ? ' checked' : '') + '> 🔍 اختيار بالفلاتر</label>' : '';
  document.getElementById('exFilters').classList.toggle('hidden', EX.src === 'selected');
  const count = f => { const m = {}; ps.forEach(p => { const k = f(p); m[k] = (m[k] || 0) + 1; }); return m; };
  exChips('exCats', EX.cats, Object.entries(count(p => p.category || '')).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, k || 'بدون قسم', n]));
  const bq = normAr(document.getElementById('exBrandQ').value);
  exChips('exBrands', EX.brands, Object.entries(count(p => normBrand(p.brand))).filter(([k]) => !bq || normAr(k || 'بدون ماركة').includes(bq) || EX.brands.has(k)).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, k || 'بدون ماركة', n]));
  exChips('exWhs', EX.whs, Object.entries(count(p => p.warehouseId || '')).map(([k, n]) => [k, k ? whName(k) : 'بدون مخزن', n]));
  const sts = count(stName);
  exChips('exSt', EX.st, ['متوفر', 'منخفض', 'نفد'].map(s => [s, s, sts[s] || 0]));
  exChips('exCols', EX.cols, exCols().map(c => [c.k, c.t, null]));
  renderExList();
}
function renderExList() {
  const base = exBase();
  document.getElementById('exList').innerHTML = base.slice(0, 1500).map(p =>
    '<label><input type="checkbox" data-ex-p="' + esc(p.id) + '"' + (EX.excluded.has(p.id) ? '' : ' checked') + '><span class="grow">' + esc(p.name) +
    '</span><span class="small muted">' + esc(normBrand(p.brand)) + '</span><span class="num small">' + fmtN(p.qty) + '</span></label>').join('') +
    (base.length > 1500 ? '<div class="empty small">… و' + fmtN(base.length - 1500) + ' منتج آخر (داخلة في التصدير)</div>' : '') +
    (base.length ? '' : '<div class="empty small">لا توجد منتجات مطابقة — غيّر الفلاتر</div>');
  updateExCount(base);
}
function updateExCount(base) {
  const n = (base || exBase()).filter(p => !EX.excluded.has(p.id)).length;
  document.getElementById('exN').textContent = fmtN(n);
  const go = document.getElementById('exGo');
  go.textContent = '⬇ تصدير ' + fmtN(n) + ' منتج'; go.disabled = !n || !EX.cols.size;
}
function saveExCols() { try { localStorage.setItem('exCols', JSON.stringify([...EX.cols])); } catch (e) {} }
function exClick(e) {
  const chip = e.target.closest('[data-ex-chip]');
  if (chip) {
    const set = { exCats: EX.cats, exBrands: EX.brands, exWhs: EX.whs, exSt: EX.st, exCols: EX.cols }[chip.dataset.exChip];
    set.has(chip.dataset.v) ? set.delete(chip.dataset.v) : set.add(chip.dataset.v);
    if (chip.dataset.exChip === 'exCols') { saveExCols(); chip.classList.toggle('on'); updateExCount(); return; }
    EX.excluded.clear(); renderExport(); return;
  }
  const all = e.target.closest('[data-ex-all]');
  if (all) { ({ cats: EX.cats, brands: EX.brands })[all.dataset.exAll].clear(); EX.excluded.clear(); renderExport(); return; }
  const pick = e.target.closest('[data-ex-pick]');
  if (pick) { EX.excluded.clear(); if (pick.dataset.exPick === 'none') exBase().forEach(p => EX.excluded.add(p.id)); renderExList(); return; }
  const cols = e.target.closest('[data-ex-cols]');
  if (cols) { EX.cols = new Set(exCols().filter(c => cols.dataset.exCols === 'all' || c.basic).map(c => c.k)); saveExCols(); renderExport(); }
}
function exChange(e) {
  if (e.target.name === 'exSrc') { EX.src = e.target.value; EX.excluded.clear(); renderExport(); return; }
  if (e.target.dataset.exP) { e.target.checked ? EX.excluded.delete(e.target.dataset.exP) : EX.excluded.add(e.target.dataset.exP); updateExCount(); return; }
  if (e.target.id === 'exHidden') { EX.excluded.clear(); renderExList(); }
}
function runExport() {
  const list = exBase().filter(p => !EX.excluded.has(p.id));
  const cols = exCols().filter(c => EX.cols.has(c.k));
  if (!list.length || !cols.length) return;
  const totals = document.getElementById('exTotals').checked;
  const toRows = items => {
    const rows = items.map(p => { const r = {}; cols.forEach(c => r[c.t] = c.v(p)); return r; });
    if (totals && rows.length) {
      const t = {}; cols.forEach((c, i) => t[c.t] = c.sum ? items.reduce((a, p) => a + num(c.v(p)), 0) : (i === 0 ? 'المجموع (' + items.length + ' منتج)' : ''));
      rows.push(t);
    }
    return rows;
  };
  const g = document.getElementById('exGroup').value;
  const key = { category: p => p.category || 'بدون قسم', brand: p => normBrand(p.brand) || 'بدون ماركة', warehouse: p => whName(p.warehouseId) }[g];
  const sheets = [[key ? 'الكل' : 'المنتجات', toRows(list)]];
  if (key) {
    const groups = {};
    list.forEach(p => (groups[key(p)] = groups[key(p)] || []).push(p));
    Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length).forEach(k => sheets.push([k, toRows(groups[k])]));
  }
  sheets.push(['معلومات التصدير', [
    { 'البند': 'تاريخ التصدير', 'القيمة': new Date().toLocaleString('en-GB') }, { 'البند': 'بواسطة', 'القيمة': S.user.email },
    { 'البند': 'عدد المنتجات', 'القيمة': list.length }, { 'البند': 'المصدر', 'القيمة': EX.src === 'selected' ? 'منتجات محددة يدوياً' : 'فلاتر' },
    { 'البند': 'الأقسام', 'القيمة': [...EX.cats].join('، ') || 'الكل' }, { 'البند': 'الماركات', 'القيمة': [...EX.brands].join('، ') || 'الكل' },
    { 'البند': 'الحالة', 'القيمة': [...EX.st].join('، ') || 'الكل' }
  ]]);
  const fname = (document.getElementById('exName').value.trim() || 'المنتجات');
  writeXlsx(sheets, fname + '-' + localDay() + '.xlsx');
  const w = W(); w.log('export', 'product', '', fname, { rows: list.length }); w.commit().catch(() => {});
  toast('تم تصدير ' + fmtN(list.length) + ' منتج');
  closeModal('mExport');
}

// ═══ التصوير المتتالي: صورة → حفظ → المنتج التالي تلقائياً (مرتبة حسب المخزن والرف لتمشي على الرفوف بالترتيب) ═══
function burstPhotos() {
  let queue = filteredProducts().filter(p => !imgSrc(p));
  const all = !queue.length;
  if (all) queue = filteredProducts();
  if (!queue.length) return toast('لا توجد منتجات في القائمة الحالية', 'info');
  queue = queue.slice().sort((a, b) => whName(a.warehouseId).localeCompare(whName(b.warehouseId), 'ar') || String(a.location || '~').localeCompare(String(b.location || '~'), 'en', { numeric: true }) || (a.name || '').localeCompare(b.name || '', 'ar'));
  let i = 0, done = 0, busy = false;
  const m = modal('mBurst', '📸 تصوير متتالي — ' + (all ? 'كل المنتجات المعروضة' : 'المنتجات بدون صورة'), '<div class="burst" id="burstBody"></div>', '', '', { static: true });
  const draw = () => {
    const p = queue[i];
    if (!p) { m.querySelector('#burstBody').innerHTML = '<div class="empty"><div class="ico">🎉</div>انتهت القائمة — صوّرت ' + done + ' منتج</div><button class="btn primary" data-close="mBurst">إغلاق</button>'; return; }
    m.querySelector('#burstBody').innerHTML =
      '<div class="bar"><div style="width:' + Math.round(i / queue.length * 100) + '%"></div></div><div class="small muted mb">' + (i + 1) + ' من ' + queue.length + ' · صوّرت ' + done + '</div>' +
      '<div class="bimg">' + (imgSrc(p) ? '<img src="' + esc(imgSrc(p)) + '" alt="">' : (CAT_ICON[p.category] || '📦')) + '</div>' +
      '<div class="bname">' + esc(p.name) + '</div><div class="small muted">' + esc([normBrand(p.brand), p.barcode].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="bplace">' + esc(placeText(p)) + '</div>' +
      '<label class="btn green big block">📷 التقاط صورة<input type="file" id="burstFile" accept="image/*" capture="environment" hidden></label>' +
      '<div class="row mt"><button class="btn ghost grow" id="burstPrev"' + (i ? '' : ' disabled') + '>→ السابق</button><button class="btn ghost grow" id="burstSkip">تخطي ←</button></div>' +
      '<div class="search mt"><span>🔎</span><input id="burstJump" placeholder="امسح باركود قطعة للانتقال إليها"></div>' +
      '<div id="burstMsg" class="small mt"></div>';
    m.querySelector('#burstFile').onchange = async e => {
      const f = e.target.files[0]; if (!f || busy) return;
      busy = true; m.querySelector('#burstMsg').innerHTML = '<span class="spinner" style="width:14px;height:14px"></span> جاري الحفظ…';
      try {
        const full = await compressImage(f, 1000, 0.8);
        const w = W();
        const fields = await Images.put(w, p.id, full);
        w.update(col('products').doc(p.id), Object.assign(fields, { updatedAt: TS(), updatedBy: S.user.email }));
        w.log('update', 'product', p.id, p.name, { image: 'صورة جديدة' });
        w.catalog = true;
        await w.commit();
        done++; i++; draw();
      } catch (err) { m.querySelector('#burstMsg').textContent = '⛔ ' + authErr(err); }
      busy = false;
    };
    m.querySelector('#burstSkip').onclick = () => { i++; draw(); };
    m.querySelector('#burstPrev').onclick = () => { i = Math.max(0, i - 1); draw(); };
    m.querySelector('#burstJump').onkeydown = e => {
      if (e.key !== 'Enter') return;
      const t = findByCode(e.target.value.trim(), queue) || findByCode(e.target.value.trim());
      if (!t) return toast('لم أجد القطعة', 'error');
      const k = queue.indexOf(t); if (k >= 0) i = k; else { queue.splice(i, 0, t); }
      draw();
    };
  };
  draw(); openModal('mBurst');
}

act({
  'toggle-quick-edit': () => { PF.edit = !PF.edit; renderProducts(); },
  'burst-photos': burstPhotos,
  'new-product': () => openProduct(null),
  'edit-product': el => openProduct(el.dataset.id),
  'dup-product': el => { const p = S.products.get(el.dataset.id); closeModal('mProduct'); setTimeout(() => openProduct(null, Object.assign({}, p, { id: undefined, barcode: '', qty: 0, thumb: '', thumbUrl: '', imageUrl: '', hasImage: false, name: p.name + ' (نسخة)' })), 50); },
  'save-product': saveProduct,
  'del-product': el => trashProducts([S.products.get(el.dataset.id)].filter(Boolean)),
  'bulk-trash': () => trashProducts(selected()),
  'stock-adjust': el => stockAdjust(el.dataset.id),
  'dup-open': el => { closeModal('mProduct'); setTimeout(() => openProduct(el.dataset.id), 30); },
  'dup-addqty': el => { const f = document.getElementById('productForm'); const q = f && !PM.id ? num(f.elements.qty.value) : 0; closeModal('mProduct'); stockAdjust(el.dataset.id, { type: 'in', qty: q || '' }); },
  'rm-img': () => { PM.img = null; PM.imgChanged = true; setImgBox(null); },
  'gen-barcode': () => { const f = document.getElementById('productForm'); f.elements.barcode.value = newBarcode(); },
  'scan-field': () => startScan(code => { const f = document.getElementById('productForm'); if (f) f.elements.barcode.value = code; }),
  'product-scan': () => startScan(code => {
    const p = findByCode(code);
    if (p) openProduct(p.id);
    else confirmBox('لا يوجد منتج بالباركود ' + code + '\nإضافة منتج جديد بهذا الباركود؟', 'إضافة').then(ok => ok && openProduct(null, { barcode: code }));
  }),
  'more-products': () => { PF.limit += PSIZE; renderProducts(); },
  'p-reset': () => { ['pSearch', 'pCat', 'pBrand', 'pWh', 'pStock'].forEach(id => document.getElementById(id).value = ''); renderProducts(); },
  'sel-clear': () => { S.sel.clear(); renderProducts(); },
  'sel-labels': () => { selected().forEach(p => { if (!S.labels.find(l => l.id === p.id)) S.labels.push({ id: p.id, n: 1 }); }); toast('أُضيف ' + S.sel.size + ' منتج لقائمة الملصقات'); go('labels'); },
  'bulk-edit': bulkEditDialog,
  'export-dialog': () => openExport(), 'export-selected': () => openExport('selected')
});
