// =========================================================
// OUTILS DE PROTECTION DE LA VIE PRIVÉE (RGPD)
// =========================================================

/**
 * Détermine si un élément HTML est considéré comme sensible (ex: champ de mot de passe, carte de crédit, etc.)
 */
function isSensitiveElement(element) {
  // SÉCURITÉ : Retourner false si l'élément ou son tagName n'existe pas
  if (!element || !element.tagName) return false; 
  
  const tagName = element.tagName.toUpperCase();
  const type = (element.getAttribute("type") || "").toLowerCase();
  const name = (element.getAttribute("name") || "").toLowerCase();
  const id = (element.getAttribute("id") || "").toLowerCase();
  const autocomplete = (element.getAttribute("autocomplete") || "").toLowerCase();

  // Ne jamais capturer ce qui provient d'un champ de type mot de passe
  if (type === "password") return true;

  // Liste de mots clés suspects dans les attributs HTML
  const sensitiveKeywords = /password|passwd|pass|card|cvv|cc|cardnumber|ssn|socialsecurity|token|secret|billing|bank/i;
  
  if (sensitiveKeywords.test(name) || sensitiveKeywords.test(id) || sensitiveKeywords.test(autocomplete)) {
    return true;
  }

  return false;
}

/**
 * Nettoie le texte en censurant les motifs sensibles comme les numéros de cartes de crédit
 */
function cleanSensitiveText(text) {
  if (!text) return "";
  
  // Regex pour détecter les formats de cartes bancaires courants (13 à 19 chiffres consécutifs ou séparés par des espaces/tirets)
  const ccRegex = /\b(?:\d[ -]*?){13,19}\b/g;
  
  return text.replace(ccRegex, "[DONNÉE_SENSIBLE_MASQUÉE]");
}


// =========================================================
// SUIVI DES CLICS
// =========================================================
document.addEventListener("mousedown", function (event) {
  if (!currentVisitId) return;
  chrome.runtime
    .sendMessage({
      type: "clic",
      visitId: currentVisitId,
      x: event.clientX,
      y: event.clientY,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    })
    .catch(function () {});
});

// =========================================================
// SUIVI DES COPIES
// =========================================================
document.addEventListener("copy", function (event) {
  if (!currentVisitId) return;

  // Sécurité : Ignorer la copie si elle provient d'un élément sensible
  if (isSensitiveElement(event.target)) {
    return;
  }

  var txt = document.getSelection().toString();
  if (
    !txt &&
    event.target &&
    (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA")
  ) {
    txt = event.target.value.substring(
      event.target.selectionStart,
      event.target.selectionEnd
    );
  }

  if (txt && txt.trim().length > 0) {
    // Filtrage et nettoyage
    const cleanText = cleanSensitiveText(txt);

    chrome.runtime
      .sendMessage({
        type: "copie",
        visitId: currentVisitId,
        texte: cleanText,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      })
      .catch(function () {});
  }
});

// =========================================================
// SUIVI COMPTEUR TOUCHES CLAVIER
// =========================================================
document.addEventListener("keydown", function (event) {
  if (!currentVisitId) return;
  keyPressCount++;
});

// =========================================================
// SUIVI DES COLLAGES (Ctrl+V / paste)
// =========================================================
document.addEventListener("paste", function (event) {
  if (!currentVisitId) return;

  // Sécurité : Ne pas suivre le collage si le champ de destination est sensible
  if (isSensitiveElement(event.target)) {
    return;
  }

  var txt = "";

  if (event.clipboardData) {
    txt = event.clipboardData.getData("text/plain");
  }

  if (!txt && window.clipboardData) {
    txt = window.clipboardData.getData("Text");
  }

  if (txt && txt.trim().length > 0) {
    // Filtrage et nettoyage
    const cleanText = cleanSensitiveText(txt);

    chrome.runtime
      .sendMessage({
        type: "collage",
        visitId: currentVisitId,
        texte: cleanText,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      })
      .catch(function () {});
  }
});