// =========================================================
// BLOCAGE DES SITES INTERDITS (IA)
// =========================================================
function isBlockedUrl(url) {
  if (!url) return false;
  try {
    var hostname = new URL(url).hostname.replace('www.', '');
    return BLOCKED_DOMAINS.some(function(domain) {
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  } catch (e) {
    return false;
  }
}

function redirectToBlocked(tabId, blockedUrl) {
  var blockedPage = chrome.runtime.getURL('blocked/blocked.html') +
    '?url=' + encodeURIComponent(blockedUrl);
  chrome.tabs.update(tabId, { url: blockedPage });
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

// =========================================================
// NAVIGATION : onUpdated
// =========================================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!stateLoaded || !isTracking || !changeInfo.url) return;

  const url = changeInfo.url;

  // ── Vérification blocage ──
  if (isBlockedUrl(url)) {
    redirectToBlocked(tabId, url);
    sessionData.push({
      type: "blocked_attempt",
      url: url,
      tabId: tabId,
      timestamp: new Date().toISOString(),
    });
    saveState();
    return; // Ne pas enregistrer comme navigation normale
  }

  // ── Enregistrement de la navigation ──

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

  if (url.includes("/questionnaire/")) {
    questionnaireTabId = tabId;
    questionnaireUrl = url;
    chrome.storage.local.set({
      questionnaireTabId: tabId,
      questionnaireUrl: url,
    });
  }
});

// =========================================================
// onCommitted — FILET DE SÉCURITÉ (back/forward, etc.)
// =========================================================
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

    // ── Vérification blocage ──
  if (isBlockedUrl(url)) {
    redirectToBlocked(tabId, url);
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

  if (url.includes("/questionnaire/")) {
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
