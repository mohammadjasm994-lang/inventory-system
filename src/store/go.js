// صفحة القطعة الثابتة (/p/<id>): الزائر ينتقل مباشرة للكتالوج مفتوحاً على القطعة
// (محركات البحث ومعاينة واتساب تقرأ الصفحة الثابتة نفسها)
(function () {
  var id = document.body.getAttribute('data-id');
  if (id && !/bot|crawl|spider|facebookexternalhit|whatsapp|telegram|preview/i.test(navigator.userAgent)) location.replace('/?item=' + encodeURIComponent(id));
})();
