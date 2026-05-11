// =========================================================
// 🆕 CONFIGURATION ENVOI AUTOMATIQUE
// =========================================================
const SERVER_URL = "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/api/collecte";
const SERVER_URL_LOCAL = "http://localhost:3000/api/collecte";
const API_KEY = "de23c11b1d7c33af3dc6f249a18cdc29b529443af8f69148084992caa50c8515";

// =========================================================
// ÉTAT EN MÉMOIRE
// =========================================================
let sessionData = [];
let tabHistory = {};
let isTracking = false;
let visitCounter = 0;
let currentVisitByTab = {};
let stateLoaded = false;
let currentSessionId = null;
let autoSendInterval = null;
let participantId = null;

// =========================================================
// PARTICIPANT ID
// =========================================================
async function getOrCreateParticipantId() {
    const storage = await chrome.storage.local.get(['participantId']);
    if (storage.participantId) {
        participantId = storage.participantId;
    } else {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).slice(2, 6);
        participantId = `P-${timestamp}-${random}`;
        await chrome.storage.local.set({ participantId });
        console.log("🆕 Nouveau participantId généré:", participantId);
    }
    console.log("👤 ParticipantId:", participantId);
    return participantId;
}

getOrCreateParticipantId();
console.log("🔄 SERVICE WORKER DÉMARRÉ");

// =========================================================
// PERSISTENCE
// =========================================================
async function loadState() {
    const res = await chrome.storage.local.get([
        'isTracking', 'sw_sessionData', 'sw_tabHistory',
        'sw_currentVisitByTab', 'sw_visitCounter', 'sw_sessionId'
    ]);
    isTracking = res.isTracking || false;
    sessionData = res.sw_sessionData || [];
    tabHistory = res.sw_tabHistory || {};
    currentVisitByTab = res.sw_currentVisitByTab || {};
    visitCounter = res.sw_visitCounter || 0;
    currentSessionId = res.sw_sessionId || null;
    stateLoaded = true;
    if (isTracking) startAutoSend();
    console.log("✅ État restauré — sessionData.length =", sessionData.length,
        "| isTracking=", isTracking, "| visitCounter=", visitCounter);
}

let saveTimer = null;

function saveState() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(_doSave, 1000);
}

function saveStateNow() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    _doSave();
}

function _doSave() {
    chrome.storage.local.set({
        sw_sessionData: sessionData,
        sw_tabHistory: tabHistory,
        sw_currentVisitByTab: currentVisitByTab,
        sw_visitCounter: visitCounter,
        sw_sessionId: currentSessionId
    });
}

loadState();

chrome.storage.onChanged.addListener((changes) => {
    if (changes.isTracking) {
        isTracking = changes.isTracking.newValue;
        console.log("🔄 isTracking changé →", isTracking);
    }
});

// =========================================================
// 🔧 ENVOI VERS LE SERVEUR — INCRÉMENTAL
// =========================================================
async function sendToServer(isFinal = false) {
    console.log("📤 sendToServer | isFinal=", isFinal,
        "| sessionData.length=", sessionData.length,
        "| sessionId=", currentSessionId);

    if (sessionData.length === 0 || !currentSessionId) {
        console.warn("⚠️ Envoi annulé : sessionData vide ou pas de sessionId");
        return { success: false, error: "Pas de données ou pas de sessionId" };
    }

    if (!participantId) await getOrCreateParticipantId();

    // ── 🔧 NOUVEAU : ne prendre que les événements non synchronisés ──
    const unsyncedEvents = sessionData.filter(e => !e._synced);

    if (unsyncedEvents.length === 0) {
        console.log("✅ Tous les événements déjà synchronisés (",
            sessionData.length, "total)");
        return { success: true, message: "Déjà à jour", count: 0 };
    }

    // --- Nettoyage : dédupliquer les page_quittee non sync ---
    const cleanedData = [];
    const bestPageQuittee = {};

    for (const event of unsyncedEvents) {
        if (event.type === 'page_quittee') {
            const vid = event.visitId;
            if (!bestPageQuittee[vid] ||
                event.temps_passe_ms > bestPageQuittee[vid].temps_passe_ms) {
                bestPageQuittee[vid] = event;
            }
        } else {
            cleanedData.push(event);
        }
    }
    for (const vid in bestPageQuittee) {
        cleanedData.push(bestPageQuittee[vid]);
    }

    cleanedData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // ── 🔧 NOUVEAU : retirer le flag _synced avant envoi ──
    const dataToSend = cleanedData.map(({ _synced, ...event }) => ({
        ...event,
        sessionId: currentSessionId,
        participantId: participantId
    }));

    console.log("📊 À envoyer:", dataToSend.length, "nouveaux événements (sur",
        sessionData.length, "total)");

    try {
        const response = await fetch(SERVER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": API_KEY
            },
            body: JSON.stringify(dataToSend)
        });

        const responseBody = await response.json().catch(() => ({}));
        console.log("📡 Réponse:", response.status, JSON.stringify(responseBody));

        if (!response.ok) {
            throw new Error(responseBody.erreur || `HTTP ${response.status}`);
        }

        // ── 🔧 NOUVEAU : marquer comme synchronisés ──
        for (const event of unsyncedEvents) {
            event._synced = true;
        }
        saveState(); // Persister les flags

        console.log("✅ Envoi réussi :", responseBody.message,
            "| nouveaux:", dataToSend.length);
        return {
            success: true,
            message: responseBody.message,
            count: dataToSend.length
        };

    } catch (error) {
        // 🔧 FIX : le catch n'accède plus à `response` hors scope
        console.error("❌ Échec envoi :", error.message);
        return { success: false, error: error.message };
    }
}

// =========================================================
// ENVOI AUTOMATIQUE
// =========================================================
function startAutoSend() {
    stopAutoSend();
    autoSendInterval = setInterval(() => {
        if (isTracking && sessionData.length > 0) {
            console.log("⏰ Envoi automatique périodique...");
            sendToServer(false);
        }
    }, 3 * 60 * 1000);
    console.log("⏰ Envoi automatique activé (toutes les 3 min)");
}

function stopAutoSend() {
    if (autoSendInterval) {
        clearInterval(autoSendInterval);
        autoSendInterval = null;
    }
}

// =========================================================
// RETRY INTELLIGENT
// =========================================================
function sendUrlChangedWithRetry(tabId, url, visitId) {
    function trySend() {
        if (currentVisitByTab[tabId] !== visitId) return;
        chrome.tabs.sendMessage(tabId, {
            action: "url_changed", newUrl: url, visitId: visitId
        }).catch(() => {});
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
    saveStateNow();
    sendUrlChangedWithRetry(tabId, url, visitId);
});

// =========================================================
// onCommitted — FILET DE SÉCURITÉ
// =========================================================
chrome.webNavigation.onCommitted.addListener((details) => {
    if (!stateLoaded || !isTracking || details.frameId !== 0) return;

    const tabId = details.tabId;
    const url = details.url;
    console.log("🧭 onCommitted →", url, "| transition=", details.transitionType);

    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) return;

    let alreadyHandled = false;
    for (let i = sessionData.length - 1; i >= 0; i--) {
        const ev = sessionData[i];
        if (ev.type === 'navigation' && ev.tabId === tabId) {
            if (ev.url === url) {
                if (details.transitionType === 'back_forward') {
                    ev.transitionType = 'back_forward';
                    // 🔧 Si déjà synced, re-marquer pour renvoi
                    if (ev._synced) ev._synced = false;
                    saveState();
                }
                alreadyHandled = true;
            }
            break;
        }
    }

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

    if (message.action === "get_data") {
        // 🔧 Retirer les flags _synced de la réponse
        const cleanData = sessionData.map(({ _synced, ...rest }) => rest);
        sendResponse({ data: cleanData });
        return true;
    }

    if (message.action === "clear_data") {
        console.log("🗑️ clear_data | sessionData AVANT=", sessionData.length);
        sessionData = [];
        tabHistory = {};
        currentVisitByTab = {};
        visitCounter = 0;
        saveStateNow();
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
        isTracking = true;
        currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        console.log("🆔 Nouveau sessionId:", currentSessionId);
        startAutoSend();

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
                    action: "url_changed", newUrl: currentUrl, visitId: visitId
                }).catch(() => {});
            }
            sendResponse({ success: true });
        });
        return true;
    }

    if (message.action === "get_extension_ids") {
        (async () => {
            if (!participantId) await getOrCreateParticipantId();
            sendResponse({
                participantId: participantId,
                sessionId: currentSessionId,
                isTracking: isTracking
            });
        })();
        return true;
    }

    if (message.action === "stop_tracking") {
        console.log("🛑 stop_tracking | sessionData=", sessionData.length);
        stopAutoSend();
        saveStateNow();
        console.log("🛑 Appel de sendToServer(true)...");
        sendToServer(true).then(result => {
            console.log("🛑 Résultat sendToServer:", JSON.stringify(result));
            sendResponse(result);
        });
        return true;
    }

    if (message.action === "send_to_server") {
        sendToServer(true).then(result => {
            sendResponse(result);
        });
        return true;
    }

    // --- page_quittee : accepté même si tracking vient de s'arrêter ---
    if (message.type === 'page_quittee' && message.visitId) {
        console.log("📩 page_quittee | visitId=", message.visitId,
            "| temps=", message.temps_passe_ms,
            "| scroll=", message.maxScroll);

        if (sender.tab && sender.tab.id) {
            message.tabId = sender.tab.id;
        }

        const existingIdx = sessionData.findIndex(
            e => e.type === 'page_quittee' && e.visitId === message.visitId
        );

        if (existingIdx !== -1) {
            const existing = sessionData[existingIdx];
            if (message.temps_passe_ms >= existing.temps_passe_ms) {
                // 🔧 Le remplacement enlève _synced → sera re-envoyé
                sessionData[existingIdx] = message;
                console.log("🔄 page_quittee MIS À JOUR pour", message.visitId);
            } else {
                console.log("⏭️ page_quittee IGNORÉ (existant meilleur)");
            }
        } else {
            sessionData.push(message);
        }
        saveState();
        return;
    }

    // Autres événements
    if (isTracking && message.type) {
        console.log("📩 Reçu :", message.type, "| visitId=", message.visitId);
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
