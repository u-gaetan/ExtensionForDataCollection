// =========================================================
// HELPERS : BLOCAGES SITES IA ET TEST MÉMOIRE
// =========================================================
function isBlockedUrl(url) {
  if (!url) return false;
  // Ne pas tenter de bloquer les protocoles système
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) return false;
  try {
    var hostname = new URL(url).hostname.replace('www.', '');
    return BLOCKED_DOMAINS.some(function(domain) {
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  } catch (e) {
    return false;
  }
}

function isQuestionnaireUrl(url) {
  return url && url.includes('/questionnaire/');
}

function isMemoryBlockedPage(url) {
  return url && url.includes('blocked_memory.html');
}

function redirectToBlocked(tabId, blockedUrl, type = 'ia') {
  var page = type === 'ia' ? 'blocked/blocked.html' : 'blocked/blocked_memory.html';
  var fullUrl = chrome.runtime.getURL(page) + '?url=' + encodeURIComponent(blockedUrl);
  chrome.tabs.update(tabId, { url: fullUrl });
}

// =========================================================
// RETRY ENVOI URL_CHANGED AU CONTENT SCRIPT
// =========================================================
function sendUrlChangedWithRetry(tabId, url, visitId) {
  function trySend() {
    if (currentVisitByTab[tabId] !== visitId) return;
    chrome.tabs
      .sendMessage(tabId, {
        action: "url_changed",
        newUrl: url,
        visitId: visitId,
      })
      .catch(() => {});
  }
  trySend();
  setTimeout(trySend, 200);
  setTimeout(trySend, 600);
}

function isSystemUrl(url) {
  if (!url) return true;
  return url.startsWith('chrome://') || 
         url.startsWith('chrome-extension://') || 
         url.startsWith('about:') || 
         url.startsWith('edge://');
}

// CHANGEMENT D'ONGLET (onActivated)
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (!stateLoaded || !isTracking) return;

  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab.url) return;

    // Bloquer si on est en phase mémoire, sur un site non autorisé, hors exceptions système
    if (currentStudyPhase === 'memory' && 
        !isQuestionnaireUrl(tab.url) && 
        !isMemoryBlockedPage(tab.url) && 
        !memoryEmergencyBypass[tab.id] && 
        !tab.url.startsWith('chrome-extension://') &&
        !tab.url.startsWith('chrome://') &&
        !tab.url.startsWith('about:')) {
      
      redirectToBlocked(tab.id, tab.url, 'memory');
      return;
    }

    // Enregistrer comme visite si ce n'est pas une page système
    if (!tab.url.startsWith("chrome://") && 
        !tab.url.startsWith("chrome-extension://") && 
        !tab.url.startsWith("about:") &&
        !isQuestionnaireUrl(tab.url)) {
      
      const visitId = `visit_${++visitCounter}`;
      currentVisitByTab[tab.id] = visitId;
      sessionData.push({
        type: "tab_activated",
        visitId: visitId,
        url: tab.url,
        tabId: tab.id,
        timestamp: new Date().toISOString()
      });
      saveStateNow();
      sendUrlChangedWithRetry(tab.id, tab.url, visitId);
    }
  });
});


// NAVIGATION : onUpdated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!stateLoaded || !isTracking || !changeInfo.url) return;

  const url = changeInfo.url;

  // Vérification blocage IA
  if (isBlockedUrl(url)) {
    redirectToBlocked(tabId, url, 'ia');
    sessionData.push({
      type: "blocked_attempt",
      url: url,
      tabId: tabId,
      timestamp: new Date().toISOString(),
    });
    saveState();
    return;
  }

  // Vérification blocage TEST MÉMOIRE hors exceptions système
  if (currentStudyPhase === 'memory' && 
      !isQuestionnaireUrl(url) && 
      !isMemoryBlockedPage(url) && 
      !memoryEmergencyBypass[tabId] && 
      !url.startsWith('chrome-extension://') &&
      !url.startsWith('chrome://') &&
      !url.startsWith('about:')) {
    
    redirectToBlocked(tabId, url, 'memory');
    return;
  }

  // Enregistrement de la navigation
  if (!url.startsWith("chrome://") && !url.startsWith("chrome-extension://") && !url.startsWith("about:")) {
    const visitId = `visit_${++visitCounter}`;
    currentVisitByTab[tabId] = visitId;

    const parentUrl =
      tabHistory[tabId] ||
      (tab.openerTabId ? tabHistory[tab.openerTabId] : null) ||
      "Ouverture directe / Nouvel onglet";

    sessionData.push({
      type: "navigation",
      visitId: visitId,
      url: url,
      parentUrl: parentUrl,
      tabId: tabId,
      timestamp: new Date().toISOString(),
    });

    tabHistory[tabId] = url;
    saveStateNow();
    sendUrlChangedWithRetry(tabId, url, visitId);
  }

  if (isQuestionnaireUrl(url)) {
    questionnaireTabId = tabId;
    questionnaireUrl = url;
    chrome.storage.local.set({
      questionnaireTabId: tabId,
      questionnaireUrl: url,
    });
  }
});

// onCommitted — FILET DE SÉCURITÉ
chrome.webNavigation.onCommitted.addListener((details) => {
  if (!stateLoaded || !isTracking || details.frameId !== 0) return;

  const tabId = details.tabId;
  const url = details.url;

  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:")
  )
    return;

  if (isBlockedUrl(url)) {
    redirectToBlocked(tabId, url, 'ia');
    return;
  }

  if (currentStudyPhase === 'memory' && 
      !isQuestionnaireUrl(url) && 
      !isMemoryBlockedPage(url) && 
      !memoryEmergencyBypass[tabId] && 
      !url.startsWith('chrome-extension://') &&
      !url.startsWith('chrome://') &&
      !url.startsWith('about:')) {
    redirectToBlocked(tabId, url, 'memory');
    return;
  }

  let alreadyHandled = false;
  for (let i = sessionData.length - 1; i >= 0; i--) {
    const ev = sessionData[i];
    if (ev.type === "navigation" && ev.tabId === tabId) {
      if (ev.url === url) {
        if (details.transitionType === "back_forward") {
          ev.transitionType = "back_forward";
          if (ev._synced) ev._synced = false;
          saveState();
        }
        alreadyHandled = true;
      }
      break;
    }
  }

  if (!alreadyHandled) {
    const visitId = `visit_${++visitCounter}`;
    currentVisitByTab[tabId] = visitId;

    sessionData.push({
      type: "navigation",
      visitId: visitId,
      url: url,
      parentUrl: tabHistory[tabId] || "Navigation directe",
      tabId: tabId,
      transitionType: details.transitionType,
      timestamp: new Date().toISOString(),
      source: "onCommitted_fallback",
    });

    tabHistory[tabId] = url;
    saveStateNow();
    sendUrlChangedWithRetry(tabId, url, visitId);
  }

  if (isQuestionnaireUrl(url)) {
    questionnaireTabId = tabId;
    questionnaireUrl = url;
    chrome.storage.local.set({
      questionnaireTabId: tabId,
      questionnaireUrl: url,
    });
  }
});

// =========================================================
// FERMETURE D'ONGLET
// =========================================================
chrome.tabs.onRemoved.addListener((tabId) => {
  if (!isTracking) return;

  sessionData.push({
    type: "tab_closed",
    visitId: currentVisitByTab[tabId] || null,
    tabId: tabId,
    url: tabHistory[tabId] || "URL inconnue",
    timestamp: new Date().toISOString(),
  });

  delete currentVisitByTab[tabId];
  delete tabHistory[tabId];
  saveStateNow();

  if (tabId === questionnaireTabId) {
    questionnaireTabId = null;
    chrome.storage.local.set({ questionnaireTabId: null });
  }
});