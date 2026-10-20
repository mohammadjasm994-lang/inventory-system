// ═══════════════════════════════════════════════════════════
// تنظيف البيانات: توحيد الماركات، استخراج الماركة من الاسم، توحيد الكتابة،
// المسافات، الناقص، المكرر (مع الدمج) — كل تعديل جماعي قابل للتراجع
// ═══════════════════════════════════════════════════════════
const KNOWN_BRANDS = ['FAG', 'SKF', 'NSK', 'NTN', 'SNR', 'INA', 'TIMKEN', 'KOYO', 'NACHI', 'ZWZ', 'IKO', 'THK', 'SIEMENS', 'ABB', 'SCHNEIDER', 'LS', 'CHINT', 'LEGRAND', 'DANFOSS',
  'OMRON', 'MITSUBISHI', 'DELTA', 'WEG', 'HAGER', 'EATON', 'HONEYWELL', 'BOSCH', 'GATES', 'OPTIBELT', 'CONTITECH', 'FESTO', 'SMC', 'PARKER', 'REXROTH', 'TELEMECANIQUE', 'FUJI', 'YASKAWA', 'LOVATO', 'GE'];
const brandKey = b => normBrand(b).replace(/[^A-Z0-9؀-ۿ]/g, '');

page('cleanup', {
  t: 'تنظيف البيانات', ic: '🧹', admin: true, deps: ['products'],
  html: () => '<div id="clBody"></div>',
  init(el) {
    el.addEventListener('input', e => { const k = e.target.dataset.bk; if (k != null) CL_EDIT.brand[k] = e.target.value; const sk = e.target.dataset.sk; if (sk != null) CL_EDIT.spell[sk] = e.target.value; });
    el.addEventListener('change', e => { const id = e.target.dataset.pid; if (id) { if (e.target.checked) CL_EDIT.bfnOff.delete(id); else CL_EDIT.bfnOff.add(id); } });
    el.addEventListener('focusout', () => setTimeout(() => { if (CL_EDIT.pending && !el.contains(document.activeElement)) renderCleanup(); }, 50));
  },
  render: () => renderCleanup()
});

function cleanupData() {
  const ps = activeProducts();
  // 1) الماركات بأكثر من كتابة
  const bg = {};
  ps.forEach(p => { if (!p.brand) return; const k = brandKey(p.brand); (bg[k] = bg[k] || {}); const raw = String(p.brand).trim(); bg[k][raw] = (bg[k][raw] || 0) + 1; });
  // دمج الأخطاء الإملائية القريبة (Slemens ≈ Siemens) في مجموعة الماركة الأكبر
  const keys = Object.keys(bg).sort((a, b) => Object.values(bg[b]).reduce((x, y) => x + y, 0) - Object.values(bg[a]).reduce((x, y) => x + y, 0));
  keys.forEach((k, i) => {
    if (!bg[k] || k.length < 4) return;
    for (let j = 0; j < i; j++) {
      const big = keys[j]; if (!bg[big] || big.length < 4) continue;
      if (levDist(k, big) === 1) { Object.entries(bg[k]).forEach(([raw, n]) => bg[big][raw] = (bg[big][raw] || 0) + n); bg[big]._fused = (bg[big]._fused || []).concat([k]); delete bg[k]; break; }
    }
  });
  Object.values(bg).forEach(v => { if (v._fused) { v.__keys = v._fused; delete v._fused; } });
  const brandGroups = Object.entries(bg).filter(([, v]) => Object.keys(v).filter(x => x !== '__keys').length > 1).map(([k, v]) => {
    const fused = v.__keys || []; delete v.__keys;
    const variants = Object.entries(v).sort((a, b) => b[1] - a[1]);
    return { key: k, keys: [k].concat(fused), variants, canonical: normBrand(variants[0][0]), count: variants.reduce((a, x) => a + x[1], 0) };
  }).sort((a, b) => b.count - a.count);
  // 2) ماركة موجودة في الاسم والحقل فارغ
  const known = new Set(KNOWN_BRANDS.concat(Object.entries(bg).filter(([, v]) => Object.values(v).reduce((a, x) => a + x, 0) >= 2).map(([, v]) => normBrand(Object.keys(v)[0]))).filter(b => b.length >= 2));
  const brandFromName = [];
  ps.filter(p => !p.brand).forEach(p => {
    const up = ' ' + String(p.name || '').toUpperCase().replace(/[^A-Z0-9؀-ۿ]+/g, ' ') + ' ';
    for (const b of known) if (/^[A-Z0-9]+$/.test(b) && up.includes(' ' + b + ' ')) { brandFromName.push({ p, brand: b }); break; }
  });
  // 3) كلمة أولى بأكثر من كتابة (بولبرين / بوربلين / بلبرين)
  const fw = {};
  ps.forEach(p => { const w = firstWord(p.name); if (w.length >= 4) fw[w] = (fw[w] || 0) + 1; });
  const words = Object.entries(fw).sort((a, b) => b[1] - a[1]);
  const spell = [];
  const used = new Set(), ignored = new Set(S.settings.spellIgnore || []);
  // كلمة فيها حرف مكرر 3 مرات (بولبريننن) لا تصلح أن تكون هي "الصحيحة" حتى لو كانت أكثر
  const looksTypo = w => /(.)\1\1/.test(w) || /(.)\1$/.test(w);
  words.forEach(([main, n]) => {
    if (used.has(main) || n < 5) return;
    words.forEach(([w, m]) => {
      if (w === main || used.has(w) || m >= n) return;
      // صارم: حرف واحد للكلمات القصيرة (≤5) وحرفان للطويلة — حتى لا يخلط "كابل" بـ"كارت"
      const a = normAr(w), b = normAr(main), maxD = Math.min(a.length, b.length) <= 5 ? 1 : 2;
      if (levDist(a, b) <= maxD && Math.abs(w.length - main.length) <= 2) {
        used.add(w);
        if (ignored.has(spellKey(w, main))) return;
        spell.push(looksTypo(main) && !looksTypo(w) ? { from: main, to: w, n, main: m } : { from: w, to: main, n: m, main: n });
      }
    });
  });
  // 4) مسافات: زائدة، أو ملتصقة بين عربي ولاتيني
  const fixName = s => String(s || '').replace(/([؀-ۿ])([A-Za-z0-9])/g, '$1 $2').replace(/([A-Za-z0-9.])([؀-ۿ])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  const spaces = ps.filter(p => fixName(p.name) !== p.name).map(p => ({ p, to: fixName(p.name) }));
  // 5) ناقص
  const missing = { price: ps.filter(p => !(num(p.price) > 0)).length, barcode: ps.filter(p => !p.barcode), brand: ps.filter(p => !p.brand).length, image: ps.filter(p => !imgSrc(p)).length, cost: ps.filter(p => !(num(p.cost) > 0)).length };
  // 6) مكرر: نفس الباركود، أو نفس الاسم
  const byBc = {}, byName = {};
  ps.forEach(p => { if (p.barcode) (byBc[p.barcode] = byBc[p.barcode] || []).push(p); const k = compactCode(normAr(p.name)); if (k) (byName[k] = byName[k] || []).push(p); });
  const dupBarcode = Object.values(byBc).filter(g => g.length > 1);
  const dupName = Object.values(byName).filter(g => g.length > 1);
  // نفس رقم القطعة ونفس الماركة (أو ماركة فارغة) لكن بأسماء مختلفة — مثل "بولبرين FAG NU220" و"بورلبلين NU220"
  const inName = new Set(dupName.flat().map(p => p.id));
  const byCode = {};
  ps.forEach(p => { const c = compactCode(partCode(p.name, p.brand)); if (c.length >= 4) (byCode[c] = byCode[c] || []).push(p); });
  const dupCode = Object.values(byCode).map(g => {
    const brands = new Set(g.map(p => effBrand(p.name, p.brand)).filter(Boolean));
    return brands.size <= 1 ? g : null; // ماركات مختلفة = قطع مختلفة فعلاً
  }).filter(g => g && g.length > 1 && !g.every(p => inName.has(p.id)));
  // 7) سالب
  const negative = ps.filter(p => num(p.qty) < 0);
  return { ps, brandGroups, brandFromName, spell, spaces, missing, dupBarcode, dupName, dupCode, negative, fixName };
}
// أول كلمة عربية في الاسم بالضبط (حتى لا يطابق "بولبرين" بداية "بولبريننن")
function firstWord(name) { const m = String(name == null ? '' : name).trim().match(/^[؀-ۿ]+/); return m ? m[0] : ''; }
const spellKey = (a, b) => [a, b].sort().join('|');
// الاقتراح كما يراه المستخدم بعد عكس الاتجاه (⇄)
function spellEff(s) { return CL_EDIT.spellSwap.has(spellKey(s.from, s.to)) ? { from: s.to, to: s.from, n: s.main, main: s.n } : s; }
function levDist(a, b) {
  const m = a.length, n = b.length; if (Math.abs(m - n) > 3) return 9;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

let CL = null;
// ما عدّله المستخدم في الاقتراحات (يبقى بعد إعادة الرسم): نص الماركة لكل مجموعة، والعناصر غير المحددة
const CL_EDIT = { brand: {}, bfnOff: new Set(), spell: {}, spellSwap: new Set(), pending: false };
function renderCleanup() {
  const el = document.getElementById('clBody'); if (!el) return;
  // المستخدم يكتب الآن ← نؤجل إعادة الرسم حتى يخرج من الحقل
  if (el.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'checkbox') { CL_EDIT.pending = true; return; }
  CL_EDIT.pending = false;
  CL = cleanupData();
  const issues = CL.brandGroups.length + (CL.brandFromName.length ? 1 : 0) + CL.spell.length + (CL.spaces.length ? 1 : 0) + CL.dupBarcode.length + CL.dupName.length + (CL.negative.length ? 1 : 0);
  const sec = (ic, title, count, body, action) => '<div class="card mb"><div class="card-h"><h3>' + ic + ' ' + title + '</h3>' + (count ? '<span class="badge b-yellow">' + count + '</span>' : '<span class="badge b-green">✔ نظيف</span>') + '<span class="spacer"></span>' + (count && action ? action : '') + '</div>' + (count ? '<div class="card-b">' + body + '</div>' : '') + '</div>';
  el.innerHTML =
    '<div class="info-box mb">' + (issues ? 'وجدنا <b>' + issues + '</b> نوع من المشاكل في بيانات ' + fmtN(CL.ps.length) + ' منتج. كل إصلاح جماعي يظهر بعده زر <b>تراجع</b>.' : '✔ البيانات نظيفة') + '</div>' +
    sec('🏷', 'ماركات مكتوبة بأكثر من شكل', CL.brandGroups.length,
      '<table class="t"><thead><tr><th>الكتابات الموجودة</th><th>توحيدها إلى</th><th></th></tr></thead><tbody>' + CL.brandGroups.map((g, i) =>
        '<tr><td>' + g.variants.map(v => '<span class="badge b-gray">' + esc(v[0]) + ' (' + v[1] + ')</span>').join(' ') + '</td><td><input class="mini" style="width:140px" data-bg="' + i + '" data-bk="' + esc(g.key) + '" value="' + esc(CL_EDIT.brand[g.key] != null ? CL_EDIT.brand[g.key] : g.canonical) + '"></td><td><button class="btn sm primary" data-action="cl-brand" data-i="' + i + '">توحيد</button></td></tr>').join('') + '</tbody></table>',
      '<button class="btn sm primary" data-action="cl-brand-all">توحيد الكل</button>') +
    sec('🔎', 'ماركة مكتوبة في الاسم لكن حقل الماركة فارغ', CL.brandFromName.length,
      '<p class="small muted mb">مثال: "بولبرين FAG NU220" بدون ماركة ← نضع FAG في حقل الماركة.</p><div class="ex-list">' + CL.brandFromName.slice(0, 400).map((x, i) =>
        '<label><input type="checkbox" data-bfn="' + i + '" data-pid="' + esc(x.p.id) + '"' + (CL_EDIT.bfnOff.has(x.p.id) ? '' : ' checked') + '><span class="grow">' + esc(x.p.name) + '</span><span class="badge b-blue">' + esc(x.brand) + '</span></label>').join('') + '</div>',
      '<button class="btn sm primary" data-action="cl-bfn">تطبيق المحدد (' + CL.brandFromName.length + ')</button>') +
    sec('✏️', 'كلمات بأكثر من كتابة في الأسماء', CL.spell.length,
      CL.spell.map((s0, i) => { const s = spellEff(s0), k = spellKey(s0.from, s0.to), v = CL_EDIT.spell[k] != null ? CL_EDIT.spell[k] : s.to;
        return '<div class="row mb spell-row"><span class="badge b-red">' + esc(s.from) + ' (' + s.n + ')</span> ← <input class="mini" style="width:150px" data-sk="' + esc(k) + '" value="' + esc(v) + '" aria-label="الكتابة الصحيحة">' +
          '<span class="small muted">(' + esc(s.to) + ' موجودة في ' + s.main + ')</span><span class="spacer"></span>' +
          '<button class="btn sm ghost" data-action="cl-spell-swap" data-i="' + i + '" title="عكس الاتجاه" aria-label="عكس الاتجاه">⇄</button>' +
          '<button class="btn sm ghost" data-action="cl-spell-ignore" data-i="' + i + '">تجاهل</button>' +
          '<button class="btn sm primary" data-action="cl-spell" data-i="' + i + '">تصحيح ' + s.n + ' اسم</button></div>'; }).join('') +
      '<p class="small muted">الخانة البيضاء = الكتابة الصحيحة — <b>عدّلها</b> إذا الاقتراح غلط. ⇄ يعكس الاتجاه، و"تجاهل" يخفي الاقتراح نهائياً. تأكد أن الكلمتين نفس المعنى.</p>') +
    sec('␣', 'مسافات زائدة أو كلمات ملتصقة', CL.spaces.length,
      '<div class="ex-list">' + CL.spaces.slice(0, 30).map(x => '<label><span class="grow small">' + esc(x.p.name) + '</span><span class="small green">← ' + esc(x.to) + '</span></label>').join('') + '</div>',
      '<button class="btn sm primary" data-action="cl-spaces">إصلاح الكل (' + CL.spaces.length + ')</button>') +
    sec('🔁', 'باركود مكرر (أكثر من منتج بنفس الباركود)', CL.dupBarcode.length, dupHtml(CL.dupBarcode, 'bc')) +
    sec('👯', 'منتجات بنفس الاسم (غالباً مكررة)', CL.dupName.length, dupHtml(CL.dupName, 'nm')) +
    sec('🔢', 'نفس رقم القطعة بأسماء مختلفة (نفس القطعة مسجلة أكثر من مرة)', CL.dupCode.length, '<p class="small muted mb">انتبه لمكان كل نسخة 📍 — بعد الدمج تصير قطعة واحدة بكمية واحدة ومكان واحد.</p>' + dupHtml(CL.dupCode, 'pc')) +
    sec('➖', 'كميات سالبة (بيع أكثر من المسجل)', CL.negative.length ? 1 : 0,
      '<p class="small mb">' + CL.negative.length + ' منتج كميته سالبة. هذا يعني أن الكمية المسجلة كانت أقل من الحقيقية — الحل جرد هذه القطع.</p><a class="btn sm ghost" href="#products?filter=out">عرضها</a>') +
    '<div class="card"><div class="card-h"><h3>📋 بيانات ناقصة</h3></div><div class="card-b missing-grid">' +
    '<a class="mi" href="#products?filter=noPrice"><b class="num">' + fmtN(CL.missing.price) + '</b><span>بدون سعر بيع</span></a>' +
    '<div class="mi"><b class="num">' + fmtN(CL.missing.barcode.length) + '</b><span>بدون باركود</span>' + (CL.missing.barcode.length ? '<button class="btn sm primary" data-action="cl-gen-barcodes">توليد باركود للكل</button>' : '') + '</div>' +
    '<a class="mi" href="#products?filter=noBrand"><b class="num">' + fmtN(CL.missing.brand) + '</b><span>بدون ماركة</span></a>' +
    '<a class="mi" href="#products?filter=noImage"><b class="num">' + fmtN(CL.missing.image) + '</b><span>بدون صورة</span></a>' +
    '<div class="mi"><b class="num">' + fmtN(CL.missing.cost) + '</b><span>بدون سعر شراء</span></div></div></div>' +
    '<div class="card mt"><div class="card-h"><h3>🔤 بحث واستبدال في الأسماء</h3></div><div class="card-b"><div class="grid3">' +
    '<div class="field"><label class="f">ابحث عن</label><input id="frFind"></div><div class="field"><label class="f">استبدل بـ</label><input id="frRep"></div>' +
    '<div class="field"><label class="f">&nbsp;</label><button class="btn primary block" data-action="cl-replace">معاينة وتنفيذ</button></div></div></div></div>';
}
function dupHtml(groups, kind) {
  return groups.slice(0, 50).map((g, gi) => '<div class="dup"><div class="small muted mb">' + (kind === 'bc' ? 'الباركود ' + esc(g[0].barcode) : '') + '</div>' +
    g.map((p, i) => '<label class="row"><input type="radio" name="dup_' + kind + gi + '" value="' + esc(p.id) + '"' + (i === 0 ? ' checked' : '') + '><span class="grow small"><b>' + esc(p.name) + '</b> · ' + esc(normBrand(p.brand) || '—') + ' · ' + (p.barcode ? '<span class="num">' + esc(p.barcode) + '</span>' : 'بدون باركود') + '<br><b>' + esc(placeText(p)) + '</b></span><span class="num small">' + money(p.price) + '</span><a href="#" class="small" data-action="edit-product" data-id="' + esc(p.id) + '">فتح</a></label>').join('') +
    '<div class="row mt"><span class="small muted grow">اختر المنتج الأساسي ⬆</span><button class="btn sm primary" data-action="cl-merge" data-kind="' + kind + '" data-g="' + gi + '">دمج في الأساسي</button>' +
    (kind === 'bc' ? '<button class="btn sm ghost" data-action="cl-rebarcode" data-g="' + gi + '">باركود جديد للبقية</button>' : '') + '</div></div>').join('') +
    (groups.length > 50 ? '<p class="small muted">… و' + (groups.length - 50) + ' مجموعة أخرى</p>' : '');
}

async function runBulk(desc, changes) {
  if (!changes.length) return toast('لا يوجد شيء للتعديل', 'info');
  try { const res = await bulkApply(desc, changes); undoToast(res, desc); }
  catch (e) { toast(authErr(e), 'error'); reportError('تنظيف البيانات: ' + desc + ' — ' + (e.code || '') + ' ' + (e.message || e), e.stack); }
}
async function mergeProducts(primaryId, ids) {
  const prim = S.products.get(primaryId), others = ids.filter(id => id !== primaryId).map(id => S.products.get(id)).filter(Boolean);
  if (!prim || !others.length) return;
  const sumQ = others.reduce((a, p) => a + num(p.qty), 0);
  if (!await confirmBox('دمج ' + others.length + ' منتج في "' + prim.name + '"؟\n• تُنقل كمياتها (' + fmtN(sumQ) + ') للمنتج الأساسي\n• تُنقل المكررات لسلة المحذوفات\n• الفواتير القديمة تبقى كما هي', 'دمج')) return;
  const w = W();
  others.forEach(p => {
    if (num(p.qty)) { stockMove(w, p, -num(p.qty), 'merge', { note: 'دُمج في ' + prim.name }); stockMove(w, prim, num(p.qty), 'merge', { note: 'من ' + p.name }); }
    w.update(col('products').doc(p.id), { deleted: true, deletedAt: TS(), deletedBy: S.user.email, mergedInto: prim.id, updatedAt: TS() });
    w.log('merge', 'product', p.id, p.name, { into: prim.name });
  });
  if (!prim.barcode) { const bc = others.find(p => p.barcode); if (bc) w.update(col('products').doc(prim.id), { barcode: bc.barcode, updatedAt: TS() }); }
  w.catalog = true;
  try { await w.commit(); toast('تم الدمج ✔'); } catch (e) { toast(authErr(e), 'error'); }
}

act({
  'cl-brand': el => { const g = CL.brandGroups[el.dataset.i]; const to = document.querySelector('[data-bg="' + el.dataset.i + '"]').value.trim(); if (!to) return;
    runBulk('توحيد الماركة ' + to, CL.ps.filter(p => p.brand && g.keys.includes(brandKey(p.brand)) && p.brand !== to).map(p => ({ id: p.id, set: { brand: to } }))); },
  'cl-brand-all': () => { const ch = []; CL.brandGroups.forEach((g, i) => { const to = document.querySelector('[data-bg="' + i + '"]').value.trim(); if (to) CL.ps.filter(p => p.brand && g.keys.includes(brandKey(p.brand)) && p.brand !== to).forEach(p => ch.push({ id: p.id, set: { brand: to } })); });
    runBulk('توحيد كل الماركات', ch); },
  'cl-bfn': () => runBulk('ماركة من الاسم', CL.brandFromName.filter((x, i) => { const c = document.querySelector('[data-bfn="' + i + '"]'); return !c || c.checked; }).map(x => ({ id: x.p.id, set: { brand: x.brand } }))),
  'cl-spell': async el => {
    const s0 = CL.spell[el.dataset.i]; if (!s0) return;
    const s = spellEff(s0), k = spellKey(s0.from, s0.to);
    const inp = document.querySelector('[data-sk="' + CSS.escape(k) + '"]');
    const to = (inp ? inp.value : s.to).replace(/\s+/g, ' ').trim();
    if (!to) return toast('اكتب الكتابة الصحيحة', 'error');
    if (to === s.from) return toast('الكتابة الصحيحة نفس الخاطئة — لا يوجد تغيير', 'info');
    // أول كلمة تساوي الخاطئة بالضبط فقط (لا نلمس "بولبريننن" عند تصحيح "بولبرين")
    const hits = CL.ps.filter(p => firstWord(p.name) === s.from);
    const ex = hits[0] ? String(hits[0].name).trim() : '';
    if (!await confirmBox('تغيير "' + s.from + '" إلى "' + to + '" في ' + hits.length + ' اسم؟\nمثال: ' + ex + '  ←  ' + (to + ex.slice(s.from.length)), 'تصحيح')) return;
    delete CL_EDIT.spell[k];
    runBulk('تصحيح ' + s.from + ' ← ' + to, hits.map(p => ({ id: p.id, set: { name: (to + String(p.name).trim().slice(s.from.length)).replace(/\s+/g, ' ').trim() } })));
  },
  'cl-spell-swap': el => {
    const s0 = CL.spell[el.dataset.i]; if (!s0) return; const k = spellKey(s0.from, s0.to);
    if (CL_EDIT.spellSwap.has(k)) CL_EDIT.spellSwap.delete(k); else CL_EDIT.spellSwap.add(k);
    delete CL_EDIT.spell[k]; renderCleanup();
  },
  'cl-spell-ignore': async el => {
    const s0 = CL.spell[el.dataset.i]; if (!s0) return; const k = spellKey(s0.from, s0.to);
    if (!await confirmBox('إخفاء هذا الاقتراح نهائياً؟\n' + s0.from + ' / ' + s0.to, 'تجاهل')) return;
    try {
      await col('settings').doc('main').set({ spellIgnore: FV.arrayUnion(k) }, { merge: true });
      S.settings.spellIgnore = (S.settings.spellIgnore || []).concat([k]); renderCleanup(); toast('لن يظهر هذا الاقتراح مرة ثانية');
    } catch (e) { toast(authErr(e), 'error'); }
  },
  'cl-spaces': () => runBulk('إصلاح المسافات', CL.spaces.map(x => ({ id: x.p.id, set: { name: x.to } }))),
  'cl-gen-barcodes': async () => { const list = CL.missing.barcode; if (!await confirmBox('توليد باركود EAN-13 داخلي لـ ' + list.length + ' منتج؟ (يمكن طباعته كملصقات بعدها)', 'توليد')) return;
    const taken = new Set(activeProducts().map(p => p.barcode)); runBulk('توليد باركود', list.map(p => ({ id: p.id, set: { barcode: newBarcode(taken) } }))); },
  'cl-rebarcode': async el => { const g = CL.dupBarcode[el.dataset.g]; const keep = (document.querySelector('input[name="dup_bc' + el.dataset.g + '"]:checked') || {}).value;
    const taken = new Set(activeProducts().map(p => p.barcode)); runBulk('باركود جديد للمكرر', g.filter(p => p.id !== keep).map(p => ({ id: p.id, set: { barcode: newBarcode(taken) } }))); },
  'cl-merge': el => { const groups = el.dataset.kind === 'bc' ? CL.dupBarcode : el.dataset.kind === 'pc' ? CL.dupCode : CL.dupName; const g = groups[el.dataset.g];
    const keep = (document.querySelector('input[name="dup_' + el.dataset.kind + el.dataset.g + '"]:checked') || {}).value; mergeProducts(keep, g.map(p => p.id)); },
  'cl-replace': async () => {
    const f = document.getElementById('frFind').value, r = document.getElementById('frRep').value;
    if (!f) return toast('اكتب النص المراد البحث عنه', 'error');
    const hits = CL.ps.filter(p => String(p.name || '').includes(f));
    if (!hits.length) return toast('لا يوجد اسم يحتوي هذا النص', 'info');
    if (!await confirmBox('سيتغير ' + hits.length + ' اسم. أمثلة:\n' + hits.slice(0, 5).map(p => p.name + '  ←  ' + String(p.name).split(f).join(r).replace(/\s+/g, ' ').trim()).join('\n'), 'تنفيذ')) return;
    runBulk('استبدال "' + f + '"', hits.map(p => ({ id: p.id, set: { name: String(p.name).split(f).join(r).replace(/\s+/g, ' ').trim() } })));
  }
});
