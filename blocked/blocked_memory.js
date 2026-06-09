const memoryI18n = {
    fr: {
        title: "🧠 Test de mémoire en cours",
        desc: "La consultation d'autres pages Web est <strong>bloquée</strong> pendant la phase de mémorisation pour ne pas fausser les résultats de l'étude.",
        returnMsg: "Veuillez retourner sur le questionnaire.",
        btnReturn: "Retourner au questionnaire",
        btnEmergency: "C'est une urgence, y accéder quand même",
        confirmEmergency: "Attention : Consulter vos pages pendant le test de mémoire peut affecter vos résultats. Êtes-vous sûr de vouloir continuer (urgence) ?"
    },
    en: {
        title: "🧠 Memory Test in Progress",
        desc: "Browsing other web pages is <strong>blocked</strong> during the memory phase to avoid altering the study results.",
        returnMsg: "Please return to the questionnaire.",
        btnReturn: "Return to the questionnaire",
        btnEmergency: "This is an emergency, access anyway",
        confirmEmergency: "Warning: Browsing pages during the memory test can affect your results. Are you sure you want to proceed (emergency) ?"
    }
};

document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const originalUrl = urlParams.get('url') || 'https://google.com';
    let currentLang = 'fr';

    chrome.storage.local.get(["currentLanguage"], function(res) {
        currentLang = res.currentLanguage || 'fr';
        const txt = memoryI18n[currentLang];

        document.querySelector('h1').innerHTML = txt.title;
        document.querySelectorAll('p')[0].innerHTML = txt.desc;
        document.querySelectorAll('p')[1].innerHTML = txt.returnMsg;
        document.getElementById('btnReturn').textContent = txt.btnReturn;
        document.getElementById('btnEmergency').textContent = txt.btnEmergency;
    });

    document.getElementById('btnReturn').addEventListener('click', function() {
        chrome.runtime.sendMessage({ action: "focus_questionnaire" });
    });

    document.getElementById('btnEmergency').addEventListener('click', function() {
        const txt = memoryI18n[currentLang];
        if (confirm(txt.confirmEmergency)) {
            chrome.tabs.getCurrent(function(tab) {
                var tabId = tab ? tab.id : null;
                chrome.runtime.sendMessage({ 
                    action: "allow_memory_emergency", 
                    tabId: tabId 
                }, function() {
                    if (chrome.runtime.lastError) {
                        console.warn("Error sending message:", chrome.runtime.lastError);
                    }
                    setTimeout(function() {
                        window.location.href = originalUrl;
                    }, 150);
                });
            });
        }
    });
});