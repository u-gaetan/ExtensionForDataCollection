const toggleBtn = document.getElementById('toggleBtn');
const downloadBtn = document.getElementById('downloadBtn');

chrome.storage.local.get(['isTracking'], function(result) {
    updateButtonVisuals(result.isTracking || false);
});


toggleBtn.addEventListener('click', () => {

    chrome.storage.local.get(['isTracking'], function(result) {
        let newState = !(result.isTracking || false);
        console.log("🔘 Toggle cliqué | état actuel=", result.isTracking, "| nouvel état=", newState);

        if (newState === true) {
            // --- DÉMARRAGE ---
            chrome.runtime.sendMessage({ action: "get_data" }, function(response) {
                if (response && response.data && response.data.length > 0) {
                    let confirmClear = confirm("Démarrer une nouvelle session effacera les données précédentes. Continuer ?");
                    if (!confirmClear) return;
                }

                chrome.runtime.sendMessage({ action: "clear_data" }, () => {
                    chrome.runtime.sendMessage({ action: "start_tracking" }, () => {
                        changerEtat(newState);
                    });
                });
            });

        } else {
            // --- ARRÊT ---
            // 🔧 FIX BUG 2 : envoyer force_save_stats à l'onglet actif
            //    AVANT de couper le tracking
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "force_save_stats"
                    }).catch(() => {});
                }

                // Attendre que le page_quittee arrive au background
                // (isTracking est encore true → le background accepte le message)
                setTimeout(() => {
                    // Demander au background de sauvegarder dans storage
                    chrome.runtime.sendMessage({ action: "stop_tracking" }, () => {
                        changerEtat(newState);
                    });
                }, 400);
            });
        }
    });
});


function changerEtat(state) {
    chrome.storage.local.set({ isTracking: state }, () => {
        updateButtonVisuals(state);
        console.log("✅ changerEtat terminé | state=", state);
    });
}

function updateButtonVisuals(isTracking) {
    if (isTracking) {
        toggleBtn.textContent = "🟢 COLLECTE EN COURS...";
        toggleBtn.style.backgroundColor = "#22c55e";
    } else {
        toggleBtn.textContent = "🔴 COLLECTE OFF";
        toggleBtn.style.backgroundColor = "#ef4444";
    }
}


downloadBtn.addEventListener('click', () => {
    // 1. Forcer la sauvegarde sur tous les onglets
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: "force_save_stats" }).catch(() => {});
        });
    });

    // 2. Attendre, puis télécharger
    setTimeout(() => {
        chrome.runtime.sendMessage({ action: "get_data" }, function(response) {
            if (response && response.data && response.data.length > 0) {
                const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `etude_${new Date().getTime()}.json`;
                a.click();
            } else {
                alert("Aucune donnée à télécharger.");
            }
        });
    }, 500);
});
