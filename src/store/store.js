// ═══ كتالوج الزبائن — تصفح فقط (بدون سلة أو حسابات أو تعديل) ═══
const STEP = 48;
const ICONS = {
  mech: '<svg class="ico" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3"><circle cx="32" cy="32" r="26"/><circle cx="32" cy="32" r="12"/><g fill="currentColor" stroke="none"><circle cx="32" cy="13" r="4"/><circle cx="32" cy="51" r="4"/><circle cx="13" cy="32" r="4"/><circle cx="51" cy="32" r="4"/><circle cx="18.6" cy="18.6" r="4"/><circle cx="45.4" cy="45.4" r="4"/><circle cx="18.6" cy="45.4" r="4"/><circle cx="45.4" cy="18.6" r="4"/></g></svg>',
  elec: '<svg class="ico" viewBox="0 0 64 64" fill="currentColor"><path d="M36 4 12 36h16l-4 24 26-34H34z"/></svg>',
  tech: '<svg class="ico" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3"><rect x="16" y="16" width="32" height="32" rx="4"/><rect x="25" y="25" width="14" height="14" rx="2" fill="currentColor"/><path d="M24 6v10M32 6v10M40 6v10M24 48v10M32 48v10M40 48v10M6 24h10M6 32h10M6 40h10M48 24h10M48 32h10M48 40h10"/></svg>',
  other: '<svg class="ico" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M32 6 56 18v28L32 58 8 46V18z"/><path d="M8 18l24 12 24-12M32 30v28"/></svg>'
};
const CAT_KIND = { 'ميكانيكي': 'mech', 'هيدروليك': 'mech', 'كهربائي': 'elec', 'إنشائي': 'other', 'إلكترونيات': 'tech' };
const kind = c => CAT_KIND[c] || 'other';
const tileClass = c => ({ mech: 't-mech', elec: 't-elec', tech: 't-tech', other: 't-mech' })[kind(c)];

const T = { items: [], cfg: { showPrices: true, currency: 'IQD', exrate: 1300 }, cat: '', brand: '', limit: STEP, loaded: false };

// الماركات اللاتينية بحروف كبيرة حتى تتجمع FAG و Fag و fag
const normBrand = b => { b = String(b || '').trim(); return /^[\x00-\x7F]+$/.test(b) ? b.toUpperCase() : b; };
// رقم القطعة = أطول كلمة لاتينية فيها أرقام (مثل 3RT1075-6AP36 أو NU220 أو 6205)
// يقبل "NJ 205" كرقم واحد، ويحذف اسم الماركة من بدايته ("FAG 6005" ← "6005")
function partCode(name, brand) {
  const m = (String(name || '').match(/[A-Za-z]{1,5} \d[A-Za-z0-9.\-_/+]*|[A-Za-z0-9][A-Za-z0-9.\-_/+]*[A-Za-z0-9]|[A-Za-z0-9]+/g) || [])
    .map(t => { const b = normBrand(brand); return b && t.toUpperCase().startsWith(b + ' ') ? t.slice(b.length + 1) : t; })
    .filter(t => /\d/.test(t) && (/[A-Za-z]/.test(t) || /\d{3,}/.test(t)));
  return m.sort((a, b) => b.length - a.length)[0] || '';
}
const compact = s => String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');
const money = n => (n == null || !(n > 0)) ? null : fmtMoney(n, T.cfg);

// ═══ تحميل البيانات (قراءة فقط) ═══
db.collection('publicSettings').doc('main').onSnapshot(s => {
  T.cfg = Object.assign(T.cfg, s.data() || {});
  const name = T.cfg.company || 'مخزن قطع الغيار';
  document.title = name + ' — كتالوج القطع';
  document.getElementById('shopName').textContent = name;
  document.getElementById('shopSub').textContent = T.cfg.address || '';
  const phone = String(T.cfg.phone || '').trim();
  const call = document.getElementById('callBtn');
  call.classList.toggle('hidden', !phone || /^0?7700000000$/.test(phone));
  call.href = 'tel:' + phone.replace(/[^\d+]/g, '');
  document.getElementById('callNum').textContent = phone;
  document.getElementById('foot').innerHTML = '<b>' + esc(name) + '</b>' + (T.cfg.address ? ' · ' + esc(T.cfg.address) : '') +
    (phone ? ' · <a class="num" href="tel:' + esc(phone.replace(/[^\d+]/g, '')) + '">' + esc(phone) + '</a>' : '') +
    '<div class="small mt">الأسعار والتوفر قابلة للتغيير — للتأكيد تواصل معنا</div>';
  if (T.loaded) render();
  drawInqFab();
}, () => {});

// الكتالوج المضغوط: وثيقة "meta" + 1-3 وثائق فيها كل المنتجات (بدل قراءة كل منتج لوحده)
function setItems(raw) {
  T.items = raw.map(x => Object.assign(x, { brandN: normBrand(x.brand), code: partCode(x.name, x.brand) }))
    .map(x => Object.assign(x, { hay: [x.name, x.brandN, x.category, x.desc].join(' '), hayC: compact(x.name + ' ' + x.brandN) }));
  const first = !T.loaded;
  T.loaded = true;
  if (first) readUrl();
  renderFilters(); render();
}
const unpack = o => ({ id: o.i, name: o.n, category: o.c, inStock: !!o.s, brand: o.b || '', unit: o.u || '', desc: o.d || '', price: o.p == null ? null : o.p, thumb: o.t || '', hasImage: !!o.h, imageUrl: o.f || '' });
let packHash = null;
db.collection('catalogPacks').doc('meta').onSnapshot(async s => {
  const m = s.data();
  if (!m) return legacyCatalog();
  if (m.hash === packHash) return;
  packHash = m.hash;
  try {
    const packs = await Promise.all(Array.from({ length: m.n }, (_, i) => db.collection('catalogPacks').doc('p' + i).get()));
    setItems([].concat(...packs.map(p => (p.data() || {}).items || [])).map(unpack));
  } catch (e) { legacyCatalog(); }
}, () => legacyCatalog());
// احتياط: الطريقة القديمة (وثيقة لكل منتج) إن لم يُنشر الكتالوج المضغوط بعد
let legacyOn = false;
function legacyCatalog() {
  if (legacyOn) return; legacyOn = true;
  db.collection('catalog').get().then(qs => setItems(qs.docs.map(d => Object.assign({ id: d.id }, d.data()))))
    .catch(() => { document.getElementById('grid').innerHTML = '<div class="noresult"><b>تعذر تحميل الكتالوج</b>تحقق من الاتصال بالإنترنت وأعد المحاولة</div>'; });
}

// ═══ البحث والفلترة ═══
function score(i, q) {
  const qc = compact(q);
  if (qc.length >= 2 && i.hayC.includes(qc)) return 10 + (compact(i.code) === qc ? 5 : 0);
  // كل كلمة لازم تطابق؛ الكلمات اللي فيها أرقام (أرقام القطع) تطابق حرفياً بدون تسامح إملائي
  let s = 0;
  for (const w of normAr(q).split(' ').filter(Boolean)) {
    if (/\d/.test(w)) { if (!i.hayC.includes(compact(w))) return 0; s += 3; }
    else { const m = matchScore(i.hay, w); if (!m) return 0; s += m; }
  }
  return s;
}
function list() {
  const q = document.getElementById('q').value.trim();
  const only = document.getElementById('onlyStock').checked;
  let l = T.items.filter(i => (!T.cat || i.category === T.cat) && (!T.brand || i.brandN === T.brand) && (!only || i.inStock));
  if (q) return l.map(i => ({ i, s: score(i, q) })).filter(x => x.s).sort((a, b) => b.s - a.s || (b.i.inStock - a.i.inStock)).map(x => x.i);
  const s = document.getElementById('sort').value;
  const p = i => (i.price > 0 ? i.price : null);
  const by = {
    smart: (a, b) => (b.inStock - a.inStock) || ((p(b) != null) - (p(a) != null)) || a.name.localeCompare(b.name, 'ar'),
    az: (a, b) => a.name.localeCompare(b.name, 'ar'),
    low: (a, b) => (p(a) == null) - (p(b) == null) || (p(a) || 0) - (p(b) || 0),
    high: (a, b) => (p(a) == null) - (p(b) == null) || (p(b) || 0) - (p(a) || 0)
  }[s];
  return l.sort(by);
}
function hl(text, q) {
  text = String(text || '');
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}
function tileHtml(i, big) {
  return '<div class="tile ' + tileClass(i.category) + (big ? ' dt-tile' : '') + '"' + (big ? ' id="dtTile"' : '') + '>' +
    (i.thumb ? '<img src="' + esc(i.thumb) + '" alt="" loading="lazy">' : ICONS[kind(i.category)]) +
    (!big && i.code ? '<span class="code-tag">' + esc(i.code) + '</span>' : '') + '</div>';
}

function renderFilters() {
  const cats = {}, brands = {};
  T.items.forEach(i => { if (i.category) cats[i.category] = (cats[i.category] || 0) + 1; });
  T.items.filter(i => !T.cat || i.category === T.cat).forEach(i => { if (i.brandN) brands[i.brandN] = (brands[i.brandN] || 0) + 1; });
  const ctab = (val, label, n, icon) => '<button class="ctab' + (T.cat === val ? ' on' : '') + '" data-cat="' + esc(val) + '">' + (icon || '') + esc(label) + '<span class="n">' + n + '</span></button>';
  document.getElementById('cats').innerHTML = ctab('', 'كل القطع', T.items.length) +
    Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => ctab(c, c, n, ICONS[kind(c)].replace('class="ico"', ''))).join('');
  const top = Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 14);
  if (T.brand && !brands[T.brand]) T.brand = '';
  document.getElementById('brands').innerHTML = top.length ? '<button class="bchip' + (!T.brand ? ' on' : '') + '" data-brand="">كل الماركات</button>' +
    top.map(([b]) => '<button class="bchip' + (T.brand === b ? ' on' : '') + '" data-brand="' + esc(b) + '">' + esc(b) + '</button>').join('') : '';
  const inStock = T.items.filter(i => i.inStock).length;
  document.getElementById('facts').innerHTML = '<span><b>' + fmtN(T.items.length) + '</b>قطعة في الكتالوج</span><span><b>' + fmtN(inStock) + '</b>متوفرة الآن</span><span><b>' + Object.keys(cats).length + '</b>أقسام</span>';
}

function render() {
  const q = document.getElementById('q').value.trim();
  const l = list();
  const filtered = q || T.cat || T.brand || document.getElementById('onlyStock').checked;
  document.getElementById('count').textContent = filtered ? fmtN(l.length) + ' نتيجة' : fmtN(l.length) + ' قطعة';
  document.getElementById('reset').classList.toggle('hidden', !filtered);
  document.getElementById('qClear').classList.toggle('hidden', !q);
  document.getElementById('more').classList.toggle('hidden', l.length <= T.limit);
  document.getElementById('grid').innerHTML = l.slice(0, T.limit).map(i => {
    const pr = T.cfg.showPrices ? money(i.price) : null;
    return '<button class="card-p' + (i.inStock ? '' : ' is-out') + '" data-item="' + esc(i.id) + '">' + tileHtml(i) +
      '<div class="cb"><div class="nm">' + hl(i.name, q) + '</div><div class="meta">' + (i.brandN ? '<span class="btag">' + esc(i.brandN) + '</span>' : '') +
      '<span class="stock ' + (i.inStock ? 'in">متوفر' : 'out">غير متوفر حالياً') + '</span></div>' +
      '<div class="price">' + (pr ? '<b>' + esc(pr) + '</b>' + (i.unit ? '<small>/ ' + esc(i.unit) + '</small>' : '') : '<span class="ask">اسأل عن السعر</span>') + '</div></div></button>';
  }).join('') || '<div class="noresult"><b>ما لقينا نتائج' + (q ? ' لـ "' + esc(q) + '"' : '') + '</b>جرّب رقم القطعة بدون مسافات أو شرطات، أو امسح الفلاتر</div>';
  writeUrl();
}

// روابط قابلة للمشاركة: ?q=6205&cat=ميكانيكي&brand=SKF
function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get('q')) document.getElementById('q').value = p.get('q');
  T.cat = p.get('cat') || ''; T.brand = p.get('brand') || '';
  if (p.get('stock') === '1') document.getElementById('onlyStock').checked = true;
  if (p.get('item')) setTimeout(() => openItem(p.get('item')), 0);
}
function writeUrl() {
  const p = new URLSearchParams();
  const q = document.getElementById('q').value.trim();
  if (q) p.set('q', q); if (T.cat) p.set('cat', T.cat); if (T.brand) p.set('brand', T.brand);
  if (document.getElementById('onlyStock').checked) p.set('stock', '1');
  if (T.item) p.set('item', T.item);
  const s = p.toString();
  try { history.replaceState(null, '', s ? '?' + s : location.pathname); } catch (e) {}
}

// ═══ تفاصيل القطعة ═══
function openItem(id) {
  const i = T.items.find(x => x.id === id); if (!i) return;
  if (!T.item) T.title = document.title;
  T.item = id; writeUrl(); document.title = i.name + ' — ' + (T.cfg.company || document.title);
  const pr = T.cfg.showPrices ? money(i.price) : null;
  const wa = String(T.cfg.whatsapp || '').replace(/\D/g, '');
  const phone = String(T.cfg.phone || '').replace(/[^\d+]/g, '');
  document.getElementById('itTitle').textContent = i.name;
  const row = (k, v, cls) => v ? '<tr><th>' + k + '</th><td' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</td></tr>' : '';
  document.getElementById('itBody').innerHTML = tileHtml(i, true) +
    '<div class="dt-price">' + (pr ? esc(pr) : '<span class="muted" style="font-family:Cairo;font-size:16px">السعر عند الاستفسار</span>') + '</div>' +
    '<span class="stock ' + (i.inStock ? 'in">متوفر في المخزن' : 'out">غير متوفر حالياً') + '</span>' +
    '<table class="specs">' + row('رقم القطعة', i.code ? '<span class="code" dir="ltr">' + esc(i.code) + '</span>' : '') +
    row('الماركة', esc(i.brandN)) + row('القسم', esc(i.category)) + row('الوحدة', esc(i.unit)) + '</table>' +
    (i.desc ? '<div class="dt-desc">' + esc(i.desc) + '</div>' : '') +
    ((wa || (phone && !/^0?7700000000$/.test(phone))) ? '<div class="contact">' +
      (wa ? '<button class="btn primary" data-action="inq-add" data-id="' + esc(i.id) + '">' + (INQ.find(x => x.id === i.id) ? '✔ في قائمة الاستفسار' : '＋ أضف لقائمة الاستفسار') + '</button>' : '') +
      (wa ? '<a class="btn green" target="_blank" rel="noopener" href="https://wa.me/' + esc(wa) + '?text=' + encodeURIComponent('استفسار عن: ' + i.name + (i.code ? ' (' + i.code + ')' : '')) + '">واتساب — استفسار</a>' : '') +
      (phone && !/^0?7700000000$/.test(phone) ? '<a class="btn ghost" href="tel:' + esc(phone) + '">📞 اتصال</a>' : '') + '</div>' : '') +
    '<div class="contact"><button class="btn ghost" data-action="share-item" data-id="' + esc(i.id) + '">🔗 مشاركة القطعة</button></div>';
  openModal('mItem');
  if (i.imageUrl) { const t = document.getElementById('dtTile'); if (t) t.innerHTML = '<img src="' + esc(i.imageUrl) + '" alt="">'; }
  else if (i.hasImage) db.collection('images').doc(id).get().then(s => {
    const t = document.getElementById('dtTile');
    if (s.exists && t) t.innerHTML = '<img src="' + esc(s.data().data) + '" alt="">';
  }).catch(() => {});
}

// ═══ قائمة الاستفسار: تجميع عدة قطع وإرسالها رسالة واتساب واحدة (لا شراء ولا حفظ في قاعدة البيانات) ═══
let INQ = [];
try { INQ = JSON.parse(localStorage.getItem('inq') || '[]'); } catch (e) {}
const saveInq = () => { try { localStorage.setItem('inq', JSON.stringify(INQ)); } catch (e) {} drawInqFab(); };
function drawInqFab() {
  let f = document.getElementById('inqFab');
  if (!f) { f = document.createElement('button'); f.id = 'inqFab'; f.className = 'inq-fab'; f.dataset.action = 'inq-open'; document.body.appendChild(f); }
  const n = INQ.reduce((a, x) => a + x.qty, 0);
  f.classList.toggle('hidden', !INQ.length || !String(T.cfg.whatsapp || '').trim());
  f.innerHTML = '📋 قائمة الاستفسار <b class="num">' + n + '</b>';
}
function openInq() {
  const body = INQ.length ? INQ.map((x, k) => '<div class="inq-row"><div class="grow"><b>' + esc(x.name) + '</b>' + (x.code ? '<div class="small muted code" dir="ltr">' + esc(x.code) + '</div>' : '') + '</div>' +
    '<div class="qty"><button data-inq-q="' + k + '" data-d="1">+</button><b class="num">' + x.qty + '</b><button data-inq-q="' + k + '" data-d="-1">−</button></div></div>').join('') +
    '<div class="field mt"><label class="f">اسمك (اختياري)</label><input id="inqName" maxlength="60"></div><div class="field"><label class="f">ملاحظة (اختياري)</label><input id="inqNote" maxlength="200" placeholder="مثال: السيارة / الماكنة / الاستعجال"></div>'
    : '<div class="noresult"><b>القائمة فارغة</b>افتح أي قطعة واضغط "أضف لقائمة الاستفسار"</div>';
  let m = document.getElementById('mInq');
  if (!m) { m = document.createElement('div'); m.id = 'mInq'; m.className = 'modal'; document.body.appendChild(m); }
  m.innerHTML = '<div class="modal-card"><div class="modal-head"><h3>📋 قائمة الاستفسار</h3><button class="x" data-close="mInq" aria-label="إغلاق">✕</button></div><div class="modal-body">' + body + '</div>' +
    (INQ.length ? '<div class="modal-foot"><button class="btn green" data-action="inq-send">إرسال عبر واتساب</button><button class="btn ghost" data-action="inq-clear">تفريغ</button></div>' : '') + '</div>';
  openModal('mInq');
}
drawInqFab();

// ═══ الأحداث ═══
const q = document.getElementById('q');
q.addEventListener('input', debounce(() => { T.limit = STEP; render(); }, 150));
q.addEventListener('keydown', e => { if (e.key === 'Enter') { q.blur(); document.getElementById('filters').scrollIntoView({ behavior: 'smooth' }); } });
document.getElementById('qClear').addEventListener('click', () => { q.value = ''; render(); q.focus(); });
document.getElementById('sort').addEventListener('change', render);
document.getElementById('onlyStock').addEventListener('change', () => { T.limit = STEP; render(); });
document.getElementById('reset').addEventListener('click', () => {
  q.value = ''; T.cat = ''; T.brand = ''; document.getElementById('onlyStock').checked = false; T.limit = STEP; renderFilters(); render();
});
document.addEventListener('click', e => {
  const c = e.target.closest('[data-cat]');
  if (c) { T.cat = c.dataset.cat; T.limit = STEP; renderFilters(); render(); return; }
  const b = e.target.closest('[data-brand]');
  if (b) { T.brand = b.dataset.brand; T.limit = STEP; renderFilters(); render(); return; }
  const ex = e.target.closest('[data-ex]');
  if (ex) { q.value = ex.dataset.ex; T.limit = STEP; render(); return; }
  const it = e.target.closest('[data-item]');
  if (it) { openItem(it.dataset.item); return; }
  const iq = e.target.closest('[data-inq-q]');
  if (iq) { const x = INQ[iq.dataset.inqQ]; x.qty += +iq.dataset.d; if (x.qty <= 0) INQ.splice(iq.dataset.inqQ, 1); saveInq(); openInq(); return; }
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const act = a.dataset.action;
  if (act === 'theme') toggleTheme();
  if (act === 'more') { T.limit += STEP; render(); }
  if (act === 'inq-add') {
    const i = T.items.find(x => x.id === a.dataset.id); if (!i) return;
    const ex = INQ.find(x => x.id === i.id);
    if (ex) ex.qty++; else INQ.push({ id: i.id, name: i.name, code: i.code || '', qty: 1 });
    saveInq(); a.textContent = '✔ في قائمة الاستفسار'; toast('أُضيفت للقائمة');
  }
  if (act === 'inq-open') openInq();
  if (act === 'inq-clear') { INQ = []; saveInq(); closeModal('mInq'); }
  if (act === 'inq-send') {
    const name = (document.getElementById('inqName') || {}).value || '', note = (document.getElementById('inqNote') || {}).value || '';
    const txt = 'مرحباً، أريد الاستفسار عن توفر وأسعار القطع التالية:\n' + INQ.map((x, k) => (k + 1) + '. ' + x.name + (x.code ? ' [' + x.code + ']' : '') + ' — العدد: ' + x.qty).join('\n') +
      (note.trim() ? '\nملاحظة: ' + note.trim() : '') + (name.trim() ? '\n— ' + name.trim() : '');
    window.open('https://wa.me/' + String(T.cfg.whatsapp).replace(/\D/g, '') + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  }
});
registerSW();

// ═══ مشاركة رابط القطعة (الرابط الثابت /p/<id> يعطي معاينة باسم القطعة في واتساب) ═══
const _closeModal = closeModal;
closeModal = function (id) { _closeModal(id); if (id === 'mItem' && T.item) { T.item = ''; writeUrl(); document.title = T.title || document.title; } };
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-action=share-item]'); if (!b) return;
  const i = T.items.find(x => x.id === b.dataset.id); if (!i) return;
  const url = location.origin + '/p/' + encodeURIComponent(i.id);
  try { if (navigator.share) { await navigator.share({ title: i.name, text: i.name + (i.code ? ' (' + i.code + ')' : ''), url }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('تم نسخ رابط القطعة'); } catch (err) { prompt('انسخ الرابط:', url); }
});
