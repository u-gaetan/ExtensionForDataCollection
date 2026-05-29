document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const originalUrl = urlParams.get('url') || 'https://google.com';

    document.getElementById('btnReturn').addEventListener('click', function() {
        chrome.runtime.sendMessage({ action: "focus_questionnaire" });
    });

    document.getElementById('btnEmergency').addEventListener('click', function() {
        if (confirm("Attention : Consulter vos pages pendant le test de mémoire peut affecter vos résultats. Êtes-vous sûr de vouloir continuer (urgence) ?")) {
            // Récupérer le tabId de manière fiable
            chrome.tabs.getCurrent(function(tab) {
                var tabId = tab ? tab.id : null;
                chrome.runtime.sendMessage({ 
                    action: "allow_memory_emergency", 
                    tabId: tabId 
                }, function() {
                    if (chrome.runtime.lastError) {
                        console.warn("Erreur message:", chrome.runtime.lastError);
                    }
                    // Petit délai pour laisser le background traiter
                    setTimeout(function() {
                        window.location.href = originalUrl;
                    }, 150);
                });
            });
        }
    });
});
