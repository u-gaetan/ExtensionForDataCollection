let currentVisitId = null;            // ← DÉCLARATION manquante
let maxScrollPercent = 0;
let timeSpentOnPageMs = 0;
let lastFocusTime = Date.now();
let isPageVisible = true;
let pendingText = "";
let alreadySentForThisPage = false;

// --- 1. FONCTION DE SAUVEGARDE FINALE ---
function updateTimeAndSend() {
    if (alreadySentForThisPage) return;
    alreadySentForThisPage = true;

    if (isPageVisible) {
        timeSpentOnPageMs += (Date.now() - lastFocusTime);
        lastFocusTime = Date.now();
    }
    
    chrome.runtime.sendMessage({
        type: 'page_quittee',
        visitId: currentVisitId,
        url: window.location.href,
        maxScroll: Math.min(maxScrollPercent, 100),
        temps_passe_ms: timeSpentOnPageMs,
        timestamp: new Date().toISOString()
    }).catch(() => {});
}

// --- 2. DÉTECTION DU DÉPART DE L'UTILISATEUR ---
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') {
        updateTimeAndSend();
        isPageVisible = false;
    } else {
        // Retour sur l'onglet → on ré-autorise un futur envoi
        isPageVisible = true;
        alreadySentForThisPage = false;   // ← Important pour re-capturer si re-départ
        lastFocusTime = Date.now();
    }
});

window.addEventListener("pagehide", () => {
    updateTimeAndSend();
});

window.addEventListener("beforeunload", () => {
    updateTimeAndSend();
});

// --- 3. PROFONDEUR DE SCROLL ---
document.addEventListener('scroll', function() {
    let docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    let scrollPos = window.scrollY + window.innerHeight;
    let scrollPercent = Math.round((scrollPos / docHeight) * 100);
    if (scrollPercent > maxScrollPercent) maxScrollPercent = scrollPercent;
});

// --- 4. CAPTURE DES CLICS ---
document.addEventListener('mousedown', function(event) {
    chrome.runtime.sendMessage({
        type: 'clic',
        visitId: currentVisitId,
        x: event.clientX, 
        y: event.clientY,
        url: window.location.href,
        timestamp: new Date().toISOString()
    }).catch(() => {});
});

// --- 5. CTRL+C ---
document.addEventListener('copy', function(event) {
    let copiedText = document.getSelection().toString();
    if (!copiedText && event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
        copiedText = event.target.value.substring(event.target.selectionStart, event.target.selectionEnd);
    }
    if (copiedText && copiedText.trim().length > 0) {
        chrome.runtime.sendMessage({
            type: 'copie', 
            visitId: currentVisitId, 
            texte: copiedText, 
            url: window.location.href, 
            timestamp: new Date().toISOString()
        }).catch(() => {});
    }
});

// --- 6. FRAPPE CLAVIER (refonte) ---
let lastSentText = "";

function envoyerTexte(text) {
    if (!text || !text.trim() || text.trim() === lastSentText) return;
    lastSentText = text.trim();
    chrome.runtime.sendMessage({
        type: 'saisie_clavier',
        visitId: currentVisitId,
        texte: text.trim(),
        url: window.location.href,
        timestamp: new Date().toISOString()
    }).catch(() => {});
}

// Envoi quand un champ perd le focus (INPUT, TEXTAREA, contenteditable)
document.addEventListener('focusout', function(event) {
    const el = event.target;
    if (!el) return;
    let text = '';
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.type !== 'password') {
        text = el.value;
    } else if (el.isContentEditable) {
        text = el.textContent;
    }
    if (text) envoyerTexte(text);
}, true);

// Envoi immédiat sur Enter (avant que la page ne navigue)
document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && event.target) {
        const el = event.target;
        let text = '';
        if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.type !== 'password') {
            text = el.value;
        } else if (el.isContentEditable) {
            text = el.textContent;
        }
        if (text) envoyerTexte(text);
    }
});

// --- 7. MESSAGES DU BACKGROUND ---
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "url_changed") {
        // 1. Sauvegarder l'ancienne page (seulement si on avait un visitId)
        if (currentVisitId) {
            // ← IMPORTANT : envoyer le texte AVANT le reset
            const activeEl = document.activeElement;
            if (activeEl) {
                let text = '';
                if ((activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') 
                     && activeEl.type !== 'password') {
                    text = activeEl.value;
                } else if (activeEl.isContentEditable) {
                    text = activeEl.textContent;
                }
                if (text) envoyerTexte(text);
            }
            updateTimeAndSend();
        }

        // 2. Reset complet pour la nouvelle page
        alreadySentForThisPage = false;
        currentVisitId = msg.visitId;
        maxScrollPercent = 0;
        timeSpentOnPageMs = 0;
        lastFocusTime = Date.now();
        lastSentText = "";  // ← Reset du dernier texte envoyé
    }

    if (msg.action === "force_save_stats") {
        alreadySentForThisPage = false;
        const activeEl = document.activeElement;
        if (activeEl) {
            let text = activeEl.value || activeEl.textContent;
            if (text) envoyerTexte(text);
        }
        updateTimeAndSend();
    }
});
