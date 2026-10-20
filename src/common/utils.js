// ═══ أدوات مشتركة ═══

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function num(v, d) { const n = parseFloat(v); return isFinite(n) ? n : (d === undefined ? 0 : d); }

function fmtN(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

function fmtMoney(n, s) {
  s = s || {};
  n = Number(n || 0);
  const er = Number(s.exrate) || 1300;
  if (s.currency === 'USD') return '$' + (n / er).toFixed(2);
  if (s.currency === 'BOTH') return fmtN(n) + ' د.ع ($' + (n / er).toFixed(0) + ')';
  return fmtN(n) + ' د.ع';
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function tsMillis(ts) { return !ts ? 0 : ts.toMillis ? ts.toMillis() : Number(ts) || 0; }

// توحيد الحروف العربية للبحث: أ إ آ ← ا ، ة ← ه ، ى ← ي ، حذف التشكيل
function normAr(s) {
  return String(s || '').toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ـ/g, '')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/\s+/g, ' ').trim();
}

// بحث ذكي محلي: كل كلمة لازم تطابق، مع تسامح بسيط مع الأخطاء الإملائية
function matchScore(haystack, query) {
  const h = normAr(haystack);
  const words = normAr(query).split(' ').filter(Boolean);
  if (!words.length) return 1;
  let score = 0;
  for (const w of words) {
    if (h.includes(w)) { score += 2; continue; }
    if (w.length >= 4 && fuzzyIncludes(h, w)) { score += 1; continue; }
    return 0;
  }
  return score;
}
function fuzzyIncludes(h, w) {
  // يسمح بحرف واحد مختلف
  for (const tok of h.split(' ')) {
    if (Math.abs(tok.length - w.length) > 1) continue;
    if (lev1(tok, w)) return true;
  }
  return false;
}
function lev1(a, b) {
  if (a === b) return true;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

function debounce(fn, ms) {
  let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(this, a), ms); };
}

// ═══ Toast ═══
function toast(msg, type) {
  type = type || 'success';
  let c = document.getElementById('toasts');
  if (!c) { c = document.createElement('div'); c.id = 'toasts'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = (type === 'success' ? '✅ ' : type === 'error' ? '⛔ ' : 'ℹ️ ') + msg;
  c.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3600);
}

// ═══ Modal ═══
// النوافذ: قابلة للاستخدام بلوحة المفاتيح وقارئ الشاشة (role=dialog، التركيز داخلها، Esc للإغلاق)
const FOCUSABLE = 'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
function openModal(id) {
  const m = document.getElementById(id); if (!m) return;
  if (!m.classList.contains('open')) m._ret = document.activeElement;
  m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
  const h = m.querySelector('h3'); if (h) { h.id = h.id || id + '_t'; m.setAttribute('aria-labelledby', h.id); }
  m.classList.add('open'); document.body.classList.add('noscroll');
  setTimeout(() => {
    if (m.contains(document.activeElement)) return;
    const body = m.querySelector('.modal-body') || m;
    const f = [...body.querySelectorAll(FOCUSABLE)].find(x => x.offsetParent !== null && !x.closest('.hidden')) || m.querySelector('.modal-head .x');
    if (f && !(matchMedia('(pointer:coarse)').matches && /INPUT|TEXTAREA/.test(f.tagName))) f.focus({ preventScroll: true });
  }, 30);
}
function closeModal(id) {
  const m = document.getElementById(id); if (m) m.classList.remove('open');
  if (!document.querySelector('.modal.open')) document.body.classList.remove('noscroll');
  if (m && m._ret && document.contains(m._ret) && typeof m._ret.focus === 'function') { try { m._ret.focus({ preventScroll: true }); } catch (e) {} m._ret = null; }
}
document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]');
  if (c) closeModal(c.dataset.close);
  else if (e.target.classList.contains('modal') && e.target.id && !e.target.hasAttribute('data-static')) closeModal(e.target.id);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    const m = [...document.querySelectorAll('.modal.open')].pop(); if (!m) return;
    const els = [...m.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null); if (!els.length) return;
    const a = els[0], z = els[els.length - 1];
    if (!m.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
    else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  if (e.key === 'Escape') { const m = [...document.querySelectorAll('.modal.open')].pop(); if (m && m.id && !m.hasAttribute('data-static')) closeModal(m.id); }
});

function confirmBox(msg, okText, danger) {
  return new Promise(resolve => {
    const m = document.createElement('div');
    m.className = 'modal open'; m.style.zIndex = 3000;
    m.innerHTML = '<div class="modal-card sm"><div class="modal-body"><p class="confirm-msg"></p></div>' +
      '<div class="modal-foot"><button class="btn ghost" data-a="no">إلغاء</button>' +
      '<button class="btn ' + (danger ? 'danger' : 'primary') + '" data-a="yes"></button></div></div>';
    m.querySelector('.confirm-msg').textContent = msg;
    m.querySelector('[data-a=yes]').textContent = okText || 'تأكيد';
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      const a = e.target.dataset.a;
      if (a || e.target === m) { m.remove(); resolve(a === 'yes'); }
    });
  });
}

// ═══ الصور: ضغط وتصغير قبل الحفظ ═══
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function fileToDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
async function compressImage(src, maxSide, quality) {
  if (src instanceof Blob) src = await fileToDataURL(src);
  const img = await loadImage(src);
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

// ═══ الوضع الليلي ═══
function initTheme() {
  let t = null;
  try { t = localStorage.getItem('theme'); } catch (e) {}
  if (t) document.documentElement.dataset.theme = t;
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) {}
}
initTheme();

// أرقام إنجليزية (15 بدل ١٥) في حقول الأرقام حتى تطابق الجداول
function enDigits(root) { (root.querySelectorAll ? root : document).querySelectorAll('input[type=number],input[type=date]').forEach(i => { i.lang = 'en'; }); }
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches('input[type=number]')) n.lang = 'en'; else enDigits(n); } })))
  .observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', () => enDigits(document));

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// رسائل أخطاء Firebase بالعربي
function authErr(e) {
  const m = {
    'auth/invalid-credential': 'الإيميل أو كلمة المرور غير صحيحة',
    'auth/wrong-password': 'الإيميل أو كلمة المرور غير صحيحة',
    'auth/user-not-found': 'الإيميل أو كلمة المرور غير صحيحة',
    'auth/too-many-requests': 'محاولات كثيرة — انتظر قليلاً ثم حاول',
    'auth/email-already-in-use': 'هذا الإيميل مسجل مسبقاً — سجّل الدخول',
    'auth/weak-password': 'كلمة المرور ضعيفة — 8 أحرف على الأقل',
    'auth/invalid-email': 'الإيميل غير صحيح',
    'auth/network-request-failed': 'لا يوجد اتصال بالإنترنت',
    'permission-denied': 'ليس لديك صلاحية لهذه العملية'
  };
  return m[e && e.code] || (e && e.message) || 'حدث خطأ';
}
