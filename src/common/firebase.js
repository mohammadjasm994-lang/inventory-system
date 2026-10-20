// ═══ Firebase — مشترك بين موقع الزبائن ولوحة المشرفين ═══
// هذه المفاتيح عامة بطبيعتها (Firebase Web config) — الحماية الحقيقية في firestore.rules
const firebaseConfig = {
  apiKey: "AIzaSyCgGYDhM77U8ybBjDuCsjHWqpMer8jUQ54",
  authDomain: "mohammad-jasm.firebaseapp.com",
  projectId: "mohammad-jasm",
  storageBucket: "mohammad-jasm.firebasestorage.app",
  messagingSenderId: "676078274801",
  appId: "1:676078274801:web:b598cdccdac3392846c150"
};

// ═══ App Check (حماية إضافية: يرفض أي طلب لا يأتي من موقعك الحقيقي) ═══
// 1) Firebase Console ← App Check ← سجّل التطبيق بـ reCAPTCHA v3 وانسخ "مفتاح الموقع" هنا
// 2) انشر، وانتظر يومين حتى تظهر الطلبات "Verified" في الكونسول، ثم اضغط Enforce
const APP_CHECK_SITE_KEY = '';

firebase.initializeApp(firebaseConfig);
window.USE_EMULATORS = ['localhost', '127.0.0.1'].includes(location.hostname) && +location.port >= 8770 && +location.port <= 8799;
if (APP_CHECK_SITE_KEY && firebase.appCheck && !window.USE_EMULATORS) {
  try { firebase.appCheck().activate(APP_CHECK_SITE_KEY, true); } catch (e) { console.warn('App Check', e); }
}
const auth = firebase.auth ? firebase.auth() : null; // موقع الزبائن لا يحتاج تسجيل دخول
const db = firebase.firestore();
const FV = firebase.firestore.FieldValue;

// بيئة التجربة المحلية فقط (محاكي Firebase على جهاز المطوّر) — لا تعمل أبداً على الموقع الحقيقي
if (window.USE_EMULATORS) {
  db.useEmulator('127.0.0.1', 8080);
  if (auth) auth.useEmulator('http://127.0.0.1:9099');
  if (firebase.storage) firebase.storage().useEmulator('127.0.0.1', 9199);
  if (firebase.functions) firebase.app().functions('europe-west1').useEmulator('127.0.0.1', 5001);
} else {
  // العمل بدون إنترنت داخل المخزن (يُزامن تلقائياً عند رجوع الاتصال)
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
}

// الدوال السحابية (للوحة الإدارة فقط — تحتاج Blaze)
const cloudFn = name => firebase.app().functions('europe-west1').httpsCallable(name);
