// =========================================================
// scroll tracking
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

  // page entirely visible without scrolling ( = 100% scrolled)
  if (docHeight <= viewportHeight + 2) {
    maxScrollPercent = 100;
    return;
  }

  var scrollPos = window.scrollY + viewportHeight;
  var pct = Math.min(Math.round((scrollPos / docHeight) * 100), 100);
  if (pct > maxScrollPercent) maxScrollPercent = pct;
}

// listen to scroll events
window.addEventListener("scroll", recalculateScroll, { passive: true });

// observe changes in the document size (e.g., dynamic content)
if (typeof ResizeObserver !== "undefined") {
  var resizeObs = new ResizeObserver(function () {
    recalculateScroll();
  });
  resizeObs.observe(document.documentElement);
  if (document.body) resizeObs.observe(document.body);
}

// periodically recalculate scroll percentage in case of dynamic content changes
setInterval(recalculateScroll, 2000);

// recalculate scroll percentage on page load after a short delay to ensure accurate measurement
window.addEventListener("load", function () {
  setTimeout(recalculateScroll, 100);
  setTimeout(recalculateScroll, 500);
  setTimeout(recalculateScroll, 1500);
});
