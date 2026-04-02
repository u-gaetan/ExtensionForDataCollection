let maxScrollPercent = 0;
let timeSpentOnPageMs = 0;
let lastFocusTime = Date.now();
let isPageVisible = true;

// 1. CHRONOMÈTRE ET SCROLL
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') {
        isPageVisible = false;
        timeSpentOnPageMs += (Date.now() - lastFocusTime);
        envoyerStatsPage();
    } else {
        isPageVisible = true;
        lastFocusTime = Date.now();
    }
});

document.addEventListener('scroll', function() {
    let docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    let windowHeight = window.innerHeight;
    let scrollPos = window.scrollY + windowHeight;
    let scrollPercent = Math.round((scrollPos / docHeight) * 100);
    if (scrollPercent > maxScrollPercent) maxScrollPercent = scrollPercent;
});

// 2. CLICS
document.addEventListener('mousedown', function(event) {
    chrome.runtime.sendMessage({
        type: 'clic',
        x: event.clientX, y: event.clientY,
        url: window.location.href,
        timestamp: new Date().toISOString()
    });
});

// 3. CTRL+C 
document.addEventListener('copy', function(event) {
    let copiedText = document.getSelection().toString();
    
    // Si la sélection est vide, on cherche si l'utilisateur copie depuis un champ de texte (ex: barre Google)
    if (!copiedText && event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
        copiedText = event.target.value.substring(event.target.selectionStart, event.target.selectionEnd);
    }
    
    if (copiedText && copiedText.length > 0) {
        chrome.runtime.sendMessage({
            type: 'copie',
            texte: copiedText,
            url: window.location.href,
            timestamp: new Date().toISOString()
        });
    }
});

// 4. FRAPPE CLAVIER (NOUVEAU)
// 'change' se déclenche quand on a fini de taper et qu'on valide (Entrée ou clic ailleurs)
document.addEventListener('change', function(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        // SÉCURITÉ : Ne jamais enregistrer un mot de passe
        if (event.target.type !== 'password' && event.target.value.trim().length > 0) {
            chrome.runtime.sendMessage({
                type: 'saisie_clavier',
                texte: event.target.value,
                url: window.location.href,
                timestamp: new Date().toISOString()
            });
        }
    }
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "force_save_stats") {
        if (isPageVisible) {
            timeSpentOnPageMs += (Date.now() - lastFocusTime);
            lastFocusTime = Date.now();
        }
        envoyerStatsPage();
    }
});

function envoyerStatsPage() {
    chrome.runtime.sendMessage({
        type: 'page_quittee', url: window.location.href,
        maxScroll: Math.min(maxScrollPercent, 100),
        temps_passe_ms: timeSpentOnPageMs,
        timestamp: new Date().toISOString()
    });
}