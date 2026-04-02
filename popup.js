const toggleBtn = document.getElementById('toggleBtn');
const downloadBtn = document.getElementById('downloadBtn');

chrome.storage.local.get(['isTracking'], function(result) {
    updateButtonVisuals(result.isTracking || false);
});

toggleBtn.addEventListener('click', () => {
    chrome.storage.local.get(['isTracking'], function(result) {
        let newState = !(result.isTracking || false);
        
        if (newState === true) {
            chrome.runtime.sendMessage({ action: "get_data" }, function(response) {
                if (response && response.data && response.data.length > 0) {
                    let confirmClear = confirm("⚠️ Démarrer une nouvelle session effacera les données précédentes. Continuer ?");
                    if (!confirmClear) return;
                }
                // Si l'utilisateur confirme, on efface ET on lance la collecte seulement après
                chrome.runtime.sendMessage({ action: "clear_data" }, () => {
                    changerEtat(newState);
                });
            });
        } else {
            changerEtat(newState);
        }
    });
});

function changerEtat(state) {
    chrome.storage.local.set({ isTracking: state }, () => updateButtonVisuals(state));
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
    // 1. On dit à toutes les pages : "Envoyez vos données de temps maintenant !"
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: "force_save_stats" }).catch(()=>{});
        });
    });

    // 2. On attend une demi-seconde que les pages répondent, puis on télécharge
    setTimeout(() => {
        chrome.runtime.sendMessage({ action: "get_data" }, function(response) {
            if (response && response.data.length > 0) {
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