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
| **Durée de l'étude** | 2026-06-01 → 2027-06-01 |

---

## Ce que fait l'extension

- S'active **uniquement après consentement explicite** du participant
- Collecte des métriques de navigation pendant la session de recherche uniquement
- S'arrête **automatiquement** à la fin du questionnaire

**Données collectées :** URLs visitées · temps par page · clics · scroll · compteur de frappes (agrégé, sans contenu) · contenu copié-collé · horodatages UTC

**Jamais collecté :** historique antérieur · mots de passe · formulaires · géolocalisation · communications privées

---

## Structure

```
ExtensionForDataCollection/
├── manifest.json
├── background/
│   └── background.js          # Service worker, envoi API
├── content/
│   ├── content.js             # Orchestrateur
│   ├── state.js               # État session
│   ├── scroll-tracker.js
│   ├── time-tracker.js
│   ├── interaction-tracker.js
│   ├── study-banner.js        # Bandeau de transparence visible
│   ├── questionnaire-watcher.js
│   └── block-ai-overview.js   # Bloque AI Overview Google
├── popup/
│   └── popup.html
├── blocked/
│   └── blocked.html
└── icons/
```

---

## Sécurité

| Couche | Mécanisme |
|---|---|
| Transit | TLS 1.3 |
| Repos | AES-256 (Azure Cosmos DB, Canada Est) |
| Champs sensibles | CSFLE via Azure Key Vault (URLs + clipboard) |
| Accès | MFA + SSO ULaval · Managed Identity (0 secret en clair) |
| Pseudonymisation | Table de correspondance chiffrée, accès chercheur principal uniquement |
| Anti-MITM | Certificate pinning |

---

## Parcours participant

1. Reçoit le lien d'installation (Chrome Web Store, non répertorié)
2. Installe l'extension
3. Clique sur l'icône → lit le formulaire de consentement → clique **Commencer l'étude**
4. Réalise les tâches de recherche (extension active, bandeau visible)
5. Fin du questionnaire → extension désactivée automatiquement → invite à désinstaller

---

## Conformité

- Loi 25 (Québec) · PIPEDA · EPTC 2 · Politique 3 organismes (CRSNG)
- Chrome Web Store Developer Program Policies (Manifest V3)

**Page de l'étude :** `https://[domaine].azurewebsites.net`  
**Politique de confidentialité :** `https://[domaine].azurewebsites.net/privacy`  
**Formulaire de consentement :** `https://[domaine].azurewebsites.net/consent`

---

Contact : alexandre.marois@ulaval.ca · CÉRUL : cer@vrr.ulaval.ca