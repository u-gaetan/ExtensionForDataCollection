import json
from datetime import datetime
from urllib.parse import urlparse

def extraire_nom_court(url):
    try:
        if url.startswith('chrome://'): return 'Nouvel onglet'
        if 'google.' in url and '/search' in url: return '🔍 Recherche Google'
        parsed = urlparse(url)
        domaine = parsed.netloc.replace('www.', '')
        return domaine if domaine else url[:20] + '...'
    except:
        return str(url)[:20] + "..."

def generer_graphe_temporel(fichier_entree, fichier_sortie):
    with open(fichier_entree, 'r', encoding='utf-8') as f:
        logs = json.load(f)

    clics_url = {}
    scroll_url = {}
    temps_url = {}
    copies_url = {}
    saisies_url = {} # Nouveau dictionnaire pour le clavier

    # Extraction des métriques
    for log in logs:
        url = log.get('url')
        if not url: continue
        
        if log['type'] == 'clic':
            clics_url.setdefault(url, []).append(log)
        elif log['type'] == 'page_quittee':
            scroll_url[url] = max(scroll_url.get(url, 0), log.get('maxScroll', 0))
            temps_url[url] = max(temps_url.get(url, 0), log.get('temps_passe_ms', 0))
        elif log['type'] == 'copie':
            copies_url.setdefault(url,[]).append(log.get('texte', ''))
        elif log['type'] == 'saisie_clavier':
            saisies_url.setdefault(url,[]).append(log.get('texte', ''))

    nodes = []
    links =[]

    tab_y_map = {}
    next_y = 0  
    last_node_in_tab = {}
    last_node_by_url = {}
    x_counter = 0 
    
    ESPACE_X = 180 
    ESPACE_Y = 140 # Un peu plus grand pour laisser la place aux textes en biais

    # 2. Construction de la Ligne du Temps
    for log in logs:
        if log.get('type') == 'navigation':
            tab_id = log.get('tabId')
            url = log.get('url')
            if not url: continue
            
            parent_url = log.get('parentUrl', '')
            timestamp = log.get('timestamp')
            
            try:
                heure = datetime.fromisoformat(timestamp.replace('Z', '+00:00')).strftime('%H:%M:%S')
            except:
                heure = "Inconnue"

            if tab_id not in tab_y_map:
                tab_y_map[tab_id] = next_y
                next_y += ESPACE_Y  
            
            y = tab_y_map[tab_id]
            x = x_counter * ESPACE_X
            x_counter += 1

            node_id = f"node_{x_counter}"

            nb_clics = len(clics_url.get(url,[]))
            scroll = scroll_url.get(url, 0)
            temps_sec = round(temps_url.get(url, 0) / 1000)
            textes_copies = copies_url.get(url,[])
            textes_tapes = saisies_url.get(url,[])

            nom_court = extraire_nom_court(url)
            url_affichage = url if len(url) < 55 else url[:52] + "..."

            # Construction de la carte (Tooltip)
            tooltip = f"""
            <div style='max-width:320px; white-space:normal; padding:5px; font-family:sans-serif;'>
                <b style='color:#3b82f6; font-size:13px; word-wrap:break-word;'>{url_affichage}</b><hr style='border:1px solid #334155; margin:8px 0;'>
                🕒 Ouvert à : <b>{heure}</b><br/>
                ⏳ Temps passé : <b>{temps_sec} sec</b><br/>
                ⬇️ Scroll max : <b>{scroll}%</b><br/>
                🖱️ Clics : <b>{nb_clics}</b><br/>
            """
            
            # Affichage dynamique des Saisies au clavier (Nouveau)
            if textes_tapes:
                tooltip += f"<br/>⌨️ <b style='color:#f59e0b;'>{len(textes_tapes)} texte(s) tapé(s) :</b><br/>"
                for t in textes_tapes[:3]:
                    extrait = t[:40] + "..." if len(t) > 40 else t
                    tooltip += f"<span style='font-size:12px; color:#cbd5e1;'>- \"<i>{extrait}</i>\"</span><br/>"

            # Affichage dynamique des Copies
            if textes_copies:
                tooltip += f"<br/>📋 <b style='color:#22c55e;'>{len(textes_copies)} texte(s) copié(s) :</b><br/>"
                for t in textes_copies[:3]:
                    extrait = t[:40] + "..." if len(t) > 40 else t
                    tooltip += f"<span style='font-size:12px; color:#cbd5e1;'>- \"<i>{extrait}</i>\"</span><br/>"

            tooltip += f"<br/><a href='{url}' target='_blank' style='display:inline-block; background:#3b82f6; color:white; padding:5px 10px; border-radius:4px; text-decoration:none; margin-top:5px;'>Ouvrir la page</a></div>"

            a_interagi = len(textes_copies) > 0 or len(textes_tapes) > 0
            
            nodes.append({
                "id": node_id,
                "name": nom_court,
                "x": x,
                "y": y,
                "value": nb_clics,
                "symbolSize": 25 if a_interagi else (15 if nb_clics > 0 else 10),
                "itemStyle": {
                    "color": "#f59e0b" if len(textes_tapes)>0 else ("#22c55e" if len(textes_copies)>0 else ("#ec4899" if nb_clics > 0 else "#3b82f6")),
                    "borderColor": "#fff", "borderWidth": 2
                },
                "label": { 
                    "show": True, 
                    "position": "bottom", 
                    "rotate": 35,             # <--- TEXTE EN BIAIS ICI (35 degrés)
                    "align": "left",          # Alignement pour éviter la superposition
                    "verticalAlign": "top",
                    "distance": 8,
                    "fontSize": 12, 
                    "color": "#334155" 
                },
                "tooltipDetails": tooltip
            })

            source_id = None
            curveness = 0

            if tab_id in last_node_in_tab:
                source_id = last_node_in_tab[tab_id]
                curveness = 0 
            else:
                if parent_url in last_node_by_url:
                    source_id = last_node_by_url[parent_url]
                    curveness = 0.3 
            
            if source_id:
                links.append({
                    "source": source_id,
                    "target": node_id,
                    "lineStyle": { "curveness": curveness, "color": "#94a3b8", "width": 2 }
                })

            last_node_in_tab[tab_id] = node_id
            last_node_by_url[url] = node_id

    html = f"""
    <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Timeline de Navigation</title>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
    <style>
        body {{ margin: 0; background:#f8fafc; font-family: sans-serif; overflow: hidden; }} 
        #chart {{ width: 100vw; height: 100vh; }}
        #header {{ position: absolute; top: 10px; left: 20px; z-index: 10; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
    </style>
    </head><body>
    <div id="header">
        <b>Légende :</b> <span style="color:#3b82f6;">🔵 Visite simple</span> | <span style="color:#ec4899;">🔴 Clics</span> | <span style="color:#22c55e;">🟢 Copié</span> | <span style="color:#f59e0b;">🟠 Clavier</span><br/>
        <i>Utilisez la molette pour zoomer et glissez pour vous déplacer dans le temps ➔</i>
    </div>
    <div id="chart"></div>
    <script>
        var myChart = echarts.init(document.getElementById('chart'));
        var option = {{
            tooltip: {{ 
                trigger: 'item', enterable: true,
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                textStyle: {{ color: '#fff' }},
                extraCssText: 'box-shadow: 0 4px 6px rgba(0,0,0,0.3); border-radius:8px;',
                formatter: info => info.data.tooltipDetails || info.name 
            }},
            series:[{{
                type: 'graph', layout: 'none', 
                data: {json.dumps(nodes)},
                links: {json.dumps(links)},
                roam: true,
                edgeSymbol:['none', 'arrow'], 
                edgeSymbolSize: [0, 10]
            }}]
        }};
        myChart.setOption(option);
    </script></body></html>
    """
    
    with open(fichier_sortie, 'w', encoding='utf-8') as f: 
        f.write(html)
    print(f"✅ Timeline générée ! Ouvre {fichier_sortie}")

if __name__ == "__main__": 
    generer_graphe_temporel("Data_of_studies/etude10.json", "Visualisation/arbre10.html")
    # generer_graphe_temporel("Data_of_studies/etude4.json", "Visualisation/arbre4.html")