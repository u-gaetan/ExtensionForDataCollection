// =========================================================
// ÉTAT EN MÉMOIRE
// =========================================================
let sessionData = [];
let tabHistory = {};
let isTracking = false;
let visitCounter = 0;
let currentVisitByTab = {};
let stateLoaded = false;

console.log("🔄 SERVICE WORKER DÉMARRÉ");

// =========================================================
//     PERSISTENCE dans chrome.storage.local
//    → survit au redémarrage du service worker
// =========================================================
async function loadState() {
    const res = await chrome.storage.local.get([
        'isTracking',
        'sw_sessionData',
        'sw_tabHistory',
        'sw_currentVisitByTab',
        'sw_visitCounter'
    ]);
    isTracking = res.isTracking || false;
    sessionData = res.sw_sessionData || [];
    tabHistory = res.sw_tabHistory || {};
    currentVisitByTab = res.sw_currentVisitByTab || {};
    visitCounter = res.sw_visitCounter || 0;
    stateLoaded = true;
    console.log("📂 État restauré — sessionData.length =", sessionData.length, "| isTracking=", isTracking, "| visitCounter=", visitCounter);
}

let saveTimer = null;

function saveState() {
    // Debounce 1s pour les événements fréquents (clics, scroll…)
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(_doSave, 1000);
}

function saveStateNow() {
    // Sauvegarde immédiate pour les opérations critiques
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    _doSave();
}

function _doSave() {
    chrome.storage.local.set({
        sw_sessionData: sessionData,
        sw_tabHistory: tabHistory,
        sw_currentVisitByTab: currentVisitByTab,
        sw_visitCounter: visitCounter
    });
}

// Charger l'état au démarrage
loadState();

// Écouter les changements de isTracking depuis popup.js
chrome.storage.onChanged.addListener((changes) => {
    if (changes.isTracking) {
        isTracking = changes.isTracking.newValue;
        console.log("🔄 isTracking changé →", isTracking);
    }
});


// =========================================================
//    RETRY INTELLIGENT
//    → vérifie que le visitId est toujours courant avant chaque retry
//    → empêche les retries parasites d'écraser des données
// =========================================================
function sendUrlChangedWithRetry(tabId, url, visitId) {
    function trySend() {
        // Si un nouveau visitId a été assigné à cet onglet, abandonner
        if (currentVisitByTab[tabId] !== visitId) return;
        chrome.tabs.sendMessage(tabId, {
            action: "url_changed",
            newUrl: url,
            visitId: visitId
        }).catch(() => {});
    }
    trySend();
    setTimeout(trySend, 200);
    setTimeout(trySend, 600);
}


// =========================================================
// NAVIGATION PRINCIPALE : onUpdated
// =========================================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!stateLoaded || !isTracking || !changeInfo.url) return;

    const url = changeInfo.url;
    console.log("📍 onUpdated →", url, "| sessionData.length=", sessionData.length);

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
    saveStateNow(); // Sauvegarde immédiate (navigation = critique)

    // utiliser le retry intelligent
    sendUrlChangedWithRetry(tabId, url, visitId);
});


// =========================================================
//    onCommitted — FILET DE SÉCURITÉ
//    → crée l'entrée navigation si onUpdated l'a ratée
//    → tague back_forward quand Chrome le rapporte (rare mais utile)
// =========================================================
chrome.webNavigation.onCommitted.addListener((details) => {
    if (!stateLoaded || !isTracking || details.frameId !== 0) return;

    const tabId = details.tabId;
    const url = details.url;

    console.log("🧭 onCommitted →", url, "| transition=", details.transitionType);

    // Ignorer les pages internes
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) return;

    // Chercher si onUpdated a déjà créé une entrée pour cette URL sur cet onglet
    let alreadyHandled = false;
    for (let i = sessionData.length - 1; i >= 0; i--) {
        const ev = sessionData[i];
        if (ev.type === 'navigation' && ev.tabId === tabId) {
            if (ev.url === url) {
                // Déjà créé par onUpdated → juste taguer si back_forward
                if (details.transitionType === 'back_forward') {
                    ev.transitionType = 'back_forward';
                    saveState();
                }
                alreadyHandled = true;
            }
            break; // Ne regarder que le dernier event navigation de cet onglet
        }
    }

    // 🔧 Si onUpdated a raté cette navigation → créer l'entrée ici
    if (!alreadyHandled) {
        console.log("⚡ onCommitted FALLBACK — création navigation pour", url);
        const visitId = `visit_${++visitCounter}`;
        currentVisitByTab[tabId] = visitId;

        sessionData.push({
            type: 'navigation',
            visitId: visitId,
            url: url,
            parentUrl: tabHistory[tabId] || "Navigation directe",
            tabId: tabId,
            transitionType: details.transitionType,
            timestamp: new Date().toISOString(),
            source: 'onCommitted_fallback'
        });

        tabHistory[tabId] = url;
        saveStateNow();
        sendUrlChangedWithRetry(tabId, url, visitId);
    }
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
    saveStateNow();
});


// =========================================================
// MESSAGES
// =========================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // --- Actions du popup ---

    if (message.action === "get_data") {
        sendResponse({ data: sessionData });
        return true;
    }

    if (message.action === "clear_data") {
        console.log("🗑️ clear_data | sessionData AVANT=", sessionData.length);
        sessionData = [];
        tabHistory = {};
        currentVisitByTab = {};
        visitCounter = 0;
        saveStateNow(); // 🔧 Persister le clear
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
        console.log("🚀 start_tracking | sessionData=", sessionData.length);

        // forcer isTracking IMMÉDIATEMENT en mémoire
        //    (le storage.onChanged arrivera plus tard)
        isTracking = true;

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
                saveStateNow();

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

    //    (appelé par popup.js APRÈS que force_save_stats ait été envoyé)
    if (message.action === "stop_tracking") {
        console.log("🛑 stop_tracking | sessionData=", sessionData.length);
        saveStateNow();
        sendResponse({ success: true });
        return true;
    }


    // --- Événements des content scripts ---

    // 🔧 FIX BUG 3 (doublons) : DÉDUPLICATION page_quittee
    //    → on garde celui avec le plus de temps (le plus complet)
    // 🔧 FIX BUG 2 : on accepte page_quittee même si isTracking vient de
    //    passer à false (race condition avec stop_tracking)
    if (message.type === 'page_quittee' && message.visitId) {
        console.log("📩 page_quittee reçu | visitId=", message.visitId,
                     "| temps=", message.temps_passe_ms,
                     "| scroll=", message.maxScroll,
                     "| data count=", sessionData.length);

        if (sender.tab && sender.tab.id) {
            message.tabId = sender.tab.id;
        }

        // Chercher un page_quittee existant pour ce visitId
        const existingIdx = sessionData.findIndex(
            e => e.type === 'page_quittee' && e.visitId === message.visitId
        );

        if (existingIdx !== -1) {
            const existing = sessionData[existingIdx];
            // Garder celui avec le plus de temps passé
            if (message.temps_passe_ms >= existing.temps_passe_ms) {
                sessionData[existingIdx] = message;
                console.log("🔄 page_quittee MIS À JOUR pour", message.visitId,
                            "| temps:", existing.temps_passe_ms, "→", message.temps_passe_ms,
                            "| scroll:", existing.maxScroll, "→", message.maxScroll);
            } else {
                console.log("⏭️ page_quittee IGNORÉ pour", message.visitId,
                            "| existant:", existing.temps_passe_ms, "> nouveau:", message.temps_passe_ms);
            }
        } else {
            sessionData.push(message);
        }
        saveState();
        return;
    }

    // Autres événements (clic, copie, saisie) : seulement si tracking actif
    if (isTracking && message.type) {
        console.log("📩 Message reçu :", message.type, "| visitId=", message.visitId, "| data count=", sessionData.length);

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
