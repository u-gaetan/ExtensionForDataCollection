import json
from datetime import datetime

def generer_arbre(fichier_entree, fichier_sortie):
    with open(fichier_entree, 'r', encoding='utf-8') as f:
        logs = json.load(f)

    clics_url = {}
    scroll_url = {}
    temps_url = {}

    # Extraction
    for log in logs:
        url = log.get('url')
        if not url: continue

        if log['type'] == 'clic':
            clics_url.setdefault(url, []).append(log)
        elif log['type'] == 'page_quittee':
            # On garde le scroll maximum enregistré pour cette page
            scroll = log.get('maxScroll', 0)
            if scroll > scroll_url.get(url, 0):
                scroll_url[url] = scroll
            # On met à jour le temps passé (qui vient maintenant du navigateur en ms)
            temps_url[url] = max(temps_url.get(url, 0), log.get('temps_passe_ms', 0))

    onglets = {}
    
    for log in logs:
        if log.get('type') == 'navigation':
            tab_id = log.get('tabId')
            url = log.get('url')
            parent_url = log.get('parentUrl', '')
            heure = datetime.fromisoformat(log['timestamp'].replace('Z', '+00:00')).strftime('%H:%M:%S')

            if tab_id not in onglets:
                onglets[tab_id] = {'noeuds': {}, 'racine': {"name": f"Onglet {tab_id}", "children":[]}}

            nb_clics = len(clics_url.get(url,[]))
            scroll = scroll_url.get(url, 0)
            temps_sec = round(temps_url.get(url, 0) / 1000) # Conversion ms en secondes

            # CONSTRUCTION DE LA CARTE (Carré d'infos avec lien cliquable)
            url_affichage = url if len(url) < 50 else url[:47] + "..."
            tooltip = f"""
            <div style='max-width:300px; white-space:normal; padding:5px; font-family:sans-serif;'>
                <b style='color:#3b82f6; font-size:14px; word-wrap:break-word;'>{url_affichage}</b><hr style='border:1px solid #334155; margin:8px 0;'>
                🕒 Ouvert à : <b>{heure}</b><br/>
                ⏳ Temps passé : <b>{temps_sec} sec</b><br/>
                ⬇️ Scroll max : <b>{scroll}%</b><br/>
                🖱️ Clics : <b>{nb_clics}</b><br/>
                <br/>
                <a href='{url}' target='_blank' style='display:inline-block; background:#3b82f6; color:white; padding:5px 10px; border-radius:4px; text-decoration:none; margin-top:5px;'>Ouvrir la page</a>
            </div>
            """

            nom_court = url.replace("https://", "").replace("http://", "").replace("www.", "")[:30] + "..."
            
            nouveau_noeud = {
                "name": nom_court,
                "tooltipDetails": tooltip,
                "value": nb_clics,
                "itemStyle": {"color": "#ec4899" if nb_clics > 0 else "#3b82f6"},
                "children":[]
            }

            onglets[tab_id]['noeuds'][url] = nouveau_noeud

            if parent_url in onglets[tab_id]['noeuds']:
                onglets[tab_id]['noeuds'][parent_url]['children'].append(nouveau_noeud)
            else:
                onglets[tab_id]['racine']['children'].append(nouveau_noeud)

    arbre_final = {"name": "Début de la session", "children": [d['racine'] for d in onglets.values()]}

    html = f"""
    <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Arbre de Navigation</title>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
    <style>body {{ margin: 0; background:#f8fafc; font-family: sans-serif; }} #chart {{ width: 100vw; height: 100vh; }}</style>
    </head><body><div id="chart"></div>
    <script>
        var myChart = echarts.init(document.getElementById('chart'));
        var option = {{
            tooltip: {{ 
                trigger: 'item', 
                enterable: true, // PERMET DE RENTRER LA SOURIS DANS LE CARRÉ POUR CLIQUER
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                textStyle: {{ color: '#fff' }},
                extraCssText: 'box-shadow: 0 4px 6px rgba(0,0,0,0.3); border-radius:8px;',
                formatter: info => info.data.tooltipDetails || info.data.name 
            }},
            series: [{{
                type: 'tree', 
                data:[{json.dumps(arbre_final)}], 
                label: {{position: 'left'}}, 
                initialTreeDepth: -1, // DEPLIE TOUTES LES BRANCHES PAR DEFAUT
                animationDurationUpdate: 750
            }}]
        }};
        myChart.setOption(option);
    </script></body></html>
    """
    with open(fichier_sortie, 'w', encoding='utf-8') as f: f.write(html)
    print("Arbre généré !")

if __name__ == "__main__": 
    generer_arbre("Data_of_studies/etude3.json", "Visualisation/arbre3.html")
    generer_arbre("Data_of_studies/etude4.json", "Visualisation/arbre4.html")