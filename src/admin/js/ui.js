// ═══════════════════════════════════════════════════════════
// مكوّنات الواجهة المشتركة
// ═══════════════════════════════════════════════════════════

// نافذة: تُنشأ من جديد كل مرة (حتى لا تتكرر مستمعات الأحداث من فتحات سابقة)
function modal(id, title, body, foot, size, attrs) {
  const old = document.getElementById(id);
  const m = document.createElement('div'); m.id = id; m.className = 'modal';
  if (old) old.replaceWith(m); else document.getElementById('modals').appendChild(m);
  if (attrs && attrs.static) m.setAttribute('data-static', ''); else m.removeAttribute('data-static');
  m.innerHTML = '<div class="modal-card ' + (size || '') + '"><div class="modal-head"><h3></h3><button class="x" ' + (attrs && attrs.closeAction ? 'data-action="' + attrs.closeAction + '"' : 'data-close="' + id + '"') + ' aria-label="إغلاق">✕</button></div>' +
    '<div class="modal-body">' + body + '</div>' + (foot ? '<div class="modal-foot">' + foot + '</div>' : '') + '</div>';
  m.querySelector('h3').textContent = title;
  return m;
}

// قائمة اقتراحات تحت حقل البحث (للمنتجات، الزبائن، الموردين)
function picker(input, opts) {
  const box = document.createElement('div');
  box.className = 'picker hidden';
  input.parentNode.style.position = 'relative';
  input.insertAdjacentElement('afterend', box);
  input.setAttribute('autocomplete', 'off');
  let items = [], idx = 0;
  const close = () => box.classList.add('hidden');
  const draw = () => {
    const q = input.value.trim();
    items = (q.length >= (opts.min || 1) || opts.showEmpty) ? opts.source(q).slice(0, opts.limit || 12) : [];
    if (opts.extra) { const ex = opts.extra(q); if (ex) items = items.concat([ex]); }
    if (!items.length) return close();
    idx = 0;
    box.innerHTML = items.map((it, i) => '<div class="pk' + (i === 0 ? ' on' : '') + '" data-i="' + i + '">' + opts.render(it, q) + '</div>').join('');
    box.classList.remove('hidden');
  };
  const pick = i => { const it = items[i]; if (!it) return; close(); opts.onPick(it, input); };
  input.addEventListener('input', debounce(draw, 120));
  input.addEventListener('focus', () => { if (opts.showEmpty || input.value.trim()) draw(); });
  input.addEventListener('keydown', e => {
    if (box.classList.contains('hidden')) { if (e.key === 'Enter' && opts.onEnter) { e.preventDefault(); opts.onEnter(input.value.trim(), input); } return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      box.querySelectorAll('.pk').forEach((el, i) => el.classList.toggle('on', i === idx));
      box.querySelectorAll('.pk')[idx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // الباركود المطابق تماماً له الأولوية (قارئ الباركود يكتب ثم Enter)
      if (opts.onEnter && opts.exactFirst && opts.onEnter(input.value.trim(), input, true)) { close(); return; }
      pick(idx);
    } else if (e.key === 'Escape') close();
  });
  box.addEventListener('mousedown', e => { const el = e.target.closest('.pk'); if (el) { e.preventDefault(); pick(+el.dataset.i); } });
  input.addEventListener('blur', () => setTimeout(close, 150));
  return { refresh: draw, close };
}
const pkNew = (x, what) => '<div class="pk-new">＋ ' + what + ' جديد: <b>' + esc(x.name) + '</b></div>';
const pkProduct = (p, q) => p._new ? pkNew(p, 'منتج') : '<div class="row" style="flex-wrap:nowrap">' + thumbHtml(p) + '<div class="grow" style="min-width:0"><b class="ellipsis">' + esc(p.name) + '</b><span class="small muted">' +
  esc([normBrand(p.brand), p.barcode].filter(Boolean).join(' · ')) + '</span></div><div style="text-align:left"><span class="num small">' + money(p.price) + '</span><br><span class="small ' + (num(p.qty) > 0 ? 'muted' : 'red') + '">متوفر: ' + fmtN(p.qty) + '</span></div></div>';

// ═══ رسم بياني أعمدة (SVG خفيف بدون مكتبات) ═══
function barChart(rows, opts) {
  opts = opts || {};
  if (!rows.length) return '<div class="empty small">لا توجد بيانات للفترة</div>';
  const W = 640, H = opts.h || 220, padB = 34, padT = 16, padX = 6;
  const max = Math.max(1, ...rows.map(r => Math.max(r.v || 0, r.v2 || 0)));
  const bw = (W - padX * 2) / rows.length;
  const y = v => H - padB - (Math.max(0, v) / max) * (H - padB - padT);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(opts.label || 'رسم بياني') + '">';
  [0.25, 0.5, 0.75, 1].forEach(f => { const yy = y(max * f); s += '<line x1="0" x2="' + W + '" y1="' + yy + '" y2="' + yy + '" class="grid"/>'; });
  const step = Math.ceil(rows.length / 12);
  rows.forEach((r, i) => {
    const x = W - padX - (i + 1) * bw; // من اليمين لليسار (RTL)
    const h1 = H - padB - y(r.v || 0);
    s += '<g><title>' + esc(r.label + ': ' + fmtN(r.v || 0) + (r.v2 != null ? ' / ' + (opts.l2 || '') + ' ' + fmtN(r.v2) : '')) + '</title>' +
      '<rect class="bar" x="' + (x + bw * 0.15) + '" y="' + y(r.v || 0) + '" width="' + (bw * (r.v2 != null ? 0.38 : 0.7)) + '" height="' + Math.max(0, h1) + '" rx="3"/>';
    if (r.v2 != null) s += '<rect class="bar2" x="' + (x + bw * 0.55) + '" y="' + y(r.v2) + '" width="' + (bw * 0.3) + '" height="' + Math.max(0, H - padB - y(r.v2)) + '" rx="3"/>';
    if (i % step === 0) s += '<text x="' + (x + bw / 2) + '" y="' + (H - 12) + '" text-anchor="middle" class="lbl">' + esc(r.short || r.label) + '</text>';
    s += '</g>';
  });
  s += '</svg>';
  if (opts.l1) s += '<div class="legend"><span><i class="lg1"></i>' + esc(opts.l1) + '</span>' + (opts.l2 ? '<span><i class="lg2"></i>' + esc(opts.l2) + '</span>' : '') + '<span class="muted">الأعلى: ' + fmtN(max) + '</span></div>';
  return s;
}
// شريط نسبة أفقي
const hbar = (label, v, max, txt) => '<div class="hb"><div class="row small"><span class="grow ellipsis">' + esc(label) + '</span><b class="num">' + (txt || fmtN(v)) + '</b></div><div class="hb-t"><div style="width:' + Math.max(2, v / (max || 1) * 100) + '%"></div></div></div>';

// بطاقة رقم
function statCard(ic, tone, value, label, href, sub) {
  return (href ? '<a class="card stat" href="' + href + '">' : '<div class="card stat">') + '<div class="si" style="background:var(--' + tone + '-soft)">' + ic + '</div>' +
    '<div style="min-width:0"><div class="sv num">' + value + '</div><div class="sl">' + label + '</div>' + (sub ? '<div class="small muted">' + sub + '</div>' : '') + '</div>' + (href ? '</a>' : '</div>');
}

// ═══ الفترات الزمنية ═══
const PERIODS = { today: 'اليوم', yesterday: 'أمس', week: 'آخر 7 أيام', month: 'هذا الشهر', lastMonth: 'الشهر الماضي', d30: 'آخر 30 يوم', d90: 'آخر 90 يوم', year: 'هذه السنة', custom: 'مخصص' };
function periodRange(key, from, to) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const day = n => new Date(t.getTime() + n * 864e5);
  switch (key) {
    case 'today': return [t, t];
    case 'yesterday': return [day(-1), day(-1)];
    case 'week': return [day(-6), t];
    case 'month': return [new Date(t.getFullYear(), t.getMonth(), 1), t];
    case 'lastMonth': return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)];
    case 'd90': return [day(-89), t];
    case 'year': return [new Date(t.getFullYear(), 0, 1), t];
    case 'custom': return [from ? new Date(from + 'T00:00') : day(-29), to ? new Date(to + 'T00:00') : t];
    default: return [day(-29), t];
  }
}
function daysBetween(a, b) { const out = []; for (let d = new Date(a); d <= b; d = new Date(d.getTime() + 864e5)) out.push(localDay(d)); return out; }
function periodSelect(id, val) {
  return '<select id="' + id + '" class="auto">' + Object.entries(PERIODS).map(([k, v]) => '<option value="' + k + '"' + (k === val ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>';
}

// ═══ الطباعة ═══
function printHTML(html, kind) {
  const a = document.getElementById('printArea');
  a.className = 'print-area pa-' + (kind || 'a4');
  a.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); a.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 250);
}
function shopHeader() {
  const s = S.settings;
  const logo = s.logo && /^data:image\//.test(s.logo) ? '<img class="doc-logo" src="' + esc(s.logo) + '" alt="">' : '';
  return '<div class="doc-head"><div class="doc-shop">' + logo + '<div><h2>' + esc(s.company) + '</h2>' + (s.address ? '<div>' + esc(s.address) + '</div>' : '') + (s.phone ? '<div class="num">' + esc(s.phone) + '</div>' : '') + '</div></div>';
}
// ═══ التفقيط: المبلغ كتابةً ═══
function amountWords(n) {
  n = Math.round(Math.abs(num(n)));
  const cur = S.settings.currency === 'USD' ? ['دولار', 'دولار أمريكي'] : ['دينار', 'دينار عراقي'];
  if (!n) return 'صفر ' + cur[0];
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hund = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  const u1000 = x => {
    const h = Math.floor(x / 100), r = x % 100, p = [];
    if (h) p.push(hund[h]);
    if (r) p.push(r < 20 ? ones[r] : (r % 10 ? ones[r % 10] + ' و' : '') + tens[Math.floor(r / 10)]);
    return p.join(' و');
  };
  const scales = [null, ['ألف', 'ألفان', 'آلاف'], ['مليون', 'مليونان', 'ملايين'], ['مليار', 'ملياران', 'مليارات']];
  const parts = [];
  for (let i = 3; i >= 0; i--) {
    const c = Math.floor(n / Math.pow(1000, i)) % 1000; if (!c) continue;
    if (!i) { parts.push(u1000(c)); continue; }
    const sc = scales[i];
    parts.push(c === 1 ? sc[0] : c === 2 ? sc[1] : c <= 10 ? u1000(c) + ' ' + sc[2] : u1000(c) + ' ' + sc[0]);
  }
  return 'فقط ' + parts.join(' و') + ' ' + cur[1] + ' لا غير';
}

// ═══ Excel ═══
function needXlsx() { if (typeof XLSX === 'undefined') { toast('مكتبة Excel لم تُحمّل بعد — انتظر ثانية', 'error'); return false; } return true; }
function writeXlsx(sheets, name) {
  if (!needXlsx()) return;
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  const used = new Set();
  sheets.forEach(([title, rows]) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'لا توجد بيانات' }]);
    const keys = Object.keys(rows[0] || {});
    if (rows.length && ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
    ws['!cols'] = keys.map(k => ({ wch: Math.min(45, Math.max(10, k.length + 2, ...rows.slice(0, 300).map(r => String(r[k] == null ? '' : r[k]).length + 2))) }));
    let t = String(title).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 28) || 'ورقة';
    while (used.has(t)) t = t.slice(0, 25) + '_' + used.size;
    used.add(t);
    XLSX.utils.book_append_sheet(wb, ws, t);
  });
  XLSX.writeFile(wb, String(name).replace(/[\\/:*?"<>|]/g, '-'));
}

// ═══ الماسح بالكاميرا ═══
let scannerObj = null, scanCb = null;
async function startScan(cb, title) {
  if (typeof Html5Qrcode === 'undefined') return toast('مكتبة المسح لم تُحمّل بعد', 'error');
  scanCb = cb;
  modal('mScan', title || '📷 مسح باركود أو رمز مربع (QR / Data Matrix)', '<div id="scanBox"></div><p class="muted small mt" style="text-align:center">وجّه الكاميرا نحو الباركود الخطي أو الرمز المربع</p>', '', 'sm', { static: true, closeAction: 'stop-scan' });
  openModal('mScan');
  // كل الأنواع: خطي (EAN، Code128…) ومربع (QR، Data Matrix، Aztec) — مع قارئ الجهاز الأصلي إن وُجد (أسرع)
  scannerObj = new Html5Qrcode('scanBox', { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
  try {
    await scannerObj.start({ facingMode: 'environment' }, {
      fps: 12,
      qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.75); return { width: Math.min(Math.floor(w * 0.85), Math.max(s, 260)), height: s }; }
    }, code => {
      if (navigator.vibrate) navigator.vibrate(80);
      const f = scanCb; stopScan(); if (f) f(code);
    });
  } catch (e) { toast('تعذر فتح الكاميرا — تأكد من السماح بالوصول', 'error'); stopScan(); }
}
async function stopScan() {
  closeModal('mScan');
  if (scannerObj) { try { await scannerObj.stop(); } catch (e) {} try { scannerObj.clear(); } catch (e) {} scannerObj = null; }
}
act({ 'stop-scan': stopScan });

// ═══ حوار اختيار من عدة أزرار — يرجع قيمة الزر المختار أو null ═══
function choiceBox(title, html, choices) {
  return new Promise(resolve => {
    const m = document.createElement('div');
    m.className = 'modal open'; m.style.zIndex = 3000;
    m.innerHTML = '<div class="modal-card"><div class="modal-head"><h3></h3></div><div class="modal-body">' + html + '</div><div class="modal-foot">' +
      choices.map((c, i) => '<button class="btn ' + (c.cls || 'ghost') + '" data-i="' + i + '">' + esc(c.label) + '</button>').join('') + '<button class="btn ghost" data-i="-1">' + (choices.length ? 'إلغاء' : 'حسناً') + '</button></div></div>';
    m.querySelector('h3').textContent = title;
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-i]');
      if (b || e.target === m) { m.remove(); const i = b ? +b.dataset.i : -1; resolve(i >= 0 ? choices[i].value : null); }
    });
  });
}
// قائمة المنتجات المشابهة مع أماكنها
function dupListHtml(dups, actions) {
  const tone = { block: 'b-red', strong: 'b-yellow', similar: 'b-blue' };
  return dups.slice(0, 6).map(d => '<div class="dup-item">' + thumbHtml(d.p) + '<div class="grow" style="min-width:0"><b class="pn">' + esc(d.p.name) + '</b>' +
    '<div class="small"><span class="badge ' + tone[d.level] + '">' + esc(d.why) + '</span> ' + esc(normBrand(d.p.brand)) + (d.p.barcode ? ' · <span class="num">' + esc(d.p.barcode) + '</span>' : '') + '</div>' +
    '<div class="small place">' + esc(placeText(d.p)) + '</div></div>' +
    (actions ? '<div class="acts col"><button type="button" class="btn sm ghost" data-action="dup-open" data-id="' + esc(d.p.id) + '">فتح</button>' +
      '<button type="button" class="btn sm primary" data-action="dup-addqty" data-id="' + esc(d.p.id) + '">＋ كمية له</button></div>' : '') + '</div>').join('') +
    (dups.length > 6 ? '<div class="small muted">… و' + (dups.length - 6) + ' أخرى</div>' : '');
}

// ═══ حوار إدخال سريع ═══
function promptBox(title, fields, okText) {
  return new Promise(resolve => {
    const id = 'mPrompt';
    const m = modal(id, title, '<form id="pbForm">' + fields.map(f =>
      '<div class="field"><label class="f">' + esc(f.label) + '</label>' +
      (f.type === 'select' ? '<select name="' + f.name + '">' + f.options.map(o => '<option value="' + esc(o[0]) + '"' + (o[0] === f.value ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>'
        : f.type === 'textarea' ? '<textarea name="' + f.name + '">' + esc(f.value || '') + '</textarea>'
        : '<input name="' + f.name + '" type="' + (f.type || 'text') + '"' + (f.step ? ' step="' + f.step + '"' : '') + (f.required ? ' required' : '') + ' value="' + esc(f.value == null ? '' : f.value) + '"' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>') +
      (f.hint ? '<div class="small muted">' + f.hint + '</div>' : '') + '</div>').join('') +
      '<button class="btn primary block" type="submit">' + esc(okText || 'حفظ') + '</button></form>', '', 'sm');
    let done = false;
    const form = m.querySelector('form');
    form.onsubmit = e => { e.preventDefault(); done = true; const o = {}; fields.forEach(f => o[f.name] = form.elements[f.name].value); closeModal(id); resolve(o); };
    const obs = new MutationObserver(() => { if (!m.classList.contains('open')) { obs.disconnect(); if (!done) resolve(null); } });
    obs.observe(m, { attributes: true, attributeFilter: ['class'] });
    openModal(id);
    setTimeout(() => { const i = form.querySelector('input,select,textarea'); if (i) i.focus(); }, 80);
  });
}

// ═══ بحث سريع (Ctrl+K): منتج، زبون، فاتورة، صفحة ═══
function quickFind() {
  const m = modal('mFind', '🔍 بحث سريع', '<input id="qfIn" placeholder="اسم منتج، رقم قطعة، باركود، زبون، رقم فاتورة، أو اسم صفحة..."><div id="qfRes" class="qf-res"></div>', '', '');
  openModal('mFind');
  const inp = m.querySelector('#qfIn'), res = m.querySelector('#qfRes');
  const run = () => {
    const q = inp.value.trim();
    if (!q) { res.innerHTML = '<div class="muted small" style="padding:10px">ابدأ الكتابة…</div>'; return; }
    const pages = Object.values(PAGES).filter(p => canSee(p) && normAr(p.t).includes(normAr(q))).slice(0, 4)
      .map(p => '<a class="list-row" href="#' + p.id + '" data-close="mFind"><span>' + p.ic + '</span><b class="grow">' + esc(p.t) + '</b><span class="badge b-gray">صفحة</span></a>');
    const prods = searchProducts(q, null, 8).map(p => '<div class="list-row" data-action="edit-product" data-id="' + esc(p.id) + '">' + thumbHtml(p) + '<div class="grow"><b>' + esc(p.name) + '</b><div class="small muted">' + esc(normBrand(p.brand)) + ' · متوفر ' + fmtN(p.qty) + '</div></div><span class="num small">' + money(p.price) + '</span></div>');
    const custs = [...S.customers.values()].filter(c => matchScore(c.name + ' ' + (c.phone || ''), q)).slice(0, 5)
      .map(c => '<div class="list-row" data-action="view-customer" data-id="' + esc(c.id) + '"><span>👤</span><b class="grow">' + esc(c.name) + '</b><span class="num small ' + (num(c.balance) > 0 ? 'red' : '') + '">' + money(c.balance) + '</span></div>');
    const inv = /^(inv|pur)?[-\d]/i.test(q) ? ['<div class="list-row" data-action="find-invoice" data-num="' + esc(q.toUpperCase()) + '"><span>🧾</span><b class="grow">فتح الفاتورة ' + esc(q.toUpperCase()) + '</b></div>'] : [];
    const all = pages.concat(prods, custs, inv);
    res.innerHTML = all.join('') || '<div class="empty small">لا توجد نتائج</div>';
  };
  inp.addEventListener('input', debounce(run, 120));
  res.addEventListener('click', () => setTimeout(() => closeModal('mFind'), 0));
  run(); setTimeout(() => inp.focus(), 60);
}
act({ 'quick-find': quickFind });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && S.ready) { e.preventDefault(); quickFind(); }
});
