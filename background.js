let sessionData = [];
let tabHistory = {};
let isTracking = false;
let visitCounter = 0;
let currentVisitByTab = {};

chrome.storage.local.get(['isTracking'], (res) => {
    isTracking = res.isTracking || false;
});
chrome.storage.onChanged.addListener((changes) => {
    if (changes.isTracking) isTracking = changes.isTracking.newValue;
});


// =========================================================
// NAVIGATION PRINCIPALE : onUpdated (fiable pour tout)
// =========================================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!isTracking || !changeInfo.url) return;

    const url = changeInfo.url;
    const previousVisitId = currentVisitByTab[tabId];
    const visitId = `visit_${++visitCounter}`;
    currentVisitByTab[tabId] = visitId;

    let parentUrl = tabHistory[tabId]
        || (tab.openerTabId ? tabHistory[tab.openerTabId] : null)
        || "Ouverture directe / Nouvel onglet";

    sessionData.push({
        type: 'navigation',
        visitId: visitId,
        url: url,
        parentUrl: parentUrl,
        tabId: tabId,
        timestamp: new Date().toISOString()
        // transitionType sera ajouté par onCommitted si c'est un retour
    });

    // --- Extraction q= Google → saisie sur le parent newtab ---
    if (url.includes('google.') && url.includes('/search')) {
        try {
            const q = new URL(url).searchParams.get('q');
            if (q && previousVisitId && parentUrl && parentUrl.startsWith('chrome://')) {
                sessionData.push({
                    type: 'saisie_clavier',
                    visitId: previousVisitId,
                    texte: q,
                    url: parentUrl,
                    source: 'recherche_omnibox',
                    tabId: tabId,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (e) {}
    }

    tabHistory[tabId] = url;

    // Envoi url_changed avec retries
    function sendUrlChanged() {
        chrome.tabs.sendMessage(tabId, {
            action: "url_changed",
            newUrl: url,
            visitId: visitId
        }).catch(() => {});
    }
    sendUrlChanged();
    setTimeout(sendUrlChanged, 150);
    setTimeout(sendUrlChanged, 500);
});


// =========================================================
// RETOUR ARRIERE : onCommitted tague RETROACTIVEMENT
// Il cherche le dernier event navigation de ce tab et ajoute transitionType
// =========================================================
chrome.webNavigation.onCommitted.addListener((details) => {
    if (!isTracking || details.frameId !== 0) return;
    if (details.transitionType !== "back_forward") return;

    const tabId = details.tabId;
    const url = details.url;

    // Chercher le dernier evenement navigation de cet onglet
    // (cree par onUpdated juste avant, ou qui va arriver juste apres)
    function tagBackForward() {
        for (let i = sessionData.length - 1; i >= 0; i--) {
            const ev = sessionData[i];
            if (ev.type === 'navigation' && ev.tabId === tabId && ev.url === url) {
                ev.transitionType = "back_forward";
                return true;
            }
            // Ne pas chercher trop loin en arriere
            if (ev.type === 'navigation' && ev.tabId === tabId && ev.url !== url) {
                break;
            }
        }
        return false;
    }

    // Essayer immediatement (onUpdated a peut-etre deja tire)
    if (!tagBackForward()) {
        // Sinon re-essayer apres un court delai (onUpdated va tirer)
        setTimeout(() => { tagBackForward(); }, 100);
        setTimeout(() => { tagBackForward(); }, 300);
    }

    // Forcer la sauvegarde des stats de la page precedente
    chrome.tabs.sendMessage(tabId, {
        action: "force_save_stats"
    }).catch(() => {});
});


// =========================================================
// FERMETURE D'ONGLET
// =========================================================
chrome.tabs.onRemoved.addListener((tabId) => {
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


// =========================================================
// MESSAGES
// =========================================================
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

    if (message.action === "get_visit_id") {
        const tabId = sender.tab ? sender.tab.id : null;
        sendResponse({
            visitId: tabId ? (currentVisitByTab[tabId] || null) : null
        });
        return true;
    }

    if (message.action === "start_tracking") {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs.length > 0) {
                const tab = tabs[0];
                const currentUrl = tab.url || "URL Inconnue";
                const visitId = `visit_${++visitCounter}`;
                currentVisitByTab[tab.id] = visitId;

                sessionData.push({
                    type: 'navigation',
                    visitId: visitId,
                    url: currentUrl,
                    parentUrl: "Demarrage de l'experience",
                    tabId: tab.id,
                    timestamp: new Date().toISOString()
                });

                tabHistory[tab.id] = currentUrl;
                chrome.tabs.sendMessage(tab.id, {
                    action: "url_changed",
                    newUrl: currentUrl,
                    visitId: visitId
                }).catch(() => {});
            }
            sendResponse({ success: true });
        });
        return true;
    }

    // Content scripts : clic, copie, saisie, page_quittee
    if (isTracking && message.type) {
        if (sender.tab && sender.tab.id) {
            message.tabId = sender.tab.id;
            if (!message.visitId && currentVisitByTab[sender.tab.id]) {
                message.visitId = currentVisitByTab[sender.tab.id];
            }
        }
        sessionData.push(message);
    }
});
