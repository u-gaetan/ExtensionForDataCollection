// =========================================================
// SUIVI DU SCROLL 
// =========================================================
function getDocHeight() {
  return Math.max(
    document.body.scrollHeight || 0,
    document.body.offsetHeight || 0,
    document.documentElement.scrollHeight || 0,
    document.documentElement.offsetHeight || 0,
    document.documentElement.clientHeight || 0
  );
}

function recalculateScroll() {
  var docHeight = getDocHeight();
  var viewportHeight = window.innerHeight;

  // Page entièrement visible sans scrollbar → 100%
  if (docHeight <= viewportHeight + 2) {
    maxScrollPercent = 100;
    return;
  }

  var scrollPos = window.scrollY + viewportHeight;
  var pct = Math.min(Math.round((scrollPos / docHeight) * 100), 100);
  if (pct > maxScrollPercent) maxScrollPercent = pct;
}

// Écouter le scroll sur window (plus fiable que document)
window.addEventListener("scroll", recalculateScroll, { passive: true });

// Observer les changements de taille (lazy loading, images chargées...)
if (typeof ResizeObserver !== "undefined") {
  var resizeObs = new ResizeObserver(function () {
    recalculateScroll();
  });
  resizeObs.observe(document.documentElement);
  if (document.body) resizeObs.observe(document.body);
}

// Recalcul périodique (contenu injecté dynamiquement)
setInterval(recalculateScroll, 2000);

// Recalcul après chargement complet (images, fonts, iframes)
window.addEventListener("load", function () {
  setTimeout(recalculateScroll, 100);
  setTimeout(recalculateScroll, 500);
  setTimeout(recalculateScroll, 1500);
});
