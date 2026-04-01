// On écoute chaque clic sur la page web
document.addEventListener('click', function(event) {
    const data = {
        type: 'clic',
        x: event.clientX, // Coordonnée X
        y: event.clientY, // Coordonnée Y
        url: window.location.href, // L'adresse du site web
        timestamp: new Date().toISOString() // L'heure exacte
    };
    
    // On envoie ces données au "cerveau" de l'extension (background.js)
    chrome.runtime.sendMessage(data);
});