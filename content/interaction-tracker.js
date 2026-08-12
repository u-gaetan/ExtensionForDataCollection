// =========================================================
// protection of sensitive data (passwords, credit cards, etc.)
// =========================================================

/**
 * detects if an element is likely to contain sensitive data (passwords, credit cards, etc.)
 */
function isSensitiveElement(element) {
  // SÉCURITÉ : Retourner false si l'élément ou son tagName n'existe pas
  if (!element || !element.tagName) return false; 
  
  const tagName = element.tagName.toUpperCase();
  const type = (element.getAttribute("type") || "").toLowerCase();
  const name = (element.getAttribute("name") || "").toLowerCase();
  const id = (element.getAttribute("id") || "").toLowerCase();
  const autocomplete = (element.getAttribute("autocomplete") || "").toLowerCase();

  // never track password fields
  if (type === "password") return true;

  // list of sensitive input types
  const sensitiveKeywords = /password|passwd|pass|card|cvv|cc|cardnumber|ssn|socialsecurity|token|secret|billing|bank/i;
  
  if (sensitiveKeywords.test(name) || sensitiveKeywords.test(id) || sensitiveKeywords.test(autocomplete)) {
    return true;
  }

  return false;
}

/**
 * cleans sensitive text by removing potential credit card numbers and other sensitive patterns
 */
function cleanSensitiveText(text) {
  if (!text) return "";
  
  // Regex pour détecter les formats de cartes bancaires courants (13 à 19 chiffres consécutifs ou séparés par des espaces/tirets)
  const ccRegex = /\b(?:\d[ -]*?){13,19}\b/g;
  
  return text.replace(ccRegex, "[DONNÉE_SENSIBLE_MASQUÉE]");
}


// =========================================================
// click tracking
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
// copy tracking
// =========================================================
document.addEventListener("copy", function (event) {
  if (!currentVisitId) return;

  // security: do not track copy if the target element is sensitive
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
    // security: filter and clean sensitive text
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
// keyboard touch count tracking
// =========================================================
document.addEventListener("keydown", function (event) {
  if (!currentVisitId) return;
  keyPressCount++;
});

// =========================================================
// paste tracking
// =========================================================
document.addEventListener("paste", function (event) {
  if (!currentVisitId) return;

  // security: do not track paste if the target element is sensitive
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
    // security: filter and clean sensitive text
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