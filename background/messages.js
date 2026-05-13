chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {

  if (message.action === "get_data") {
    var cleanData = sessionData.map(function (e) {
      var copy = {};
      for (var k in e) { if (k !== "_synced") copy[k] = e[k]; }
      return copy;
    });
    sendResponse({ data: cleanData });
    return true;
  }

  if (message.action === "clear_data") {
    sessionData = [];
    tabHistory = {};
    currentVisitByTab = {};
    visitCounter = 0;
    questionnaireTabId = null;
    questionnaireUrl = null;
    studyCompleted = false;
    chrome.storage.local.set({ studyCompleted: false });
    saveStateNow();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "get_visit_id") {
    var tabId = sender.tab ? sender.tab.id : null;
    sendResponse({
      visitId: tabId ? currentVisitByTab[tabId] || null : null
    });
    return true;
  }

  if (message.action === "start_tracking") {
    isTracking = true;
    studyCompleted = false;
    currentSessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
    updateBadge(true);
    startAutoSend();

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs.length > 0) {
        var tab = tabs[0];
        var currentUrl = tab.url || "URL Inconnue";
        var vid = "visit_" + (++visitCounter);
        currentVisitByTab[tab.id] = vid;

        sessionData.push({
          type: "navigation",
          visitId: vid,
          url: currentUrl,
          parentUrl: "Demarrage de l'experience",
          tabId: tab.id,
          timestamp: new Date().toISOString()
        });

        tabHistory[tab.id] = currentUrl;
        saveStateNow();
        chrome.tabs.sendMessage(tab.id, {
          action: "url_changed",
          newUrl: currentUrl,
          visitId: vid
        }).catch(function () {});
      }
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "get_extension_ids") {
    (async function () {
      if (!participantId) await getOrCreateParticipantId();
      sendResponse({
        participantId: participantId,
        sessionId: currentSessionId,
        isTracking: isTracking,
        studyCompleted: studyCompleted
      });
    })();
    return true;
  }

  if (message.action === "stop_tracking") {
    stopAutoSend();
    isTracking = false;
    updateBadge(false);
    chrome.storage.local.set({ isTracking: false });
    saveStateNow();
    sendToServer(true).then(function (result) {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === "send_to_server") {
    sendToServer(true).then(function (result) {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === "set_questionnaire_tab") {
    questionnaireTabId = message.tabId || (sender.tab ? sender.tab.id : questionnaireTabId);
    questionnaireUrl = message.url || questionnaireUrl;
    chrome.storage.local.set({
      questionnaireTabId: questionnaireTabId,
      questionnaireUrl: questionnaireUrl
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "get_questionnaire_info") {
    sendResponse({
      tabId: questionnaireTabId,
      url: questionnaireUrl
    });
    return true;
  }

    if (message.action === "questionnaire_completed") {
      if (!isTracking) {
        sendResponse({ success: false, error: "Pas en cours" });
        return true;
      }

      studyCompleted = true;
      isTracking = false;
      stopAutoSend();
      updateBadge(false);

      chrome.storage.local.set({
        isTracking: false,
        studyCompleted: true
      });
      saveStateNow();

      // Ouvrir la page uninstall IMMÉDIATEMENT (pas d'attente)
      chrome.tabs.create({
        url: chrome.runtime.getURL("uninstall/uninstall.html")
      });

      // Envoyer les données en arrière-plan (le participant n'attend pas)
      sendToServer(true);

      sendResponse({ success: true });
      return true;
    }


  if (message.action === "uninstall_self") {
    try {
      chrome.management.uninstallSelf({ showConfirmDialog: true });
      sendResponse({ success: true });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }

  if (message.type === "page_quittee" && message.visitId) {
    if (sender.tab && sender.tab.id) {
      message.tabId = sender.tab.id;
    }

    var existingIdx = -1;
    for (var i = 0; i < sessionData.length; i++) {
      if (sessionData[i].type === "page_quittee" && sessionData[i].visitId === message.visitId) {
        existingIdx = i;
        break;
      }
    }

    if (existingIdx !== -1) {
      if (message.temps_passe_ms >= sessionData[existingIdx].temps_passe_ms) {
        sessionData[existingIdx] = message;
      }
    } else {
      sessionData.push(message);
    }
    saveState();
    return;
  }

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
