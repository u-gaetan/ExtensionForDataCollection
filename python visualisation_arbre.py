import json
import base64
from datetime import datetime
from urllib.parse import urlparse

def extraire_nom_court(url):
    try:
        if url.startswith('chrome://'): return 'Nouvel onglet'
        if 'google.' in url and '/search' in url: return 'Recherche Google'
        parsed = urlparse(url)
        domaine = parsed.netloc.replace('www.', '')
        return domaine if domaine else url[:20] + '...'
    except:
        return str(url)[:20] + "..."

def generer_symbole_svg(has_clic, has_copy, has_keyb, is_back=False, is_closed=False):
    colors = []
    if has_clic: colors.append("#ffef11e6")
    if has_copy: colors.append("#22c55e")
    if has_keyb: colors.append("#f59e0b")
    if len(colors) == 0: colors = ["#3b82f6"]

    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    if len(colors) == 1:
        svg += f'<circle cx="50" cy="50" r="46" fill="{colors[0]}" />'
    elif len(colors) == 2:
        svg += f'<circle cx="50" cy="50" r="46" fill="{colors[0]}" />'
        svg += f'<path d="M 50 4 A 46 46 0 0 1 50 96 Z" fill="{colors[1]}" />'
    elif len(colors) == 3:
        svg += f'<circle cx="50" cy="50" r="46" fill="{colors[0]}" />'
        svg += f'<path d="M 50 50 L 50 4 A 46 46 0 0 1 89.8 73 Z" fill="{colors[1]}" />'
        svg += f'<path d="M 50 50 L 89.8 73 A 46 46 0 0 1 10.2 73 Z" fill="{colors[2]}" />'

    # Bordure : rouge si fermé, orange pointillé si retour, blanc sinon
    border_color = "#ef4444" if is_closed else ("#f97316" if is_back else "#fff")
    stroke_w = "6" if (is_back or is_closed) else "4"
    dash = ' stroke-dasharray="10,5"' if is_back else ''
    svg += f'<circle cx="50" cy="50" r="46" fill="none" stroke="{border_color}" stroke-width="{stroke_w}"{dash}/>'

    # Petite icône retour
    if is_back:
        svg += '<text x="50" y="58" text-anchor="middle" font-size="40" fill="white">↩</text>'

    svg += '</svg>'
    b64 = base64.b64encode(svg.encode('utf-8')).decode('utf-8')
    return f"image://data:image/svg+xml;base64,{b64}"

def generer_graphe_temporel(fichier_entree, fichier_sortie):
    with open(fichier_entree, 'r', encoding='utf-8') as f:
        logs = json.load(f)

    visites = []
    visit_by_id = {}   # ← NOUVEAU : groupement par visitId
    dernier_noeud_chronologique = None

    # ================================================
    # ÉTAPE 1 : Groupement par visitId (plus d'URL !)
    # ================================================
    for log in logs:
        t = log.get('type')
        url = log.get('url', '')
        visit_id = log.get('visitId')

        if t == 'navigation':
            nouvelle_visite = {
                'id_temp': len(visites),
                'url': url,
                'visitId': visit_id,
                'parentUrl': log.get('parentUrl', ''),
                'tabId': log.get('tabId'),
                'is_back_forward': log.get('transitionType') == 'back_forward',
                'timestamp': log.get('timestamp'),
                'clics': 0, 'maxScroll': 0, 'temps_passe_ms': 0,
                'textes_copies': [], 'textes_tapes': [],
                'tab_closed': False,
                'parent_chrono': dernier_noeud_chronologique['id_temp'] if dernier_noeud_chronologique else None
            }
            visites.append(nouvelle_visite)
            if visit_id:
                visit_by_id[visit_id] = nouvelle_visite
            dernier_noeud_chronologique = nouvelle_visite

        elif t == 'tab_closed':
            # Marquer le dernier noeud de cet onglet comme fermé
            tab_id = log.get('tabId')
            for v in reversed(visites):
                if v.get('tabId') == tab_id:
                    v['tab_closed'] = True
                    break

        elif visit_id and visit_id in visit_by_id:
            visit = visit_by_id[visit_id]
            if t == 'clic': visit['clics'] += 1
            elif t == 'page_quittee':
                visit['maxScroll'] = max(visit['maxScroll'], log.get('maxScroll', 0))
                visit['temps_passe_ms'] = max(visit['temps_passe_ms'], log.get('temps_passe_ms', 0))
            elif t == 'copie': visit['textes_copies'].append(log.get('texte', ''))
            elif t == 'saisie_clavier': visit['textes_tapes'].append(log.get('texte', ''))

    # ================================================
    # ÉTAPE 2 : Construction de l'arbre
    # ================================================
    nodes = []
    links = []
    x_counter = 0
    ESPACE_X = 180
    ESPACE_Y = 140
    branch_of_node = {}
    current_max_y = 0

    for visit in visites:
        node_id = f"node_{visit['id_temp']}"
        source_id = None
        curveness = 0

        # Recherche du parent par parentUrl
        if visit['parentUrl'] and visit['parentUrl'] not in ("Démarrage de l'expérience", "Ouverture directe / Nouvel onglet"):
            for past_v in reversed(visites[:visit['id_temp']]):
                if past_v['url'] == visit['parentUrl']:
                    source_id = f"node_{past_v['id_temp']}"
                    if (visit.get('tabId') and past_v.get('tabId') and visit['tabId'] == past_v['tabId']):
                        curveness = 0
                    else:
                        curveness = 0.3
                    break

        # Fallback chronologique
        if not source_id and visit['parent_chrono'] is not None:
            source_id = f"node_{visit['parent_chrono']}"
            curveness = 0

        # Gestion de l'axe Y
        if source_id and source_id in branch_of_node:
            parent_branch = branch_of_node[source_id]
            if curveness > 0:
                current_max_y += ESPACE_Y
                my_branch = current_max_y
            else:
                my_branch = parent_branch
        else:
            my_branch = 0

        branch_of_node[node_id] = my_branch
        y = my_branch
        x = x_counter * ESPACE_X
        x_counter += 1

        # Formater les infos
        temps_sec = round(visit['temps_passe_ms'] / 1000)
        url_affichage = visit['url'] if len(visit['url']) < 55 else visit['url'][:52] + "..."
        try:
            heure = datetime.fromisoformat(visit['timestamp'].replace('Z', '+00:00')).strftime('%H:%M:%S')
        except:
            heure = "Inconnue"

        # Nom du noeud avec indicateurs
        name = extraire_nom_court(visit['url'])
        if visit.get('is_back_forward'):
            name = "" + name
        if visit.get('tab_closed'):
            name = name + ""

        # Tooltip
        tooltip = f"""
        <div style='max-width:320px; white-space:normal; padding:5px; font-family:sans-serif;'>
            <b style='color:#3b82f6; font-size:13px; word-wrap:break-word;'>{url_affichage}</b><hr style='border:1px solid #334155; margin:8px 0;'>"""
        if visit.get('is_back_forward'):
            tooltip += "<b style='color:#f97316;'> Navigation retour (bouton précédent)</b><br/>"
        if visit.get('tab_closed'):
            tooltip += "<b style='color:#ef4444;'> Onglet fermé après cette page</b><br/>"
        tooltip += f""" Ouvert à : <b>{heure}</b><br/>
            Temps : <b>{temps_sec} sec</b> | Scroll : <b>{visit['maxScroll']}%</b><br/>
            Clics : <b>{visit['clics']}</b><br/>"""
        if visit['textes_tapes']:
            tooltip += f"<br/><b style='color:#f59e0b;'>{len(visit['textes_tapes'])} saisie(s) :</b><br/>"
            for t_txt in visit['textes_tapes'][:3]:
                tooltip += f"<span style='font-size:12px; color:#cbd5e1;'>- \"<i>{t_txt[:40]}...</i>\"</span><br/>"
        if visit['textes_copies']:
            tooltip += f"<br/><b style='color:#22c55e;'>{len(visit['textes_copies'])} copie(s) :</b><br/>"
            for t_txt in visit['textes_copies'][:3]:
                tooltip += f"<span style='font-size:12px; color:#cbd5e1;'>- \"<i>{t_txt[:40]}...</i>\"</span><br/>"
        tooltip += f"<br/><a href='{visit['url']}' target='_blank' style='display:inline-block; background:#3b82f6; color:white; padding:5px 10px; border-radius:4px; text-decoration:none; margin-top:5px;'>Ouvrir la page</a></div>"

        a_interagi = len(visit['textes_copies']) > 0 or len(visit['textes_tapes']) > 0 or visit['clics'] > 0

        nodes.append({
            "id": node_id, "name": name,
            "x": x, "y": y,
            "symbol": generer_symbole_svg(
                visit['clics'] > 0,
                len(visit['textes_copies']) > 0,
                len(visit['textes_tapes']) > 0,
                is_back=visit.get('is_back_forward', False),
                is_closed=visit.get('tab_closed', False)
            ),
            "symbolSize": 32 if visit.get('is_back_forward') or visit.get('tab_closed') else (28 if a_interagi else 20),
            "label": {"show": True, "position": "bottom", "rotate": 35, "align": "left",
                      "verticalAlign": "top", "distance": 8, "fontSize": 12, "color": "#334155"},
            "tooltipDetails": tooltip
        })

        if source_id:
            is_back = visit.get('is_back_forward', False)
            links.append({
                "source": source_id, "target": node_id,
                "lineStyle": {
                    "curveness": curveness,
                    "color": "#f97316" if is_back else "#94a3b8",
                    "width": 2,
                    "type": "dashed" if is_back else "solid"
                }
            })

    # ================================================
    # GÉNÉRATION HTML
    # ================================================
    html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Timeline d'Étude</title>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
    <style>body {{ margin: 0; background:#f8fafc; font-family: sans-serif; overflow: hidden; }} #chart {{ width: 100vw; height: 100vh; }} #header {{ position: absolute; top: 10px; left: 20px; z-index: 10; background: rgba(255,255,255,0.95); padding: 12px 16px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); line-height: 1.6; }}</style>
    </head><body><div id="header">
    <b>Légende (Couleurs des nœuds) :</b><br/>
    <span style="color:#3b82f6;">🔵 Aucune action</span> | <span style="color:#ffef11e6;">🟡 Clics</span> | <span style="color:#f59e0b;">🟠 Clavier</span> | <span style="color:#22c55e;">🟢 Texte copié</span><br/>
    <b>Indicateurs spéciaux :</b><br/>
    <span style="color:#f97316;">↩ Retour arrière (bordure orange pointillée)</span> | <span style="color:#ef4444;">Onglet fermé (bordure rouge)</span><br/>
    <i>Molette = zoom, glisser = déplacer</i>
    </div><div id="chart"></div>
    <script>var myChart = echarts.init(document.getElementById('chart')); myChart.setOption({{ tooltip: {{ trigger: 'item', enterable: true, backgroundColor: 'rgba(15, 23, 42, 0.95)', textStyle: {{ color: '#fff' }}, formatter: info => info.data.tooltipDetails || info.name }}, series:[{{ type: 'graph', layout: 'none', data: {json.dumps(nodes, ensure_ascii=False)}, links: {json.dumps(links)}, roam: true, edgeSymbol:['none', 'arrow'], edgeSymbolSize: [0, 10] }}] }});</script></body></html>"""

    with open(fichier_sortie, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"✅ Arbre généré : {fichier_sortie}")

if __name__ == "__main__":
    generer_graphe_temporel("Data_of_studies/etude20.json", "Visualisation/arbre20_new.html")
