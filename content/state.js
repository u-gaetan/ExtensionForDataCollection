// =========================================================
// VARIABLES PARTAGÉES — CONTENT SCRIPTS
// =========================================================
let currentVisitId = null;
let maxScrollPercent = 0;
let timeSpentOnPageMs = 0;
let lastFocusTime = Date.now();
let isPageVisible = !document.hidden;
let alreadySentForThisPage = false;
let keyPressCount = 0;
