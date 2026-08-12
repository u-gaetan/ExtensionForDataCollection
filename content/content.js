// =========================================================
// INITIALISATION : ask background for the current visitId
// =========================================================
chrome.runtime.sendMessage({ action: "get_visit_id" }, (response) => {
  if (chrome.runtime.lastError) return;
  if (response && response.visitId && !currentVisitId) {
    currentVisitId = response.visitId;
    recalculateScroll();
  }
});

// =========================================================
// BACKGROUND'S MESSAGES
// =========================================================
chrome.runtime.onMessage.addListener((msg) => {
  // URL change detected by the background
  if (msg.action === "url_changed") {
    if (currentVisitId === msg.visitId) return;

    // Save stats for the previous page
    if (currentVisitId) {
      updateTimeAndSend();
    }

    // Reset for the new page
    alreadySentForThisPage = false;
    currentVisitId = msg.visitId;
    maxScrollPercent = 0;
    timeSpentOnPageMs = 0;
    keyPressCount = 0; // Ajouté
    lastFocusTime = Date.now();

    setTimeout(recalculateScroll, 50);
  }

  // Force save (called by popup before shutdown)
  if (msg.action === "force_save_stats") {
    alreadySentForThisPage = false;
    recalculateScroll();
    updateTimeAndSend();
  }
});