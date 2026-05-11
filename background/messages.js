// =========================================================
// GESTIONNAIRE DE MESSAGES
// =========================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ── Récupérer les données ──
  if (message.action === "get_data") {
    const cleanData = sessionData.map(({ _synced, ...rest }) => rest);
    sendResponse({ data: cleanData });
    return true;
  }

  // ── Effacer les données ──
  if (message.action === "clear_data") {
    sessionData = [];
    tabHistory = {};
    currentVisitByTab = {};
    visitCounter = 0;
    saveStateNow();
    sendResponse({ success: true });
    return true;
  }

  // ── Récupérer le visitId pour un onglet ──
  if (message.action === "get_visit_id") {
    const tabId = sender.tab ? sender.tab.id : null;
    sendResponse({
      visitId: tabId ? currentVisitByTab[tabId] || null : null,
    });
    return true;
  }

  // ── Démarrer le tracking ──
  if (message.action === "start_tracking") {
    isTracking = true;
    currentSessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 6)}`;
    startAutoSend();

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs.length > 0) {
        const tab = tabs[0];
        const currentUrl = tab.url || "URL Inconnue";
        const visitId = `visit_${++visitCounter}`;
        currentVisitByTab[tab.id] = visitId;

        sessionData.push({
          type: "navigation",
          visitId: visitId,
          url: currentUrl,
          parentUrl: "Demarrage de l'experience",
          tabId: tab.id,
          timestamp: new Date().toISOString(),
        });

        tabHistory[tab.id] = currentUrl;
        saveStateNow();
        chrome.tabs
          .sendMessage(tab.id, {
            action: "url_changed",
            newUrl: currentUrl,
            visitId: visitId,
          })
          .catch(() => {});
      }
      sendResponse({ success: true });
    });
    return true;
  }

  // ── Récupérer les identifiants ──
  if (message.action === "get_extension_ids") {
    (async () => {
      if (!participantId) await getOrCreateParticipantId();
      sendResponse({
        participantId: participantId,
        sessionId: currentSessionId,
        isTracking: isTracking,
      });
    })();
    return true;
  }

  // ── Arrêter le tracking ──
  if (message.action === "stop_tracking") {
    stopAutoSend();
    saveStateNow();
    sendToServer(true).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  // ── Envoi manuel ──
  if (message.action === "send_to_server") {
    sendToServer(true).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  // ── page_quittee : accepté même si tracking vient de s'arrêter ──
  if (message.type === "page_quittee" && message.visitId) {
    if (sender.tab && sender.tab.id) {
      message.tabId = sender.tab.id;
    }

    const existingIdx = sessionData.findIndex(
      (e) => e.type === "page_quittee" && e.visitId === message.visitId
    );

    if (existingIdx !== -1) {
      const existing = sessionData[existingIdx];
      if (message.temps_passe_ms >= existing.temps_passe_ms) {
        sessionData[existingIdx] = message;
      }
    } else {
      sessionData.push(message);
    }
    saveState();
    return;
  }

  // ── Autres événements (clic, copie, etc.) ──
  if (isTracking && message.type) {
    if (sender.tab && sender.tab.id) {
      message.tabId = sender.tab.id;
      if (!message.visitId && currentVisitByTab[sender.tab.id]) {
        message.visitId = currentVisitByTab[sender.tab.id];
      }
    }
    sessionData.push(message);
    saveState();
  }
});
