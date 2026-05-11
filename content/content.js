// =========================================================
// INITIALISATION : demander le visitId au background
// =========================================================
chrome.runtime.sendMessage({ action: "get_visit_id" }, (response) => {
  if (chrome.runtime.lastError) return;
  if (response && response.visitId && !currentVisitId) {
    currentVisitId = response.visitId;
    recalculateScroll();
  }
});

// =========================================================
// MESSAGES DU BACKGROUND
// =========================================================
chrome.runtime.onMessage.addListener((msg) => {
  // Changement d'URL détecté par le background
  if (msg.action === "url_changed") {
    if (currentVisitId === msg.visitId) return;

    // Sauvegarder les stats de l'ancienne page
    if (currentVisitId) {
      updateTimeAndSend();
    }

    // Reset pour la nouvelle page
    alreadySentForThisPage = false;
    currentVisitId = msg.visitId;
    maxScrollPercent = 0;
    timeSpentOnPageMs = 0;
    lastFocusTime = Date.now();

    setTimeout(recalculateScroll, 50);
  }

  // Sauvegarde forcée (appelé par popup avant arrêt)
  if (msg.action === "force_save_stats") {
    alreadySentForThisPage = false;
    recalculateScroll();
    updateTimeAndSend();
  }
});
