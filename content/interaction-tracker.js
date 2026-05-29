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
    chrome.runtime
      .sendMessage({
        type: "copie",
        visitId: currentVisitId,
        texte: txt,
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

  var txt = "";

  // Méthode 1 : clipboardData (fonctionne dans la plupart des cas)
  if (event.clipboardData) {
    txt = event.clipboardData.getData("text/plain");
  }

  // Méthode 2 : window.clipboardData (ancien IE/Edge)
  if (!txt && window.clipboardData) {
    txt = window.clipboardData.getData("Text");
  }

  if (txt && txt.trim().length > 0) {
    chrome.runtime
      .sendMessage({
        type: "collage",
        visitId: currentVisitId,
        texte: txt,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      })
      .catch(function () {});
  }
});
