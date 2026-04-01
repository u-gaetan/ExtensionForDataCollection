let sessionData = [];
// Dictionnaire pour retenir la page précédente de chaque onglet
let tabHistory = {}; 

// 1. ÉCOUTEUR D'HISTORIQUE (Création de l'arbre)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // On ne déclenche l'événement que si l'URL change réellement
    if (changeInfo.url) {
        const currentUrl = changeInfo.url;
        
        // On récupère l'ancienne URL de cet onglet, sinon c'est une nouvelle session
        const parentUrl = tabHistory[tabId] || "Nouvel onglet / Accès direct";

        const navigationEvent = {
            type: 'navigation',
            url: currentUrl,
            parentUrl: parentUrl,
            tabId: tabId,
            timestamp: new Date().toISOString()
        };

        sessionData.push(navigationEvent);
        
        // Cette nouvelle URL devient le parent pour la prochaine navigation
        tabHistory[tabId] = currentUrl; 

        console.log("Nouvelle branche de l'arbre :", navigationEvent);
    }
});

// 2. ÉCOUTEUR DE CLICS 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'clic') {
        sessionData.push(message);
        console.log("Clic détecté :", message);
    }
    if (message.action === "get_data") {
        sendResponse({ data: sessionData });
    }
});