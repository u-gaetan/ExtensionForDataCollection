// blocked.js
const blockI18n = {
    fr: {
        title: "Site non autorisé pendant l'étude",
        desc: "L'utilisation d'outils d'intelligence artificielle générative n'est pas permise pendant cette expérience de recherche.",
        instruction: "Veuillez utiliser uniquement des moteurs de recherche classiques (Google, Bing, etc.)  et des sites web, le tout sur le navigateur Google Chrome, pour répondre aux questions.",
        footer: "Étude sur la navigation web — Université Laval"
    },
    en: {
        title: "Unauthorized Website During Study",
        desc: "The use of generative artificial intelligence tools is not allowed during this research experiment.",
        instruction: "Please use only traditional search engines (Google, Bing, etc.)  and websites, all on Google Chrome browser, to answer the questions.",
        footer: "Web Navigation Study — Université Laval"
    }
};

document.addEventListener('DOMContentLoaded', function() {
    var params = new URLSearchParams(window.location.search);
    document.getElementById('blockedUrl').textContent = params.get('url') || 'URL inconnue / Unknown URL';

    chrome.storage.local.get(["currentLanguage"], function(res) {
        const lang = res.currentLanguage || 'fr';
        const txt = blockI18n[lang];
        
        document.getElementById('title').textContent = txt.title;
        document.getElementById('desc').textContent = txt.desc;
        document.getElementById('instruction').textContent = txt.instruction;
        document.getElementById('footer').textContent = txt.footer;
    });
});