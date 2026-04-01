//Ce script va demander les données au `background.js` et créer le fichier à télécharger.

document.getElementById('downloadBtn').addEventListener('click', () => {
    // On demande les données au background.js
    chrome.runtime.sendMessage({ action: "get_data" }, function(response) {
        if (response && response.data) {
            // Transformation des données en texte JSON formaté
            const dataStr = JSON.stringify(response.data, null, 2);
            
            // Création d'un fichier virtuel
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            
            // Déclenchement automatique du téléchargement
            const a = document.createElement('a');
            a.href = url;
            a.download = `session_etude_${new Date().getTime()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });
});