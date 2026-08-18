// =========================================================
// time passed tracking + visibility
// =========================================================
function updateTimeAndSend() {
  if (alreadySentForThisPage) return;
  alreadySentForThisPage = true;

  // Forcer un dernier recalcul du scroll avant envoi
  recalculateScroll();

  if (isPageVisible) {
    timeSpentOnPageMs += Date.now() - lastFocusTime;
    lastFocusTime = Date.now();
  }

  if (!currentVisitId) return;

  chrome.runtime.sendMessage({
      type: "page_quittee",
      visitId: currentVisitId,
      url: window.location.href,
      maxScroll: Math.min(maxScrollPercent, 100),
      temps_passe_ms: timeSpentOnPageMs,
      touches_clavier: keyPressCount, // Ajouté
      timestamp: new Date().toISOString(),
    })
    .catch(function () {});
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") {
    updateTimeAndSend();
    isPageVisible = false;
  } else {
    isPageVisible = true;
    alreadySentForThisPage = false;
    lastFocusTime = Date.now();
  }
});

window.addEventListener("pagehide", function () {
  updateTimeAndSend();
});

window.addEventListener("beforeunload", function () {
  updateTimeAndSend();
});

window.addEventListener("pageshow", function (event) {
  if (event.persisted) {
    isPageVisible = true;
    alreadySentForThisPage = false;
    lastFocusTime = Date.now();
    timeSpentOnPageMs = 0;
    maxScrollPercent = 0; 
    keyPressCount = 0; 

    chrome.runtime.sendMessage({ action: "get_visit_id" }, function (response) {
      if (chrome.runtime.lastError) return;
      if (response && response.visitId) {
        currentVisitId = response.visitId;
      }
    });
  }
});