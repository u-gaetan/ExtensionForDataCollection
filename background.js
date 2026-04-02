let sessionData = [];
let tabHistory = {}; 
let isTracking = false;
let pendingBackForward = {};  // tabId → url (anti-doublon)

chrome.storage.local.get(['isTracking'], (res) => { isTracking = res.isTracking || false; });
chrome.storage.onChanged.addListener((changes) => {
    if (changes.isTracking) isTracking = changes.isTracking.newValue;
});

let visitCounter = 0;
let currentVisitByTab = {};  // tabId → visitId actuel

// =============================================
// NAVIGATION 
// =============================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!isTracking || !changeInfo.url) return;

    // ← NOUVEAU : Skip si déjà géré par onCommitted (back_forward)
    if (pendingBackForward[tabId] === changeInfo.url) {
        delete pendingBackForward[tabId];
        return;
    }

    const currentUrl = changeInfo.url;
    const visitId = `visit_${++visitCounter}`;
    currentVisitByTab[tabId] = visitId;

    let parentUrl = tabHistory[tabId] ||
        (tab.openerTabId ? tabHistory[tab.openerTabId] : "Ouverture directe / Nouvel onglet");

    sessionData.push({
        type: 'navigation',
        visitId: visitId,
        url: currentUrl,
        parentUrl: parentUrl,
        tabId: tabId,
        timestamp: new Date().toISOString()
    });

    tabHistory[tabId] = currentUrl;

    chrome.tabs.sendMessage(tabId, {
        action: "url_changed",
        newUrl: currentUrl,
        visitId: visitId,
    }).catch(() => {});
});

// =============================================
// BOUTON RETOUR / AVANCE (remplacer votre version actuelle)
// =============================================
chrome.webNavigation.onCommitted.addListener((details) => {
    if (!isTracking || details.frameId !== 0) return;
    if (details.transitionType !== "back_forward") return;

    const tabId = details.tabId;
    const currentUrl = details.url;
    const visitId = `visit_${++visitCounter}`;
    currentVisitByTab[tabId] = visitId;

    // Marquer pour éviter le doublon avec onUpdated
    pendingBackForward[tabId] = currentUrl;
    setTimeout(() => { delete pendingBackForward[tabId]; }, 1500);

    sessionData.push({
        type: 'navigation',
        visitId: visitId,
        url: currentUrl,
        parentUrl: tabHistory[tabId] || "Navigation retour",
        tabId: tabId,
        transitionType: "back_forward",    // ← Clé pour la visualisation
        timestamp: new Date().toISOString()
    });

    tabHistory[tabId] = currentUrl;

    chrome.tabs.sendMessage(tabId, {
        action: "url_changed",
        newUrl: currentUrl,
        visitId: visitId,
    }).catch(() => {});
});



// =============================================
// ← NOUVEAU : FERMETURE D'ONGLET
// =============================================
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (!isTracking) return;

    sessionData.push({
        type: 'tab_closed',
        visitId: currentVisitByTab[tabId] || null,
        tabId: tabId,
        url: tabHistory[tabId] || "URL inconnue",
        timestamp: new Date().toISOString()
    });

    delete currentVisitByTab[tabId];
    delete tabHistory[tabId];
});

// =============================================
// MESSAGES ENTRANTS (content scripts + popup)
// =============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "get_data") {
        sendResponse({ data: sessionData });
        return true;
    }

    if (message.action === "clear_data") {
        sessionData = [];
        tabHistory = {};
        currentVisitByTab = {};
        visitCounter = 0;
        sendResponse({ success: true });
        return true;
    }

    // Démarrage : enregistre la page actuelle comme racine
    if (message.action === "start_tracking") {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs.length > 0) {
                const tab = tabs[0];
                const currentUrl = tab.url || "URL Inconnue";
                const visitId = `visit_${++visitCounter}`;   // ← visitId pour la racine aussi
                currentVisitByTab[tab.id] = visitId;

                sessionData.push({
                    type: 'navigation',
                    visitId: visitId,
                    url: currentUrl,
                    parentUrl: "Démarrage de l'expérience",
                    tabId: tab.id,
                    timestamp: new Date().toISOString()
                });

                tabHistory[tab.id] = currentUrl;

                // Prévenir le content script de la page de départ
                chrome.tabs.sendMessage(tab.id, { 
                    action: "url_changed", 
                    newUrl: currentUrl,
                    visitId: visitId,
                }).catch(() => {});
            }
            sendResponse({ success: true });
        });
        return true;
    }

    // Pour tout autre message (clic, copie, saisie, page_quittee...)
    if (isTracking && message.type) {
        // Injection du tabId depuis le sender
        if (sender.tab && sender.tab.id) {
            message.tabId = sender.tab.id;
            // Si le content script n'a pas de visitId, on injecte celui qu'on connaît
            if (!message.visitId && currentVisitByTab[sender.tab.id]) {
                message.visitId = currentVisitByTab[sender.tab.id];
            }
        }
        sessionData.push(message);
    }
});
