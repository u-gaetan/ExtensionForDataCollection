const toggleBtn = document.getElementById('toggleBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusMsg = document.getElementById('statusMsg');
const participantInput = document.getElementById('participantId');

// =========================================================
// RESTAURER L'ÉTAT
// =========================================================
chrome.storage.local.get(['isTracking', 'participantId'], function(result) {
    updateUI(result.isTracking || false);
    if (result.participantId) participantInput.value = result.participantId;
});

// Sauvegarder le participant ID quand il change
participantInput.addEventListener('change', () => {
    chrome.storage.local.set({ participantId: participantInput.value.trim() });
});


// =========================================================
// BOUTON COLLECTE ON/OFF
// =========================================================
toggleBtn.addEventListener('click', () => {
    chrome.storage.local.get(['isTracking'], function(result) {
        const newState = !(result.isTracking || false);

        if (newState === true) {
            // --- DÉMARRAGE ---
            if (!participantInput.value.trim()) {
                showStatus("⚠️ Entrez votre identifiant !", "error");
                participantInput.focus();
                return;
            }

            // Sauvegarder l'ID
            chrome.storage.local.set({ participantId: participantInput.value.trim() });

            chrome.runtime.sendMessage({ action: "get_data" }, function(response) {
                const hasData = response && response.data && response.data.length > 0;

                if (hasData) {
                    if (!confirm("Des données existent déjà.\nEffacer et démarrer une nouvelle session ?")) {
                        return;
                    }
                }

                chrome.runtime.sendMessage({ action: "clear_data" }, () => {
                    chrome.runtime.sendMessage({ action: "start_tracking" }, () => {
                        chrome.storage.local.set({ isTracking: true }, () => {
                            updateUI(true);
                            showStatus("🟢 Collecte démarrée ! Naviguez normalement.", "success");
                        });
                    });
                });
            });

        } else {
            // --- ARRÊT ---
            toggleBtn.disabled = true;
            showStatus("⏳ Sauvegarde et envoi en cours...", "info");

            // 1. Forcer la sauvegarde de la dernière page
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "force_save_stats"
                    }).catch(() => {});
                }

                // 2. Attendre que page_quittee arrive, puis stopper + envoi auto
                setTimeout(() => {
                    chrome.runtime.sendMessage({ action: "stop_tracking" }, (result) => {
                        chrome.storage.local.set({ isTracking: false }, () => {
                            updateUI(false);
                            toggleBtn.disabled = false;

                            if (result && result.success) {
                                showStatus(`✅ ${result.count} événements envoyés !`, "success");
                            } else if (result && result.error) {
                                showStatus(
                                    "⚠️ Envoi échoué (" + result.error + ").\n" +
                                    "Vos données sont sauvées localement. Réessayez avec le bouton backup.",
                                    "error"
                                );
                            } else {
                                showStatus("🔴 Collecte arrêtée.", "info");
                            }
                        });
                    });
                }, 500);
            });
        }
    });
});


// =========================================================
// BOUTON TÉLÉCHARGER (backup)
// =========================================================
downloadBtn.addEventListener('click', () => {
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: "force_save_stats" }).catch(() => {});
        });
    });

    setTimeout(() => {
        chrome.runtime.sendMessage({ action: "get_data" }, function(response) {
            if (response && response.data && response.data.length > 0) {
                const pid = participantInput.value.trim() || "anonyme";
                const blob = new Blob(
                    [JSON.stringify(response.data, null, 2)],
                    { type: "application/json" }
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${pid}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;
                a.click();
                showStatus("💾 Fichier téléchargé !", "success");
            } else {
                showStatus("⚠️ Aucune donnée à télécharger.", "error");
            }
        });
    }, 500);
});


// =========================================================
// FONCTIONS UI
// =========================================================
function updateUI(isTracking) {
    if (isTracking) {
        toggleBtn.textContent = "🟢 COLLECTE EN COURS...";
        toggleBtn.style.backgroundColor = "#22c55e";
        participantInput.disabled = true;
    } else {
        toggleBtn.textContent = "🔴 COLLECTE OFF";
        toggleBtn.style.backgroundColor = "#ef4444";
        participantInput.disabled = false;
    }
}

function showStatus(text, type) {
    statusMsg.textContent = text;
    statusMsg.className = type || "";
}
