let sessionData =[];
let tabHistory = {}; 
let isTracking = false;

// Met à jour l'état de tracking si modifié depuis le popup
chrome.storage.local.get(['isTracking'], (res) => { isTracking = res.isTracking || false; });
chrome.storage.onChanged.addListener((changes) => {
    if (changes.isTracking) isTracking = changes.isTracking.newValue;
});

// ÉCOUTEUR DE NAVIGATION ET ONGLETS
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!isTracking) return;

    if (changeInfo.url) {
        const currentUrl = changeInfo.url;
        
        // Si l'onglet a été ouvert par un autre onglet, on crée le lien père-fils !
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

// RÉCEPTION DES COMMANDES
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "get_data") {
        sendResponse({ data: sessionData });
        return true;
    }
    if (message.action === "clear_data") {
        sessionData =[];
        tabHistory = {};
        sendResponse({ success: true }); // On confirme que c'est effacé !
        return true;
    }
    if (isTracking) {
        sessionData.push(message);
    }
});