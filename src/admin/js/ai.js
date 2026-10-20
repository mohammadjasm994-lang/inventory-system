// ═══════════════════════════════════════════════════════════
// التعبئة الذكية: صوّر القطعة أو الملصق (أو الصق معلوماتها) ← Google Gemini يقترح
// الاسم، الماركة، رقم القطعة، القسم، الوحدة، الباركود، الوصف — وأنت تراجع قبل التطبيق.
// يعمل عبر Firebase AI Logic (الخطة المجانية، المفتاح محفوظ عند Google وليس في الموقع).
// التفعيل مرة واحدة: Firebase Console ← AI Logic ← Get started ← Gemini Developer API
// ═══════════════════════════════════════════════════════════
const AI_SDK = 'https://www.gstatic.com/firebasejs/11.10.0/';
// احتياط فقط — الاختيار الفعلي تلقائي من قائمة النماذج المتاحة لحسابك (Google يوقف النماذج القديمة باستمرار)
const AI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const AI = { mod: null, imgs: [], result: null };

async function aiModel(name) {
  if (!AI.mod) {
    const [appM, aiM] = await Promise.all([import(AI_SDK + 'firebase-app.js'), import(AI_SDK + 'firebase-ai.js')]);
    const app = appM.getApps().find(a => a.name === 'ai') || appM.initializeApp(firebaseConfig, 'ai');
    if (typeof APP_CHECK_SITE_KEY !== 'undefined' && APP_CHECK_SITE_KEY) {
      try { const ac = await import(AI_SDK + 'firebase-app-check.js'); ac.initializeAppCheck(app, { provider: new ac.ReCaptchaV3Provider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true }); } catch (e) {}
    }
    AI.mod = { ai: aiM.getAI(app, { backend: new aiM.GoogleAIBackend() }), aiM };
  }
  const { ai, aiM } = AI.mod, Sc = aiM.Schema;
  const schema = Sc.object({
    properties: {
      name: Sc.string({ description: 'اسم القطعة بالعربي بنفس أسلوب أمثلة المحل: النوع + الماركة + رقم القطعة' }),
      brand: Sc.string({ description: 'الماركة/الشركة المصنعة بالإنجليزي (مثل SKF, FAG, SIEMENS) أو فارغ' }),
      partNumber: Sc.string({ description: 'رقم/موديل القطعة كما هو مكتوب، أو فارغ' }),
      category: Sc.string({ description: 'القسم — من قائمة أقسام المحل إن أمكن' }),
      unit: Sc.string({ description: 'الوحدة: قطعة، متر، كيلو، لتر، علبة، كرتون، طقم' }),
      barcode: Sc.string({ description: 'أرقام الباركود فقط إذا كانت مقروءة بوضوح في الصورة، وإلا فارغ' }),
      desc: Sc.string({ description: 'مواصفات مختصرة بالعربي: المقاسات، الجهد، القدرة، النوع… سطر أو سطرين' }),
      confidence: Sc.number({ description: 'مدى الثقة من 0 إلى 1' }),
      notes: Sc.string({ description: 'ملاحظة قصيرة بالعربي إذا كان هناك شك أو معلومة ناقصة، وإلا فارغ' })
    }
  });
  return aiM.getGenerativeModel(ai, { model: name, generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 } });
}

function aiContext() {
  const ps = activeProducts();
  const count = (arr) => Object.entries(arr.reduce((m, x) => (x && (m[x] = (m[x] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const cats = count(ps.map(p => p.category)).slice(0, 40);
  const brands = count(ps.map(p => normBrand(p.brand))).slice(0, 60);
  const samples = ps.filter(p => p.brand && /\d/.test(String(p.name))).sort(() => Math.random() - 0.5).slice(0, 12).map(p => p.name);
  return 'أنت مساعد إدخال بيانات لمحل قطع غيار صناعية في العراق (بولبرينات، كهربائيات، محركات، قواطع، أحزمة، هيدروليك…).\n' +
    'استخرج بيانات القطعة من الصور و/أو النص. اقرأ الملصق والعلبة والنقش على القطعة بدقة.\n' +
    'قواعد مهمة:\n- لا تخترع معلومة غير موجودة؛ اترك الحقل فارغاً إذا لم تكن متأكداً.\n' +
    '- الباركود: أرقام فقط وفقط إذا كانت ظاهرة بوضوح.\n- اكتب الماركة بالإنجليزي بحروف كبيرة إن كانت من القائمة.\n' +
    '- الاسم (name) يبدأ دائماً بنوع القطعة بالعربي (بولبرين، كونتاكتور، قاطع، محرك، ريليه، حزام…) ثم الماركة بالإنجليزي ثم رقم القطعة — حتى لو كان النص المدخل كله بالإنجليزي. مثال: "كونتاكتور SCHNEIDER LC1D25".\n' +
    '- الماركة (brand): إذا ذُكرت في النص أو الصورة (مثل Schneider أو Siemens) اكتبها دائماً بحروف كبيرة؛ لا تتركها فارغة.\n' +
    '- الوصف (desc) والملاحظات (notes) بالعربي دائماً — ترجم المواصفات المكتوبة بالإنجليزي (مثال: "بولبرين كروي، 25×52×15 مم، صنع في إيطاليا").\n' +
    '- القسم يجب أن يكون من أقسام المحل التالية إن أمكن: ' + (cats.join('، ') || 'ميكانيكي، كهربائي') + '\n' +
    '- ماركات موجودة في المحل: ' + brands.join(', ') + '\n' +
    '- أسلوب تسمية المحل (التزم به): ' + (samples.join(' | ') || 'بولبرين FAG 6205') + '\n';
}

function aiErrMsg(e) {
  const m = String((e && (e.message || e.code)) || e);
  if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(m)) return 'مفتاح Gemini غير صحيح — انسخه من جديد من Google AI Studio وضعه في الإعدادات.';
  if (/genai config not found|not been used|SERVICE_DISABLED|api-not-enabled|AI Logic|App ?Check/i.test(m)) return 'ضع مفتاح Gemini من Google AI Studio في: الإعدادات ← التعبئة الذكية.';
  if (/location is not supported|not available in your country|region/i.test(m)) return 'Google لا يدعم هذه الخدمة من موقعك الحالي.';
  if (/429|quota|RESOURCE_EXHAUSTED|rate/i.test(m)) return 'وصلت للحد المجاني المؤقت — انتظر دقيقة وأعد المحاولة.';
  if (/UNAVAILABLE|503|overloaded|high demand/i.test(m)) return 'خوادم Google مزدحمة الآن — أعد المحاولة بعد قليل.';
  if (/Failed to fetch|network|offline/i.test(m)) return 'لا يوجد اتصال بالإنترنت.';
  return 'تعذر التحليل: ' + m.slice(0, 200);
}

// ═══ الاتصال المباشر بـ Gemini API (مفتاح Google AI Studio — متاح في العراق) ═══
// المفتاح ليس في كود الموقع: محفوظ في settings/ai ولا يقرأه إلا الموظفون المسجلون
async function aiKey(force) {
  if (AI.key === undefined || force) {
    try { AI.key = ((await col('settings').doc('ai').get()).data() || {}).geminiKey || ''; } catch (e) { AI.key = ''; }
  }
  return AI.key;
}
const AI_REST_SCHEMA = { type: 'OBJECT', properties: Object.fromEntries(['name', 'brand', 'partNumber', 'category', 'unit', 'barcode', 'desc', 'notes'].map(k => [k, { type: 'STRING' }]).concat([['confidence', { type: 'NUMBER' }]])) };
async function aiRest(key, model, prompt, images) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }].concat(images.map(d => ({ inline_data: { mime_type: 'image/jpeg', data: d.split(',')[1] } }))) }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: AI_REST_SCHEMA, temperature: 0.2 }
  };
  // مهلة 25 ثانية لكل نموذج — إذا علق ننتقل للتالي بدل الانتظار الطويل
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 25000);
  let r;
  try {
    r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body)
    });
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'UNAVAILABLE: timeout ' + model : e.message); }
  finally { clearTimeout(to); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && (j.error.status + ': ' + j.error.message)) || ('HTTP ' + r.status));
  const txt = (((j.candidates || [])[0] || {}).content || {}).parts;
  if (!txt || !txt[0] || !txt[0].text) throw new Error('لم يرجع Gemini نتيجة' + (j.promptFeedback && j.promptFeedback.blockReason ? ' (' + j.promptFeedback.blockReason + ')' : ''));
  return JSON.parse(txt[0].text);
}

// أحدث نموذج flash ثابت متاح لحسابك (مثل gemini-3.8-flash) — يُحفظ ليوم واحد
async function aiPickModels(key) {
  try {
    const c = JSON.parse(localStorage.getItem('aiModels2') || 'null');
    if (c && Date.now() - c.at < 864e5 && c.list.length) return c.list;
  } catch (e) {}
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    const j = await r.json();
    const ver = n => (n.match(/gemini-(\d+(?:\.\d+)?)-/) || [])[1];
    const names = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''));
    const pick = re => names.filter(n => re.test(n)).sort((a, b) => parseFloat(ver(b)) - parseFloat(ver(a)));
    // الخفيف أولاً: أسرع بكثير (ثانية أو ثانيتين) ويكفي لقراءة الملصقات وأرقام القطع؛ الأكبر احتياط عند الازدحام
    const list = pick(/^gemini-\d+(\.\d+)?-flash-lite$/).slice(0, 1).concat(pick(/^gemini-\d+(\.\d+)?-flash$/).slice(0, 2));
    try { localStorage.setItem('aiModels2', JSON.stringify({ at: Date.now(), list })); } catch (e) {}
    return list;
  } catch (e) { return []; }
}

async function aiAnalyze(images, text) {
  const prompt = aiContext() + (text ? '\nمعلومات كتبها المستخدم:\n' + text : '') + '\nأرجع JSON فقط.';
  const parts = [prompt].concat(images.map(d => ({ inlineData: { mimeType: 'image/jpeg', data: d.split(',')[1] } })));
  const key = await aiKey();
  let lastErr;
  let good = ''; try { const g = JSON.parse(localStorage.getItem('aiGood') || 'null'); if (g && Date.now() - g.at < 864e5) good = g.model; } catch (e) {}
  const models = [S.settings.aiModel, good].concat(key ? await aiPickModels(key) : [], AI_MODELS).filter((x, i, a) => x && a.indexOf(x) === i);
  for (const name of models) {
    try {
      const out = key ? await aiRest(key, name, prompt, images) : JSON.parse((await (await aiModel(name)).generateContent(parts)).response.text());
      out._model = name;
      try { localStorage.setItem('aiGood', JSON.stringify({ model: name, at: Date.now() })); } catch (e) {}
      return out;
    } catch (e) {
      lastErr = e;
      // النموذج غير متاح أو مزدحم ← نجرب التالي؛ غير ذلك (مفتاح خاطئ، حد مجاني) لا فائدة
      if (!/not[ _]found|404|no longer available|is not supported for|unknown model|deprecated|UNAVAILABLE|503|overloaded|high demand|INTERNAL|500/i.test(String(e.message || e))) break; // الخطأ ليس من اسم النموذج ← لا فائدة من التجربة بغيره
    }
  }
  throw lastErr;
}

// ═══ نافذة التعبئة الذكية (فوق نافذة المنتج) ═══
const AI_FIELDS = [['name', 'الاسم'], ['brand', 'الماركة'], ['category', 'القسم'], ['unit', 'الوحدة'], ['barcode', 'الباركود'], ['desc', 'الوصف']];
function aiDialog() {
  const form = document.getElementById('productForm'); if (!form) return;
  if (S.settings.aiOn === false) return toast('التعبئة الذكية مطفأة من الإعدادات', 'info');
  AI.imgs = []; AI.result = null;
  const m = modal('mAI', '🤖 تعبئة ذكية من صورة أو نص',
    '<p class="small muted mb">صوّر <b>الملصق أو العلبة أو النقش على القطعة</b> بوضوح (حتى 3 صور)، أو الصق معلوماتها. ستراجع كل حقل قبل التطبيق.</p>' +
    '<div class="row mb"><label class="btn primary grow">📷 تصوير / اختيار صورة<input type="file" id="aiFile" accept="image/*" capture="environment" multiple hidden></label>' +
    (PM.img || imgSrc(S.products.get(PM.id) || {}) ? '<button type="button" class="btn ghost" id="aiUseImg">🖼 صورة المنتج الحالية</button>' : '') + '</div>' +
    '<div id="aiThumbs" class="ai-thumbs"></div>' +
    '<div class="field"><label class="f">أو اكتب/الصق معلومات القطعة (اختياري)</label><textarea id="aiText" rows="2" placeholder="مثال: بلبرينة SKF 6205-2RS أو نص من فاتورة المورد"></textarea></div>' +
    '<label class="row small mb"><input type="checkbox" id="aiSetImg"' + (PM.img || PM.id && imgSrc(S.products.get(PM.id) || {}) ? '' : ' checked') + '> استخدم الصورة الأولى كصورة للمنتج</label>' +
    '<div id="aiOut"></div>',
    '<button class="btn primary" id="aiGo">🤖 تحليل</button><button class="btn primary hidden" id="aiApply">✔ تطبيق على النموذج</button><button class="btn ghost" data-close="mAI">إلغاء</button>');
  const thumbs = () => { m.querySelector('#aiThumbs').innerHTML = AI.imgs.map((d, i) => '<div class="ai-thumb"><img src="' + esc(d) + '" alt=""><button type="button" data-rm="' + i + '" aria-label="حذف الصورة">✕</button></div>').join(''); };
  m.querySelector('#aiThumbs').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { AI.imgs.splice(+b.dataset.rm, 1); thumbs(); } });
  m.querySelector('#aiFile').addEventListener('change', async e => {
    for (const f of [...e.target.files].slice(0, 3 - AI.imgs.length)) { try { AI.imgs.push(await compressImage(f, 1280, 0.85)); } catch (x) {} }
    e.target.value = ''; thumbs();
  });
  const useImg = m.querySelector('#aiUseImg');
  if (useImg) useImg.onclick = async () => {
    const p = S.products.get(PM.id);
    const src = PM.img || (p ? await Images.full(p) : '');
    if (!src) return;
    try { AI.imgs.push(src.startsWith('data:') ? src : await compressImage(await (await fetch(src)).blob(), 1280, 0.85)); thumbs(); m.querySelector('#aiSetImg').checked = false; }
    catch (x) { toast('تعذر تحميل الصورة', 'error'); }
  };
  m.querySelector('#aiGo').onclick = async () => {
    const text = m.querySelector('#aiText').value.trim();
    if (!AI.imgs.length && !text) return toast('صوّر القطعة أو اكتب معلوماتها', 'error');
    if (!navigator.onLine) return toast('التحليل يحتاج إنترنت', 'error');
    const btn = m.querySelector('#aiGo'), out = m.querySelector('#aiOut');
    btn.disabled = true; btn.textContent = 'جاري التحليل…';
    out.innerHTML = '<div class="empty"><div class="spinner"></div><div class="small muted">Gemini يقرأ الصورة…</div></div>';
    try {
      const r = AI.result = await aiAnalyze(AI.imgs, text);
      if (r.partNumber && r.name && !compactCode(r.name).includes(compactCode(r.partNumber))) r.name = (r.name + ' ' + r.partNumber).trim();
      if (!r.brand && typeof effBrand === 'function') r.brand = effBrand(r.name || '', '') || '';
      if (r.brand) r.brand = normBrand(r.brand);
      if (r.barcode) r.barcode = String(r.barcode).replace(/\D/g, '');
      const el = form.elements;
      out.innerHTML = (r.notes ? '<div class="info-box small mb">💬 ' + esc(r.notes) + '</div>' : '') +
        '<table class="t ai-t"><thead><tr><th></th><th>الحقل</th><th>المقترح</th><th class="hide-sm">الحالي</th></tr></thead><tbody>' +
        AI_FIELDS.map(([k, label]) => {
          const sug = String(r[k] || '').trim(), cur = String(el[k] ? el[k].value : '').trim();
          if (!sug) return '';
          const on = !cur || (k === 'unit' && cur === 'قطعة');
          return '<tr><td><input type="checkbox" data-aik="' + k + '"' + (on && sug !== cur ? ' checked' : '') + ' aria-label="تطبيق ' + label + '"></td><td>' + label + '</td>' +
            '<td>' + (k === 'desc' ? '<textarea data-aiv="' + k + '" rows="2">' + esc(sug) + '</textarea>' : '<input data-aiv="' + k + '" value="' + esc(sug) + '"' + (k === 'barcode' ? ' class="num"' : '') + '>') + '</td>' +
            '<td class="hide-sm small muted">' + esc(cur || '—') + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="small muted mt">الثقة: <b>' + Math.round(num(r.confidence) * 100) + '%</b> · النموذج: ' + esc(r._model) + ' — راجع القيم قبل التطبيق، الذكاء الاصطناعي قد يخطئ.</p>' +
        '<div id="aiPrice" class="ai-price mt"></div>';
      m.querySelector('#aiApply').classList.remove('hidden');
      aiPriceSection(r, form, m.querySelector('#aiPrice')); // لا ننتظره — يظهر عند وصوله
    } catch (e) {
      out.innerHTML = '<div class="info-box small" style="border-color:#e66">⛔ ' + esc(aiErrMsg(e)) + '</div>';
      reportError('AI: ' + String(e.message || e).slice(0, 500), e.stack);
    }
    btn.disabled = false; btn.textContent = '🤖 إعادة التحليل';
  };
  m.querySelector('#aiApply').onclick = () => {
    const el = form.elements; let n = 0;
    m.querySelectorAll('[data-aik]').forEach(c => {
      if (!c.checked) return;
      const k = c.dataset.aik, v = m.querySelector('[data-aiv="' + k + '"]').value.trim();
      if (el[k] && v) { el[k].value = v; el[k].dispatchEvent(new Event('input', { bubbles: true })); el[k].classList.add('ai-filled'); n++; }
    });
    if (AI.imgs[0] && m.querySelector('#aiSetImg').checked) { compressImage(AI.imgs[0], 1000, 0.8).then(d => { PM.img = d; PM.imgChanged = true; setImgBox(d); }); n++; }
    closeModal('mAI');
    toast(n ? 'تمت تعبئة ' + n + ' حقل — راجعها ثم احفظ' : 'لم يُطبَّق أي حقل', n ? undefined : 'info');
    renderDupPanel(form, PM.id); // إذا كانت القطعة موجودة مسبقاً يظهر التنبيه بمكانها فوراً
  };
  openModal('mAI');
}

// ═══ الأسعار التقريبية: من محلك (قطع مشابهة) + بحث Google عن سعرها في السوق العراقية ═══
function aiSimilarInShop(r) {
  const code = compactCode(r.partNumber || partCode(r.name || '', r.brand || ''));
  const ps = activeProducts().filter(p => p.id !== PM.id && num(p.price) > 0);
  let list = code.length >= 3 ? ps.filter(p => compactCode(partCode(p.name, p.brand)) === code || compactCode(p.name).includes(code)) : [];
  if (!list.length) list = findDuplicates({ name: r.name || '', barcode: r.barcode || '', brand: r.brand || '' }, PM.id).map(d => d.p).filter(p => num(p.price) > 0);
  return list.slice(0, 5);
}
async function aiPost(key, model, body, ms) {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), ms || 25000);
  let r;
  try {
    r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body)
    });
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'UNAVAILABLE: timeout ' + model : e.message); }
  finally { clearTimeout(to); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && (j.error.status + ': ' + j.error.message)) || ('HTTP ' + r.status));
  return j;
}
async function aiMarketPrice(r) {
  const key = await aiKey(); if (!key) throw new Error('ضع مفتاح Gemini في الإعدادات');
  const rate = num(S.settings.exrate, 1300);
  const q = [r.name, r.brand, r.partNumber].filter(Boolean).join(' ');
  const prompt = 'ابحث في الإنترنت عن سعر هذه القطعة الصناعية في السوق العراقية حالياً (بغداد والمحافظات): ' + q + (r.desc ? ' — ' + r.desc : '') + '\n' +
    'ابحث في مواقع وصفحات البيع العراقية والوكلاء. إذا لم تجد سعراً عراقياً مباشراً، قدّر من سعرها العالمي بالدولار مع إضافة الشحن والجمارك المعتادة للعراق، واذكر ذلك.\n' +
    'فرّق بين الأصلي والتجاري (التقليد/الصيني) إن أمكن. سعر الصرف: ' + rate + ' دينار لكل دولار.\n' +
    'أرجع JSON فقط بدون أي نص قبله أو بعده بهذا الشكل:\n{"low":0,"high":0,"typical":0,"original":0,"copy":0,"usd":0,"basis":"شرح مختصر بالعربي لمصدر التقدير","confidence":0.5}\n' +
    'الأسعار بالدينار العراقي للقطعة الواحدة سعر بيع مفرد (أرقام فقط). اجعل القيمة 0 إذا لم تعرفها. لا تخترع أرقاماً؛ إذا كانت المعلومات قليلة اجعل confidence أقل من 0.4.';
  let good = ''; try { const g = JSON.parse(localStorage.getItem('aiGood') || 'null'); if (g) good = g.model; } catch (e) {}
  const models = [good].concat(await aiPickModels(key), AI_MODELS).filter((x, i, a) => x && a.indexOf(x) === i);
  let lastErr;
  for (const grounded of [true, false]) {
    for (const model of models) {
      try {
        const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } };
        if (grounded) body.tools = [{ google_search: {} }];
        const j = await aiPost(key, model, body, 35000);
        const c = (j.candidates || [])[0] || {};
        const txt = ((c.content || {}).parts || []).map(p => p.text || '').join('');
        const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('no-json');
        const out = JSON.parse(m[0]);
        const gm = c.groundingMetadata || {};
        out.sources = (gm.groundingChunks || []).map(x => x.web).filter(w => w && /^https:\/\//.test(w.uri)).slice(0, 5);
        out.suggest = (gm.searchEntryPoint || {}).renderedContent || '';
        out.grounded = grounded && !!(gm.groundingChunks || gm.webSearchQueries); out._model = model;
        return out;
      } catch (e) {
        lastErr = e;
        const s = String(e.message || e);
        if (/API_KEY|PERMISSION/i.test(s)) throw e;                                           // مشكلة المفتاح — لا فائدة من التكرار
        if (/429|quota|RESOURCE_EXHAUSTED/i.test(s)) { if (grounded) break; throw e; }       // حد البحث المجاني ← تقدير بدون بحث
        if (grounded && /tool|search|grounding|not supported/i.test(s)) break;              // البحث غير مدعوم ← بدون بحث
      }
    }
  }
  throw lastErr;
}
const roundIqd = v => Math.round(num(v) / 250) * 250;
async function aiPriceSection(r, form, box) {
  if (!box) return;
  const isA = isAdmin(), shop = aiSimilarInShop(r);
  const shopHtml = shop.length ? '<div class="small mb"><b>🏪 في محلك (قطع مشابهة):</b>' + shop.map(p => '<div class="ai-sim">• ' + esc(p.name) + ' — بيع <b class="num">' + money(p.price) + '</b>' + (isA && num(p.cost) ? ' · شراء <span class="num">' + money(p.cost) + '</span>' : '') + ' <span class="muted">' + esc(placeText(p)) + '</span></div>').join('') + '</div>' : '';
  box.innerHTML = '<h4>💰 الأسعار التقريبية في السوق العراقية</h4>' + shopHtml + '<div id="aiMkt" class="small"><div class="row"><div class="spinner sm"></div> جاري البحث في Google عن السعر…</div></div>';
  const mk = box.querySelector('#aiMkt');
  try {
    const p = await aiMarketPrice(r);
    if (!document.body.contains(box)) return;
    const low = roundIqd(p.low), high = roundIqd(p.high), typ = roundIqd(p.typical || (low && high ? (low + high) / 2 : low || high));
    const conf = Math.round(num(p.confidence) * 100);
    const cur = num(form.elements.price && form.elements.price.value);
    const sug = typ || (shop[0] ? num(shop[0].price) : 0);
    mk.innerHTML = (typ || low || high
      ? '<div class="ai-pr-main">' + (low && high && low !== high ? '<span class="num">' + money(low) + '</span> — <span class="num">' + money(high) + '</span>' : '') +
        (typ ? '<div>السعر الشائع: <b class="num">' + money(typ) + '</b></div>' : '') + '</div>' +
        (num(p.original) || num(p.copy) ? '<div>' + (num(p.original) ? 'أصلي ≈ <b class="num">' + money(roundIqd(p.original)) + '</b> ' : '') + (num(p.copy) ? '· تجاري ≈ <b class="num">' + money(roundIqd(p.copy)) + '</b>' : '') + '</div>' : '') +
        (num(p.usd) ? '<div class="muted">≈ <span class="num">$' + fmtN(p.usd) + '</span> عالمياً</div>' : '')
      : '<div class="muted">لم يُعثر على سعر واضح لهذه القطعة.</div>') +
      (p.basis ? '<div class="muted mt">📝 ' + esc(p.basis) + '</div>' : '') +
      '<div class="mt"><span class="badge ' + (conf >= 70 ? 'b-green' : conf >= 40 ? 'b-yellow' : 'b-red') + '">الثقة ' + conf + '%</span> ' +
      (p.grounded ? '<span class="badge b-blue">🔎 من بحث Google</span>' : '<span class="badge b-gray">تقدير بدون بحث</span>') + '</div>' +
      (p.sources.length ? '<div class="ai-src mt">المصادر: ' + p.sources.map(s => '<a href="' + esc(s.uri) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title || 'مصدر') + '</a>').join(' · ') + '</div>' : '') +
      '<div class="ai-gsug mt"></div>' +
      (sug ? '<table class="t ai-t mt"><tbody><tr><td><input type="checkbox" data-aik="price"' + (!cur ? ' checked' : '') + ' aria-label="تطبيق سعر البيع"></td><td>سعر البيع</td>' +
        '<td><input data-aiv="price" type="number" class="num" value="' + sug + '"></td><td class="hide-sm small muted">' + (cur ? money(cur) : '—') + '</td></tr></tbody></table>' : '') +
      '<p class="small muted mt">⚠️ تقدير تقريبي من الإنترنت — الأسعار تتغير؛ تأكد من سعر شرائك وهامش ربحك قبل الاعتماد.</p>';
    // شرط Google: عرض "اقتراحات البحث" كما هي — داخل Shadow DOM حتى لا تتأثر تنسيقات البرنامج
    if (p.suggest) { const host = mk.querySelector('.ai-gsug'); host.attachShadow({ mode: 'open' }).innerHTML = String(p.suggest).replace(/<script[\s\S]*?<\/script>/gi, ''); }
  } catch (e) {
    if (document.body.contains(box)) mk.innerHTML = '<div class="muted">تعذر جلب سعر السوق: ' + esc(aiErrMsg(e)) + '</div>' +
      (shop[0] ? '<table class="t ai-t mt"><tbody><tr><td><input type="checkbox" data-aik="price" aria-label="تطبيق سعر البيع"></td><td>سعر البيع (من محلك)</td><td><input data-aiv="price" type="number" class="num" value="' + num(shop[0].price) + '"></td></tr></tbody></table>' : '');
  }
}

async function aiTest() {
  const out = document.getElementById('aiTestOut'); if (out) out.textContent = 'جاري الاختبار…';
  try {
    const r = await aiAnalyze([], 'بلبرينة SKF 6205-2RS');
    if (out) out.innerHTML = '✅ يعمل (' + esc(r._model) + '): ' + esc(r.name || '') + ' · ' + esc(r.brand || '');
  } catch (e) { if (out) out.textContent = '⛔ ' + aiErrMsg(e); }
}

act({
  'ai-fill': aiDialog,
  'ai-new': () => { openProduct(null); setTimeout(aiDialog, 150); },
  'ai-test': aiTest
});
