let sessionData =[];
let tabHistory = {}; 
let isTracking = false;

chrome.storage.local.get(['isTracking'], (res) => { isTracking = res.isTracking || false; });
chrome.storage.onChanged.addListener((changes) => {
    if (changes.isTracking) isTracking = changes.isTracking.newValue;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!isTracking) return;

    if (changeInfo.url) {
        const currentUrl = changeInfo.url;
        let parentUrl = tabHistory[tabId];
        if (!parentUrl && tab.openerTabId && tabHistory[tab.openerTabId]) {
            parentUrl = tabHistory[tab.openerTabId];
        } else if (!parentUrl) {
            parentUrl = "Ouverture directe / Nouvel onglet";
        }

        sessionData.push({
            type: 'navigation',
            url: currentUrl,
            parentUrl: parentUrl,
            tabId: tabId,
            timestamp: new Date().toISOString()
        });
        tabHistory[tabId] = currentUrl; 
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "get_data") {
        sendResponse({ data: sessionData });
        return true;
    }
    if (message.action === "clear_data") {
        sessionData =[];
        tabHistory = {};
        sendResponse({ success: true });
        return true;
    }
    // NOUVEAU : On enregistre la page actuelle comme point de départ
    if (message.action === "start_tracking") {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs.length > 0) {
                let tab = tabs[0];
                let currentUrl = tab.url || "URL Inconnue";
                sessionData.push({
                    type: 'navigation',
                    url: currentUrl,
                    parentUrl: "Démarrage de l'expérience", // Sera reconnu comme racine
                    tabId: tab.id,
                    timestamp: new Date().toISOString()
                });
                tabHistory[tab.id] = currentUrl;
            }
            sendResponse({ success: true });
        });
        return true;
    }
    if (isTracking) {
        sessionData.push(message);
    }
});