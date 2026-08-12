# Chrome Extension — Web Navigation Study, Université Laval

Chrome extension for collecting behavioral web navigation data for the research project:  
**"Validation of General Knowledge Questions for the Study of Web Information-Seeking Processes"**

| | |
|---|---|
| **Ethical Approval** | CÉRUL 2025-460 A-1 / 04-05-2026 |
| **Principal Investigator** | Alexandre Marois, Ph.D., School of Psychology, Université Laval |
| **Lab** | LEILAH — leilah@ulaval.ca |
| **Funding** | NSERC |
| **Targeted Sample** | ~400 |

---

## 🇬🇧 English Version

### What the Extension Does
- Activates **only after the participant's explicit consent**.
- Collectes browsing metrics strictly during the information-seeking session.
- Blocks access to generative artificial intelligence tools (ChatGPT, Gemini, Claude, and Google AI Search mode `udm=50`).
- Automatically deactivates and stops tracking at the end of the survey and/or when the user click on "Stop the study" and/or when the maximum total time (4h) or maximum inactivity time (1h) is reached.

**Collected Data:** Visited URLs, active time spent per page, click events, scroll depth, aggregate keystroke counters (no raw content), copied/pasted text elements, UTC timestamps.  
**Never Collected:** Browsing history prior to the study, passwords, form inputs, geolocation data.

### File Directory Structure
ExtensionForDataCollection/
├── manifest.json # Configuration, permissions & inject rules
├── background/ # Background scripts (MV3 Service Worker)
│ ├── background.js # Main service worker entry point
│ ├── config.js # API URL, blocked domains & global settings
│ ├── messages.js # Tab messaging, inactivity & session timers
│ ├── navigation.js # Tab tracker & AI blocker (udm=50)
│ ├── network.js # Local hybrid encryption (CSFLE RSA+AES)
│ └── state.js # Persists background state to local storage
├── content/ # Page-level content scripts
│ ├── content.js # Main active page injection orchestrator
│ ├── state.js # Active page local states (clicks, scroll)
│ ├── scroll-tracker.js # Tracks maximum vertical scroll depth (%)
│ ├── time-tracker.js # Measures active attention time on active tabs
│ ├── interaction-tracker.js # Tracks clicks, keypress count, copy-pastes
│ ├── study-banner.js # Renders transparent banner (CSP-resistant)
│ ├── questionnaire-watcher.js# Secure messaging bridge to the web survey
│ └── block-ai-overview.js # Hides Google AI search elements
├── popup/ # Extension popup interface
│ ├── popup.html # Popup UI layout
│ └── popup.js # Dynamic bilingual toggles and buttons
├── blocked/ # Redirection screens
│ ├── blocked.html # Interface for blocked AI tools
│ ├── blocked.js # Resolves blocked URLs dynamically
│ ├── blocked_memory.html # Navigation lock during the memory test
│ └── blocked_memory.js # Script managing the memory lock state
└── icons/ # Laval University logos
code
Code
### Security & Cryptography
- **Transit:** TLS 1.3
- **Storage:** AES-256 (Azure Cosmos DB, Canada East)
- **Sensitive Fields:** Client-Side Field-Level Encryption (CSFLE - Hybrid RSA-OAEP 2048 + AES-GCM 256) for URLs and copy-paste content. Can only be decrypted by the principal investigator with their private key.
- **Access Control:** MFA + Université Laval SSO · Azure Managed Identity (zero plaintext secrets in source code).

### Participant Journey
1. Participant receives the survey link via email.
2. Language selection and submission of the initial consent form.
3. Installation page: participant installs the extension. The tab reloads and synchronizes automatically. Tracking starts when the user click on "Start the study".
4. Active information-seeking tasks (tracking active, banner "Data collection active" lower right on the screen).
5. Completion screen: a built-in red button allows the user to uninstall the extension in a single click.

### Compliance
- Fully compliant with Quebec's Law 25, PIPEDA (Canada), TCPS 2, and NSERC ethical standards.
- Adheres to the Chrome Web Store Developer Program Policies (Manifest V3 - No scripting permission, minimal access scope).

---
---

## 🇫🇷 Version Française

# Extension Chrome — Étude Navigation Web, Université Laval

Extension de collecte de données comportementales de navigation Web pour le projet :  
**"Validation de questions de connaissances générales pour l'étude des processus de recherche d'information Web"**

| | |
|---|---|
| **Approbation éthique** | CÉRUL 2025-460 A-1 / 04-05-2026 |
| **Chercheur principal** | Alexandre Marois, Ph.D., École de psychologie, Université Laval |
| **Labo** | LEILAH — leilah@ulaval.ca |
| **Financement** | CRSNG |
| **Participants visés** | ~400 |

---

### Ce que fait l'extension
- S'active **uniquement si le consentement explicite** du participant a été retenu et qu'il clique sur "Démarrer l'étude"
- Collecte des métriques de navigation pendant la session de recherche uniquement.
- Bloque l'accès aux intelligences artificielles génératives (ChatGPT, Gemini, Claude, ainsi que le mode Google AI Search `udm=50`).
- S'arrête et se désactive **automatiquement** à la fin du questionnaire et/ou si le participant clique sur "Arrêter l'étude" et/ou le temps total maximum de 4h ou d'1h d'inactivité est dépassé.

**Données collectées :** URLs visitées, temps actif par page, clics, profondeur de défilement (scroll), compteur agrégé de frappes clavier (sans le contenu), textes copiés-collés, horodatages UTC.  
**Données jamais collectées :** Historique antérieur à l'étude, mots de passe, saisies de formulaires, données de géolocalisation.

### Structure des fichiers
ExtensionForDataCollection/
├── manifest.json # Configuration, permissions et règles d'injection
├── background/ # Scripts d'arrière-plan (Service Worker MV3)
│ ├── background.js # Point d'entrée principal du service worker
│ ├── config.js # URL de l'API, domaines IA bloqués et paramètres globaux
│ ├── messages.js # Communication, inactivité et minuteries
│ ├── navigation.js # Suivi d'onglets et blocage du mode IA Google (udm=50)
│ ├── network.js # Chiffrement hybride local (CSFLE RSA+AES)
│ └── state.js # Persistance de l'état en arrière-plan (storage)
├── content/ # Scripts d'injection (Content Scripts)
│ ├── content.js # Orchestrateur d'injection sur la page active
│ ├── state.js # État local de la page active (clics, défilement)
│ ├── scroll-tracker.js # Mesure de la profondeur de défilement (%)
│ ├── time-tracker.js # Mesure du temps d'attention actif réel
│ ├── interaction-tracker.js # Enregistre clics, frappes et copier-coller
│ ├── study-banner.js # Bandeau d'étude transparent (anti-CSP)
│ ├── questionnaire-watcher.js# Pont de communication sécurisé avec le questionnaire
│ └── block-ai-overview.js # Masque les composants de recherche IA Google
├── popup/ # Interface pop-up de l'extension
│ ├── popup.html # Structure HTML du pop-up
│ └── popup.js # Traductions dynamiques et boutons de contrôle
├── blocked/ # Pages de redirection
│ ├── blocked.html # Redirection lors du blocage de l'IA
│ ├── blocked.js # Résolution dynamique de l'URL bloquée
│ ├── blocked_memory.html # Verrouillage de recherche pendant le test de mémoire
│ └── blocked_memory.js # Gestion de l'état de verrouillage de recherche
└── icons/ # Logos officiels Université Laval
code
Code
### Sécurité et Chiffrement
- **Transit :** TLS 1.3
- **Stockage :** AES-256 (Azure Cosmos DB, Canada Est)
- **Champs sensibles :** Chiffrement hybride asymétrique au client (clé publique RSA-OAEP 2048 + AES-GCM 256) pour les URLs et les textes copiés-collés. Déchiffrement possible uniquement par le chercheur principal via sa clé privée.
- **Accès :** MFA + SSO Université Laval · Managed Identity (aucun secret en clair dans le code source).

### Parcours participant
1. Réception du lien du questionnaire par courriel.
2. Sélection de la langue et signature du consentement initial.
3. Page d'installation : le participant installe l'extension. L'onglet se rafraîchit automatiquement et se synchronise. Le participant clique sur "Démarrer l'étude".
4. Réalisation des tâches de recherche pour répondre au questionnaire (extension active, bandeau "Collecte des données en cours" présent en bas à droite de l'écran).
5. Écran de fin : un bouton rouge intégré permet de désinstaller l'extension en un clic.

### Conformité
- Conforme à la Loi 25 (Québec), PIPEDA (Canada), EPTC 2 et aux directives éthiques du CRSNG.
- Respect du programme de politiques pour développeurs du Chrome Web Store (Manifest V3 - Pas de permission scripting, portée d'accès minimale).