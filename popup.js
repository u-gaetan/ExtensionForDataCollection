const toggleBtn = document.getElementById('toggleBtn');
const statusMsg = document.getElementById('statusMsg');
const participantBadge = document.getElementById('participantBadge');

// =========================================================
// RESTAURER L'ÉTAT
// =========================================================
chrome.storage.local.get(['isTracking', 'participantId'], function(result) {
    updateUI(result.isTracking || false);
    if (result.participantId) {
        participantBadge.textContent = "ID : " + result.participantId;
    }
});

// =========================================================
// BOUTON UNIQUE : DÉMARRER / ARRÊTER
// =========================================================
toggleBtn.addEventListener('click', () => {
    chrome.storage.local.get(['isTracking'], function(result) {
        const newState = !(result.isTracking || false);

        if (newState === true) {
            // --- DÉMARRAGE ---
            chrome.runtime.sendMessage({ action: "get_data" }, function(response) {
                const hasData = response && response.data && response.data.length > 0;

                if (hasData) {
                    if (!confirm("Des données existent. Effacer et redémarrer ?")) return;
                }

                chrome.runtime.sendMessage({ action: "clear_data" }, () => {
                    chrome.runtime.sendMessage({ action: "start_tracking" }, () => {
                        chrome.storage.local.set({ isTracking: true }, () => {
                            updateUI(true);
                            showStatus("🟢 Naviguez normalement !", "success");
                        });
                        chrome.runtime.sendMessage({ action: "get_extension_ids" }, (ids) => {
                            if (ids && ids.participantId && ids.sessionId) {
                                const questionnaireUrl =
                                    `http://localhost:3000/questionnaire/?pid=${ids.participantId}&sid=${ids.sessionId}`;
                                chrome.tabs.create({ url: questionnaireUrl });
                            }
                        });
                    });
                });
            });

        } else {
            // --- ARRÊT + ENVOI AUTOMATIQUE ---
            toggleBtn.disabled = true;
            showStatus("⏳ Envoi des données en cours...", "info");

            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "force_save_stats"
                    }).catch(() => {});
                }
                
                chrome.tabs.sendMessage(tabs[0].id, { action: "force_save_stats" }, () => {
                    // Accusé reçu OU erreur (page chrome://, etc.) → on continue
                    if (chrome.runtime.lastError) {
                        console.warn("force_save_stats non reçu:", chrome.runtime.lastError.message);
                    }
                    chrome.runtime.sendMessage({ action: "stop_tracking" }, (result) => {
                        chrome.storage.local.set({ isTracking: false }, () => {
                            updateUI(false);
                            toggleBtn.disabled = false;

                            if (result && result.success) {
                                showStatus("✅ Données envoyées ! Merci pour votre participation.", "success");
                            } else {
                                showStatus("⚠️ Envoi échoué. Vos données sont sauvegardées, elles seront renvoyées.", "error");
                            }
                        });
                    });
                });
            
            });
        }
    });
});


// =========================================================
// UI
// =========================================================
function updateUI(isTracking) {
    if (isTracking) {
        toggleBtn.textContent = "⏹️ ARRÊTER L'ÉTUDE";
        toggleBtn.style.backgroundColor = "#22c55e";
    } else {
        toggleBtn.textContent = "▶️ DÉMARRER L'ÉTUDE";
        toggleBtn.style.backgroundColor = "#3b82f6";
    }
}

function showStatus(text, type) {
    statusMsg.textContent = text;
    statusMsg.className = type || "";
}
