let currentVisitId = null;
let maxScrollPercent = 0;
let timeSpentOnPageMs = 0;
let lastFocusTime = Date.now();
let isPageVisible = !document.hidden;
let alreadySentForThisPage = false;
let lastSentText = "";


// =========================================================
// AU CHARGEMENT : demander le visitId (bfcache / chargement tardif)
// =========================================================
chrome.runtime.sendMessage({ action: "get_visit_id" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.visitId && !currentVisitId) {
        currentVisitId = response.visitId;
        // 🔧 FIX BUG 6 : calculer le scroll initial dès qu'on a le visitId
        recalculateScroll();
    }
});


// =========================================================
// 🔧 FIX BUG 6 : Fonction de recalcul du scroll
//    → utilisée au chargement ET au retour bfcache
//    → résout scroll=0 sur les pages restaurées
// =========================================================
function recalculateScroll() {
    let docHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
    );
    if (docHeight === 0) return;
    let scrollPos = window.scrollY + window.innerHeight;
    let pct = Math.round((scrollPos / docHeight) * 100);
    if (pct > maxScrollPercent) maxScrollPercent = pct;
}


// =========================================================
// 1. SAUVEGARDE DES STATS
// =========================================================
function updateTimeAndSend() {
    console.log("💾 updateTimeAndSend | visitId=", currentVisitId,
                "| scroll=", maxScrollPercent,
                "| temps=", timeSpentOnPageMs,
                "| déjà envoyé=", alreadySentForThisPage);

    if (alreadySentForThisPage) return;
    alreadySentForThisPage = true;

    if (isPageVisible) {
        timeSpentOnPageMs += (Date.now() - lastFocusTime);
        lastFocusTime = Date.now();
    }

    // 🔧 FIX : ne pas envoyer si pas de visitId (content script orphelin)
    if (!currentVisitId) return;

    chrome.runtime.sendMessage({
        type: 'page_quittee',
        visitId: currentVisitId,
        url: window.location.href,
        maxScroll: Math.min(maxScrollPercent, 100),
        temps_passe_ms: timeSpentOnPageMs,
        timestamp: new Date().toISOString()
    }).catch(() => {});
}


// =========================================================
// 2. VISIBILITÉ / DÉPART
// =========================================================
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') {
        updateTimeAndSend();
        isPageVisible = false;
    } else {
        isPageVisible = true;
        alreadySentForThisPage = false;
        lastFocusTime = Date.now();
    }
});

window.addEventListener("pagehide", () => { updateTimeAndSend(); });
window.addEventListener("beforeunload", () => { updateTimeAndSend(); });

// 🔧 FIX BUG 6 : bfcache — page restaurée
//    → recalculer le scroll (bfcache restaure la position mais ne fire pas scroll)
//    → reset du temps (c'est un nouveau visit)
window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        isPageVisible = true;
        alreadySentForThisPage = false;
        lastFocusTime = Date.now();
        timeSpentOnPageMs = 0;       // 🔧 Nouveau visit → temps repart à 0
        maxScrollPercent = 0;         // 🔧 Reset avant recalcul
        recalculateScroll();          // 🔧 Lire la position de scroll restaurée

        chrome.runtime.sendMessage({ action: "get_visit_id" }, (response) => {
            if (chrome.runtime.lastError) return;
            if (response && response.visitId) {
                currentVisitId = response.visitId;
            }
        });
    }
});


// =========================================================
// 3. SCROLL
// =========================================================
document.addEventListener('scroll', function() {
    let docHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
    );
    if (docHeight === 0) return; // 🔧 Protection division par zéro
    let scrollPos = window.scrollY + window.innerHeight;
    let pct = Math.round((scrollPos / docHeight) * 100);
    if (pct > maxScrollPercent) maxScrollPercent = pct;
});


// =========================================================
// 4. CLICS
// =========================================================
document.addEventListener('mousedown', function(event) {
    if (!currentVisitId) return; // 🔧 Protection : pas de visitId = pas de tracking
    chrome.runtime.sendMessage({
        type: 'clic',
        visitId: currentVisitId,
        x: event.clientX,
        y: event.clientY,
        url: window.location.href,
        timestamp: new Date().toISOString()
    }).catch(() => {});
});


// =========================================================
// 5. COPIE
// =========================================================
document.addEventListener('copy', function(event) {
    if (!currentVisitId) return; // 🔧 Protection
    let txt = document.getSelection().toString();
    if (!txt && event.target &&
        (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')) {
        txt = event.target.value.substring(
            event.target.selectionStart, event.target.selectionEnd
        );
    }
    if (txt && txt.trim().length > 0) {
        chrome.runtime.sendMessage({
            type: 'copie',
            visitId: currentVisitId,
            texte: txt,
            url: window.location.href,
            timestamp: new Date().toISOString()
        }).catch(() => {});
    }
});


// =========================================================
// 6. SAISIE CLAVIER
// =========================================================
function envoyerTexte(text) {
    if (!currentVisitId) return; // 🔧 Protection
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


// =========================================================
// 7. MESSAGES DU BACKGROUND
// =========================================================
chrome.runtime.onMessage.addListener((msg) => {

    if (msg.action === "url_changed") {
        console.log("📨 url_changed reçu | ancien visitId=", currentVisitId, "| nouveau=", msg.visitId);

        // Anti-doublon : même visitId = retry, on ignore
        if (currentVisitId === msg.visitId) return;

        // Sauvegarder l'ancienne page
        if (currentVisitId) {
            // Récupérer le texte d'un champ actif avant de quitter
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

        // Reset pour la nouvelle page
        alreadySentForThisPage = false;
        currentVisitId = msg.visitId;
        maxScrollPercent = 0;
        timeSpentOnPageMs = 0;
        lastFocusTime = Date.now();
        lastSentText = "";

        // 🔧 FIX BUG 6 : recalculer le scroll après reset
        //    (utile si la page est restée scrollée, ex: SPA)
        setTimeout(recalculateScroll, 50);
    }

    if (msg.action === "force_save_stats") {
        console.log("💪 force_save_stats reçu | visitId=", currentVisitId);
        alreadySentForThisPage = false;
        // 🔧 FIX : recalculer le scroll une dernière fois
        recalculateScroll();
        updateTimeAndSend();
    }
});
