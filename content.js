let maxScrollPercent = 0;
let timeSpentOnPageMs = 0;
let lastFocusTime = Date.now();
let isPageVisible = true;

// 1. CHRONOMÈTRE INTELLIGENT (Pause quand on change d'onglet)
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') {
        isPageVisible = false;
        timeSpentOnPageMs += (Date.now() - lastFocusTime);
        envoyerStatsPage(); // Envoie les stats à chaque fois qu'on quitte l'onglet
    } else {
        isPageVisible = true;
        lastFocusTime = Date.now(); // Reprend le chrono
    }
});

// 2. PROFONDEUR DE SCROLL
document.addEventListener('scroll', function() {
    let docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    let windowHeight = window.innerHeight;
    let scrollPos = window.scrollY + windowHeight;
    let scrollPercent = Math.round((scrollPos / docHeight) * 100);
    
    if (scrollPercent > maxScrollPercent) {
        maxScrollPercent = scrollPercent;
    }
});

// 3. CAPTURE DES CLICS
document.addEventListener('mousedown', function(event) {
    chrome.runtime.sendMessage({
        type: 'clic',
        x: event.clientX, y: event.clientY,
        url: window.location.href,
        timestamp: new Date().toISOString()
    });
});

// 4. RÉCEPTION D'ORDRE DU POPUP (Pour forcer l'envoi juste avant le téléchargement)
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
        type: 'page_quittee',
        url: window.location.href,
        maxScroll: Math.min(maxScrollPercent, 100), // Bloque à 100% maximum
        temps_passe_ms: timeSpentOnPageMs,
        timestamp: new Date().toISOString()
    });
}
