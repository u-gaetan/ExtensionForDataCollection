import json
import os

def generer_arbre_interactif(fichier_entree, fichier_sortie):
    """
    Lit le fichier JSON généré par l'extension Chrome,
    reconstruit l'arbre de navigation et génère un fichier HTML interactif.
    """
    print(f"Lecture des données depuis {fichier_entree}...")
    
    try:
        with open(fichier_entree, 'r', encoding='utf-8') as f:
            logs = json.load(f)
    except FileNotFoundError:
        print(f"Erreur : Le fichier {fichier_entree} est introuvable.")
        return

    # 1. Regrouper les clics par URL
    clics_par_url = {}
    for log in logs:
        if log.get('type') == 'clic':
            url = log.get('url')
            if url not in clics_par_url:
                clics_par_url[url] = []
            clics_par_url[url].append(f"(x:{log.get('x')}, y:{log.get('y')})")

    # 2. Reconstruire les arbres par onglet
    onglets = {}
    
    for log in logs:
        if log.get('type') == 'navigation':
            tab_id = log.get('tabId')
            url = log.get('url')
            parent_url = log.get('parentUrl', '')

            # Initialiser l'onglet si c'est la première fois qu'on le voit
            if tab_id not in onglets:
                onglets[tab_id] = {
                    'noeuds_plats': {}, # Pour retrouver facilement un noeud parent
                    'racine': {
                        "name": f"Onglet {tab_id}", 
                        "itemStyle": {"color": "#334155"}, # Couleur gris foncé pour la racine
                        "children": []
                    }
                }

            # Préparer les données de clics pour cette URL
            liste_clics = clics_par_url.get(url, [])
            nb_clics = len(liste_clics)
            
            # Formater le texte qui apparaîtra au survol (tooltip)
            details_tooltip = f"{url}<br/><br/>"
            if nb_clics > 0:
                details_tooltip += f"<b>🔥 {nb_clics} clics détectés</b><br/>"
                details_tooltip += "<br/>".join(liste_clics[:5]) # Montrer les 5 premiers clics
                if nb_clics > 5:
                    details_tooltip += "<br/>..."
                couleur_noeud = "#ec4899" # Rose vif si clics
            else:
                details_tooltip += "Aucun clic détecté."
                couleur_noeud = "#3b82f6" # Bleu standard si 0 clic

            # Créer le noeud de l'arbre
            nom_court = url.replace("https://", "").replace("http://", "").replace("www.", "")[:35] + "..."
            nouveau_noeud = {
                "name": nom_court,
                "tooltipDetails": details_tooltip,
                "value": nb_clics,
                "itemStyle": {"color": couleur_noeud},
                "children": []
            }

            # Mémoriser ce noeud pour pouvoir lui attacher des enfants plus tard
            onglets[tab_id]['noeuds_plats'][url] = nouveau_noeud

            # Attacher le noeud à son parent (si le parent existe déjà dans cet onglet)
            if parent_url in onglets[tab_id]['noeuds_plats']:
                onglets[tab_id]['noeuds_plats'][parent_url]['children'].append(nouveau_noeud)
            else:
                # Sinon, on l'attache directement à la racine de l'onglet
                onglets[tab_id]['racine']['children'].append(nouveau_noeud)

    # 3. Assembler l'arbre final
    arbre_final = {
        "name": "Session d'Étude Globale",
        "itemStyle": {"color": "#0f172a"},
        "children": [donnees['racine'] for donnees in onglets.values()]
    }

    # 4. Générer le fichier HTML avec ECharts
    html_template = f"""
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Visualisation de l'Étude - UWindsor / ULaval</title>
        <!-- Importation de la librairie ECharts -->
        <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
        <style>
            body {{ margin: 0; padding: 0; background-color: #f8fafc; font-family: sans-serif; }}
            #header {{ padding: 20px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
            h1 {{ margin: 0; color: #1e293b; font-size: 24px; }}
            p {{ margin: 5px 0 0 0; color: #64748b; font-size: 14px; }}
            #arbre-container {{ width: 100vw; height: calc(100vh - 80px); }}
        </style>
    </head>
    <body>
        <div id="header">
            <h1>Cartographie Comportementale</h1>
            <p>Les noeuds <b>roses</b> indiquent la présence de clics. Passez la souris pour voir les coordonnées.</p>
        </div>
        <div id="arbre-container"></div>

        <script>
            // Initialisation de la zone de dessin
            var myChart = echarts.init(document.getElementById('arbre-container'));
            
            // Injection des données JSON formatées par Python
            var data = {json.dumps(arbre_final)};

            // Configuration de l'arbre interactif
            var option = {{
                tooltip: {{
                    trigger: 'item',
                    triggerOn: 'mousemove',
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    textStyle: {{ color: '#fff' }},
                    formatter: function (info) {{
                        return info.data.tooltipDetails || info.data.name;
                    }}
                }},
                series: [
                    {{
                        type: 'tree',
                        data: [data],
                        top: '5%',
                        left: '10%',
                        bottom: '5%',
                        right: '20%',
                        symbolSize: function(value, params) {{
                            // Agrandir le cercle si des clics ont été faits
                            return params.data.value > 0 ? 20 : 12;
                        }},
                        label: {{
                            position: 'left',
                            verticalAlign: 'middle',
                            align: 'right',
                            fontSize: 13,
                            color: '#334155'
                        }},
                        leaves: {{
                            label: {{
                                position: 'right',
                                verticalAlign: 'middle',
                                align: 'left'
                            }}
                        }},
                        expandAndCollapse: true,
                        animationDuration: 550,
                        animationDurationUpdate: 750
                    }}
                ]
            }};

            // Affichage de l'arbre
            myChart.setOption(option);
            
            // Rendre le graphique responsive
            window.addEventListener('resize', function() {{
                myChart.resize();
            }});
        </script>
    </body>
    </html>
    """

    with open(fichier_sortie, 'w', encoding='utf-8') as f:
        f.write(html_template)
    
    print(f"Succès ! Le fichier visuel interactif a été créé : {fichier_sortie}")

# --- EXÉCUTION DU SCRIPT ---
if __name__ == "__main__":
    # Assure-toi que ce nom correspond au fichier téléchargé par ton extension Chrome
    FICHIER_JSON_SOURCE = "session_etude.json" 
    FICHIER_HTML_RESULTAT = "arbre_interactif.html"
    
    # Création d'un fichier JSON factice pour le test si le tien n'est pas dans le même dossier
    if not os.path.exists(FICHIER_JSON_SOURCE):
        print(f"Attention: {FICHIER_JSON_SOURCE} introuvable. Veille à bien placer le fichier généré par l'extension à côté du script Python.")
    else:
        generer_arbre_interactif(FICHIER_JSON_SOURCE, FICHIER_HTML_RESULTAT)