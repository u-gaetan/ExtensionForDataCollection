import json
import base64
from datetime import datetime
from urllib.parse import urlparse, parse_qs


# =========================================================
# UTILITAIRES
# =========================================================

def extraire_nom_court(url):
    try:
        if url.startswith('chrome://'):
            return 'Nouvel onglet'
        if 'google.' in url and '/search' in url:
            try:
                q = parse_qs(urlparse(url).query).get('q', [''])[0]
                return f'Recherche: "{q}"' if q else 'Recherche Google'
            except:
                return 'Recherche Google'
        parsed = urlparse(url)
        dom = parsed.netloc.replace('www.', '')
        path = parsed.path.rstrip('/')
        if path and path != '/' and len(path) < 30:
            return f"{dom}{path}"
        return dom if dom else url[:30] + '...'
    except:
        return str(url)[:30] + "..."


def generer_symbole_svg(has_clic, has_copy, has_keyb, is_closed=False):
    colors = []
    if has_clic: colors.append("#6366f1")
    if has_copy: colors.append("#059669")
    if has_keyb: colors.append("#d97706")
    if not colors: colors = ["#64748b"]

    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    if len(colors) == 1:
        svg += f'<circle cx="50" cy="50" r="46" fill="{colors[0]}" />'
    elif len(colors) == 2:
        svg += f'<circle cx="50" cy="50" r="46" fill="{colors[0]}" />'
        svg += f'<path d="M 50 4 A 46 46 0 0 1 50 96 Z" fill="{colors[1]}" />'
    else:
        svg += f'<circle cx="50" cy="50" r="46" fill="{colors[0]}" />'
        svg += f'<path d="M 50 50 L 50 4 A 46 46 0 0 1 89.8 73 Z" fill="{colors[1]}" />'
        svg += f'<path d="M 50 50 L 89.8 73 A 46 46 0 0 1 10.2 73 Z" fill="{colors[2]}" />'

    bcol = "#dc2626" if is_closed else "#ffffff"
    sw = "6" if is_closed else "3"
    svg += f'<circle cx="50" cy="50" r="46" fill="none" stroke="{bcol}" stroke-width="{sw}"/>'
    svg += '</svg>'
    return "image://data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def ts_to_heure(timestamp):
    try:
        return datetime.fromisoformat(timestamp.replace('Z', '+00:00')).strftime('%H:%M:%S')
    except:
        return "—"


# =========================================================
# GENERATION DU DASHBOARD
# =========================================================

def generer_dashboard(fichier_entree, fichier_sortie):
    with open(fichier_entree, 'r', encoding='utf-8') as f:
        logs = json.load(f)

    # ====================================================
    # ETAPE 1 : Agregation par visitId
    # ====================================================
        # ====================================================
    # ETAPE 1 : Agregation par visitId + detection retour algorithmique
    # ====================================================
    visites = []
    visit_by_id = {}
    dernier_chrono = None
    tab_nav_history = {}   # tabId → [liste ordonnee des visites de cet onglet]

    for log in logs:
        t = log.get('type')
        url = log.get('url', '')
        vid = log.get('visitId')

        if t == 'navigation':
            tab_id = log.get('tabId')

            # --- Detection retour arriere algorithmique ---
            is_back = log.get('transitionType') == 'back_forward'   # si le navigateur l'a capte
            if not is_back and tab_id and tab_id in tab_nav_history:
                hist = tab_nav_history[tab_id]
                # hist[-1] = page actuelle (B), hist[-2] = page d'avant (A)
                # si on navigue vers A → c'est un retour
                if len(hist) >= 2 and hist[-2]['url'] == url:
                    is_back = True

            v = {
                'id': len(visites), 'url': url, 'visitId': vid,
                'parentUrl': log.get('parentUrl', ''),
                'tabId': tab_id,
                'is_back': is_back,
                'timestamp': log.get('timestamp'),
                'clics': 0, 'maxScroll': 0, 'temps_ms': 0,
                'copies': [], 'saisies': [], 'tab_closed': False,
                'parent_chrono': dernier_chrono['id'] if dernier_chrono else None,
                'nom': extraire_nom_court(url)
            }
            visites.append(v)
            if vid:
                visit_by_id[vid] = v
            dernier_chrono = v

            # Ajouter a l'historique de l'onglet
            if tab_id:
                if tab_id not in tab_nav_history:
                    tab_nav_history[tab_id] = []
                tab_nav_history[tab_id].append(v)

        elif t == 'tab_closed':
            tid = log.get('tabId')
            for v in reversed(visites):
                if v.get('tabId') == tid:
                    v['tab_closed'] = True
                    break

        elif vid and vid in visit_by_id:
            vi = visit_by_id[vid]
            if t == 'clic':
                vi['clics'] += 1
            elif t == 'page_quittee':
                vi['maxScroll'] = max(vi['maxScroll'], log.get('maxScroll', 0))
                vi['temps_ms'] = max(vi['temps_ms'], log.get('temps_passe_ms', 0))
            elif t == 'copie':
                vi['copies'].append(log.get('texte', ''))
            elif t == 'saisie_clavier':
                vi['saisies'].append(log.get('texte', ''))

    # ====================================================
    # ETAPE 2 : Construction de l'arbre
    # ====================================================
    nodes, links = [], []
    EX, EY = 180, 140
    branch_of, max_y, xi = {}, 0, 0

    for v in visites:
        nid = f"n{v['id']}"
        src, curv = None, 0

        if v['parentUrl'] and v['parentUrl'] not in (
                "Démarrage de l'expérience", "Ouverture directe / Nouvel onglet"):
            for pv in reversed(visites[:v['id']]):
                if pv['url'] == v['parentUrl']:
                    src = f"n{pv['id']}"
                    curv = 0 if (v.get('tabId') and pv.get('tabId')
                                 and v['tabId'] == pv['tabId']) else 0.3
                    break

        if not src and v['parent_chrono'] is not None:
            src = f"n{v['parent_chrono']}"

        if src and src in branch_of:
            if curv > 0:
                max_y += EY
                my_y = max_y
            else:
                my_y = branch_of[src]
        else:
            my_y = 0
        branch_of[nid] = my_y

        heure = ts_to_heure(v['timestamp'])
        ts = round(v['temps_ms'] / 1000, 1)
        url_esc = v['url'].replace("&", "&amp;").replace('"', "&quot;").replace("'", "&#39;")
        url_short = v['url'] if len(v['url']) < 60 else v['url'][:57] + "..."

        name = v['nom']
        if v['tab_closed']:
            name += "  [ferme]"

        # Tooltip
        tip = (f"<div style='max-width:340px;white-space:normal;padding:8px 10px;"
               f"font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.6;'>"
               f"<div style='font-weight:600;color:#e2e8f0;word-break:break-all;'>{url_short}</div>"
               f"<div style='border-top:1px solid #334155;margin:8px 0;'></div>")
        if v['is_back']:
            tip += "<div style='color:#f97316;font-weight:600;margin-bottom:4px;'>Retour arriere (navigation precedente)</div>"
        if v['tab_closed']:
            tip += "<div style='color:#f87171;font-weight:600;margin-bottom:4px;'>Onglet ferme apres cette page</div>"
        tip += (f"<table style='width:100%;font-size:12px;color:#cbd5e1;'>"
                f"<tr><td style='padding:2px 0;'>Heure</td><td style='text-align:right;font-weight:600;'>{heure}</td></tr>"
                f"<tr><td>Temps passe</td><td style='text-align:right;font-weight:600;'>{ts} s</td></tr>"
                f"<tr><td>Profondeur scroll</td><td style='text-align:right;font-weight:600;'>{v['maxScroll']}%</td></tr>"
                f"<tr><td>Clics</td><td style='text-align:right;font-weight:600;'>{v['clics']}</td></tr>"
                f"</table>")
        if v['copies']:
            tip += "<div style='margin-top:6px;font-weight:600;color:#6ee7b7;'>Texte copie :</div>"
            for c in v['copies'][:3]:
                tip += f"<div style='font-size:11px;color:#94a3b8;padding-left:8px;'>- \"{c[:50]}\"</div>"
        if v['saisies']:
            tip += "<div style='margin-top:6px;font-weight:600;color:#fbbf24;'>Saisie clavier :</div>"
            for s in v['saisies'][:3]:
                tip += f"<div style='font-size:11px;color:#94a3b8;padding-left:8px;'>- \"{s[:50]}\"</div>"
        tip += (f"<div style='margin-top:10px;'>"
                f"<a href='{url_esc}' target='_blank' style='display:inline-block;background:#3b82f6;"
                f"color:#fff;padding:4px 12px;border-radius:4px;text-decoration:none;font-size:12px;"
                f"font-weight:500;'>Ouvrir le lien</a></div></div>")

        has_act = v['clics'] > 0 or v['copies'] or v['saisies']

        nodes.append({
            "id": nid, "name": name,
            "x": xi * EX, "y": my_y,
            "symbol": generer_symbole_svg(
                v['clics'] > 0, bool(v['copies']), bool(v['saisies']),
                is_closed=v['tab_closed']
            ),
            "symbolSize": 30 if v['tab_closed'] else (26 if has_act else 18),
            "label": {"show": True, "position": "bottom", "rotate": 30,
                      "align": "left", "verticalAlign": "top",
                      "distance": 8, "fontSize": 11, "color": "#475569",
                      "fontFamily": "Inter, system-ui, sans-serif"},
            "tooltipDetails": tip
        })

        if src:
            is_back = v.get('is_back', False)
            link_obj = {
                "source": src, "target": nid,
                "lineStyle": {
                    "curveness": curv,
                    "color": "#e87623" if is_back else "#94a3b8",
                    "width": 2.5 if is_back else 1.5,
                    "type": "dashed" if is_back else "solid"
                }
            }
            if is_back:
                link_obj["label"] = {
                    "show": True,
                    "formatter": "\u21A9",
                    "fontSize": 18,
                    "color": "#e87623",
                    "fontWeight": "bold",
                    "backgroundColor": "rgba(255,247,237,0.9)",
                    "borderColor": "#e87623",
                    "borderWidth": 1,
                    "borderRadius": 4,
                    "padding": [2, 5]
                }
            links.append(link_obj)
        xi += 1

    # ====================================================
    # ETAPE 3 : Donnees metriques
    # ====================================================
    vr = [v for v in visites if not v['url'].startswith('chrome://')]

    labels = [f"#{v['id']+1}  {v['nom']}" for v in vr]
    urls_list = [v['url'] for v in vr]
    temps_data = [round(v['temps_ms'] / 1000, 1) for v in vr]

    scroll_items = []
    for v in vr:
        s = v['maxScroll']
        col = '#059669' if s >= 75 else ('#d97706' if s >= 40 else '#dc2626')
        scroll_items.append({"value": s, "itemStyle": {"color": col}})

    clics_data = [v['clics'] for v in vr]
    copies_data = [len(v['copies']) for v in vr]
    saisies_data = [len(v['saisies']) for v in vr]

    tot = {
        'clics': sum(v['clics'] for v in visites),
        'copies': sum(len(v['copies']) for v in visites),
        'saisies': sum(len(v['saisies']) for v in visites),
        'temps': sum(v['temps_ms'] for v in visites),
        'back': sum(1 for v in visites if v['is_back']),
        'closed': sum(1 for v in visites if v['tab_closed']),
        'tabs': len(set(v['tabId'] for v in visites if v['tabId'])),
        'pages': len(vr)
    }

    pie = []
    if tot['clics']:   pie.append({"name": "Clics",   "value": tot['clics']})
    if tot['copies']:  pie.append({"name": "Copies",  "value": tot['copies']})
    if tot['saisies']: pie.append({"name": "Saisies", "value": tot['saisies']})
    if not pie:        pie.append({"name": "Aucune interaction",  "value": 1})

    doms = {}
    for v in vr:
        try:
            d = urlparse(v['url']).netloc.replace('www.', '')
        except:
            d = '?'
        doms[d] = doms.get(d, 0) + 1
    doms_sorted = sorted(doms.items(), key=lambda x: x[1], reverse=True)[:10]
    doms_labels = [d[0] for d in doms_sorted]
    doms_values = [d[1] for d in doms_sorted]

    try:
        t0 = datetime.fromisoformat(visites[0]['timestamp'].replace('Z', '+00:00'))
        t1 = datetime.fromisoformat(visites[-1]['timestamp'].replace('Z', '+00:00'))
        duree_s = (t1 - t0).total_seconds()
        duree_str = f"{int(duree_s // 60)} min {int(duree_s % 60)} s"
    except:
        duree_str = "—"

    ch = max(280, len(vr) * 40 + 80)

    # ====================================================
    # ETAPE 4 : Tableau
    # ====================================================
    rows_html = ""
    for v in visites:
        h = ts_to_heure(v['timestamp'])
        url_esc = v['url'].replace("&", "&amp;").replace('"', "&quot;").replace("'", "&#39;")
        tags = ""
        if v['is_back']:     tags += '<span class="tag tag-orange">Retour</span>'
        if v['tab_closed']:  tags += '<span class="tag tag-red">Ferme</span>'
        if v['clics']:       tags += f'<span class="tag tag-indigo">{v["clics"]} clic(s)</span>'
        if v['copies']:      tags += f'<span class="tag tag-green">{len(v["copies"])} copie(s)</span>'
        if v['saisies']:     tags += f'<span class="tag tag-amber">{len(v["saisies"])} saisie(s)</span>'

        cp = "; ".join(f'"{t[:30]}"' for t in v['copies']) or "—"
        sa = "; ".join(f'"{t[:30]}"' for t in v['saisies']) or "—"

        rows_html += f"""<tr>
            <td class="cell-mono">{v['visitId'] or '—'}</td>
            <td><a href="{url_esc}" target="_blank" class="cell-link" title="{url_esc}">{v['nom']}</a></td>
            <td class="cell-mono">{h}</td>
            <td class="cell-right">{round(v['temps_ms']/1000,1)} s</td>
            <td class="cell-right">{v['maxScroll']}%</td>
            <td class="cell-right">{v['clics']}</td>
            <td class="cell-dim">{cp}</td>
            <td class="cell-dim">{sa}</td>
            <td>{tags}</td>
        </tr>"""

    # ====================================================
    # ETAPE 5 : Serialisation
    # ====================================================
    j = lambda x: json.dumps(x, ensure_ascii=False)

    # ====================================================
    # ETAPE 6 : HTML
    # ====================================================
    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Analyse de session — Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

*, *::before, *::after {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:'Inter',system-ui,-apple-system,sans-serif; background:#f8fafc; color:#1e293b; font-size:14px; }}

/* ---- Header ---- */
.header {{
    background:#1e293b; color:#f1f5f9; padding:18px 28px;
    display:flex; align-items:center; justify-content:space-between;
    border-bottom:3px solid #3b82f6;
}}
.header h1 {{ font-size:18px; font-weight:700; letter-spacing:-0.3px; }}
.header-meta {{ font-size:12px; color:#94a3b8; display:flex; gap:18px; margin-top:4px; }}
.header-meta span {{ display:inline-flex; align-items:center; gap:4px; }}

/* ---- Tabs ---- */
.tabs {{ display:flex; background:#fff; border-bottom:1px solid #e2e8f0; padding:0 20px; }}
.tab-btn {{
    padding:12px 20px; border:none; background:none; font-size:13px; font-weight:500;
    color:#64748b; cursor:pointer; border-bottom:2px solid transparent;
    transition:color .2s, border-color .2s; font-family:inherit;
}}
.tab-btn:hover {{ color:#1e293b; }}
.tab-btn.active {{ color:#3b82f6; border-bottom-color:#3b82f6; }}

.tab-content {{ display:none; padding:24px; }}
.tab-content.active {{ display:block; }}

/* ---- Stat cards ---- */
.stats-row {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:24px; }}
.stat {{
    background:#fff; border:1px solid #e2e8f0; border-radius:8px;
    padding:16px 18px; display:flex; flex-direction:column; gap:2px;
}}
.stat-value {{ font-size:24px; font-weight:700; }}
.stat-label {{ font-size:11px; font-weight:500; color:#64748b; text-transform:uppercase; letter-spacing:.6px; }}
.c-blue {{ color:#3b82f6; }}
.c-indigo {{ color:#6366f1; }}
.c-green {{ color:#059669; }}
.c-amber {{ color:#d97706; }}
.c-red {{ color:#dc2626; }}
.c-slate {{ color:#475569; }}

/* ---- Charts ---- */
.grid-2 {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }}
.panel {{
    background:#fff; border:1px solid #e2e8f0; border-radius:8px;
    padding:16px; display:flex; flex-direction:column;
}}
.panel-title {{
    font-size:13px; font-weight:600; color:#334155; margin-bottom:10px;
    padding-bottom:8px; border-bottom:1px solid #f1f5f9;
}}
.panel-hint {{ font-size:11px; color:#94a3b8; margin-bottom:16px; }}

/* ---- Legend (arbre) ---- */
.legend-bar {{
    background:#fff; border:1px solid #e2e8f0; border-radius:8px;
    padding:12px 18px; margin-bottom:16px; display:flex; flex-wrap:wrap;
    gap:16px; align-items:center; font-size:12px; color:#475569;
}}
.legend-bar .group-title {{ font-weight:600; color:#1e293b; margin-right:4px; }}
.legend-item {{ display:inline-flex; align-items:center; gap:5px; }}
.legend-dot {{
    display:inline-block; width:10px; height:10px; border-radius:50%; flex-shrink:0;
}}
.legend-line {{
    display:inline-block; width:24px; height:0; border-top:2px dashed #e87623; flex-shrink:0;
}}
.legend-line-solid {{
    display:inline-block; width:24px; height:0; border-top:2px solid #94a3b8; flex-shrink:0;
}}
.legend-sep {{ width:1px; height:20px; background:#e2e8f0; }}

/* ---- Table ---- */
.table-wrap {{
    background:#fff; border:1px solid #e2e8f0; border-radius:8px; overflow-x:auto;
}}
table {{ width:100%; border-collapse:collapse; font-size:12px; }}
thead th {{
    background:#f8fafc; padding:10px 12px; text-align:left; font-weight:600;
    color:#475569; border-bottom:2px solid #e2e8f0; position:sticky; top:0; font-size:11px;
    text-transform:uppercase; letter-spacing:.4px;
}}
tbody td {{ padding:8px 12px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }}
tbody tr:hover td {{ background:#f8fafc; }}
.cell-mono {{ font-family:'SF Mono',Consolas,monospace; font-size:11px; color:#64748b; }}
.cell-right {{ text-align:right; font-variant-numeric:tabular-nums; }}
.cell-link {{
    color:#3b82f6; text-decoration:none; font-weight:500;
    max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:inline-block;
}}
.cell-link:hover {{ text-decoration:underline; }}
.cell-dim {{ max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; color:#94a3b8; }}

.tag {{
    display:inline-block; padding:2px 7px; border-radius:4px; font-size:10px;
    font-weight:600; margin:1px 2px; text-transform:uppercase; letter-spacing:.3px;
}}
.tag-indigo {{ background:#eef2ff; color:#4f46e5; }}
.tag-green {{ background:#ecfdf5; color:#047857; }}
.tag-amber {{ background:#fffbeb; color:#b45309; }}
.tag-orange {{ background:#fff7ed; color:#c2410c; }}
.tag-red {{ background:#fef2f2; color:#b91c1c; }}

#chart-arbre {{ width:100%; height:calc(100vh - 210px); min-height:400px; }}

@media(max-width:900px) {{
    .grid-2 {{ grid-template-columns:1fr; }}
    .stats-row {{ grid-template-columns:repeat(2,1fr); }}
}}
</style>
</head>
<body>

<div class="header">
    <div>
        <h1>Analyse de session de navigation</h1>
        <div class="header-meta">
            <span>Source : {fichier_entree}</span>
            <span>{len(visites)} visites</span>
            <span>{tot['pages']} pages</span>
            <span>Duree : {duree_str}</span>
        </div>
    </div>
</div>

<div class="tabs">
    <button class="tab-btn active" onclick="showTab('arbre',this)">Arbre de navigation</button>
    <button class="tab-btn" onclick="showTab('metriques',this)">Metriques</button>
    <button class="tab-btn" onclick="showTab('donnees',this)">Donnees detaillees</button>
</div>

<!-- ======================== TAB 1 : ARBRE ======================== -->
<div id="tab-arbre" class="tab-content active">
    <div class="legend-bar">
        <span class="group-title">Noeuds</span>
        <span class="legend-item"><span class="legend-dot" style="background:#64748b"></span> Aucune action</span>
        <span class="legend-item"><span class="legend-dot" style="background:#6366f1"></span> Clics</span>
        <span class="legend-item"><span class="legend-dot" style="background:#d97706"></span> Saisie clavier</span>
        <span class="legend-item"><span class="legend-dot" style="background:#059669"></span> Texte copie</span>
        <span class="legend-item"><span class="legend-dot" style="background:#fff;border:2px solid #dc2626"></span> Onglet ferme</span>
        <span class="legend-sep"></span>
        <span class="group-title">Aretes</span>
        <span class="legend-item"><span class="legend-line-solid"></span> Navigation</span>
        <span class="legend-item"><span class="legend-line"></span> Retour arriere</span>
        <span class="legend-sep"></span>
        <span style="color:#94a3b8;font-style:italic;">Molette = zoom, glisser = deplacer</span>
    </div>
    <div id="chart-arbre"></div>
</div>

<!-- ======================== TAB 2 : METRIQUES ======================== -->
<div id="tab-metriques" class="tab-content">
    <div class="stats-row">
        <div class="stat"><div class="stat-value c-blue">{tot['pages']}</div><div class="stat-label">Pages visitees</div></div>
        <div class="stat"><div class="stat-value c-slate">{round(tot['temps']/1000)} s</div><div class="stat-label">Temps cumule</div></div>
        <div class="stat"><div class="stat-value c-blue">{tot['tabs']}</div><div class="stat-label">Onglets utilises</div></div>
        <div class="stat"><div class="stat-value c-indigo">{tot['clics']}</div><div class="stat-label">Clics totaux</div></div>
        <div class="stat"><div class="stat-value c-green">{tot['copies']}</div><div class="stat-label">Textes copies</div></div>
        <div class="stat"><div class="stat-value c-amber">{tot['saisies']}</div><div class="stat-label">Saisies clavier</div></div>
        <div class="stat"><div class="stat-value c-red">{tot['back']}</div><div class="stat-label">Retours arriere</div></div>
        <div class="stat"><div class="stat-value c-red">{tot['closed']}</div><div class="stat-label">Onglets fermes</div></div>
    </div>

    <div class="panel-hint">Les noms de pages sur l'axe vertical sont cliquables et ouvrent le lien dans un nouvel onglet.</div>

    <div class="grid-2">
        <div class="panel">
            <div class="panel-title">Temps passe par page (secondes)</div>
            <div id="chart-temps" style="width:100%;height:{ch}px;"></div>
        </div>
        <div class="panel">
            <div class="panel-title">Profondeur de scroll (%) &mdash; vert &ge;75, orange &ge;40, rouge &lt;40</div>
            <div id="chart-scroll" style="width:100%;height:{ch}px;"></div>
        </div>
    </div>
    <div class="grid-2">
        <div class="panel">
            <div class="panel-title">Interactions par page</div>
            <div id="chart-interactions" style="width:100%;height:{ch}px;"></div>
        </div>
        <div class="panel">
            <div class="panel-title">Repartition globale des actions</div>
            <div id="chart-pie" style="width:100%;height:{ch}px;"></div>
        </div>
    </div>
    <div class="panel">
        <div class="panel-title">Domaines les plus visites</div>
        <div id="chart-domaines" style="width:100%;height:260px;"></div>
    </div>
</div>

<!-- ======================== TAB 3 : DONNEES ======================== -->
<div id="tab-donnees" class="tab-content">
    <div class="table-wrap">
        <table>
            <thead><tr>
                <th>Visit ID</th><th>Page</th><th>Heure</th><th>Temps</th>
                <th>Scroll</th><th>Clics</th><th>Copies</th><th>Saisies</th><th>Indicateurs</th>
            </tr></thead>
            <tbody>{rows_html}</tbody>
        </table>
    </div>
</div>

<!-- ======================== JAVASCRIPT ======================== -->
<script>
var LABELS = {j(labels)};
var URLS   = {j(urls_list)};

function showTab(name, btn) {{
    document.querySelectorAll('.tab-content').forEach(function(el) {{ el.classList.remove('active'); }});
    document.querySelectorAll('.tab-btn').forEach(function(el) {{ el.classList.remove('active'); }});
    document.getElementById('tab-' + name).classList.add('active');
    if (btn) btn.classList.add('active');
    setTimeout(function() {{ for (var k in C) {{ if (C[k]) C[k].resize(); }} }}, 120);
}}

function bindClickOpen(chart) {{
    chart.on('click', function(p) {{
        var idx = -1;
        if (p.componentType === 'series' && p.dataIndex !== undefined) idx = p.dataIndex;
        else if (p.componentType === 'yAxis') idx = LABELS.indexOf(p.value);
        if (idx >= 0 && idx < URLS.length && URLS[idx]) window.open(URLS[idx], '_blank');
    }});
}}

var yAxisDef = {{
    type:'category', data:LABELS, inverse:true,
    axisLabel:{{ fontSize:11, width:150, overflow:'truncate', color:'#3b82f6', triggerEvent:true,
                 fontFamily:'Inter,system-ui,sans-serif' }}
}};

var gridDef = {{ left:'38%', right:'12%', top:'3%', bottom:'8%', containLabel:false }};

var tooltipDef = {{ trigger:'axis', axisPointer:{{type:'shadow'}},
    textStyle:{{fontFamily:'Inter,system-ui,sans-serif',fontSize:12}} }};

var C = {{}};

/* 1. Arbre */
C.arbre = echarts.init(document.getElementById('chart-arbre'));
C.arbre.setOption({{
    tooltip:{{ trigger:'item', enterable:true, confine:true,
        backgroundColor:'rgba(15,23,42,0.96)', borderColor:'#334155',
        textStyle:{{color:'#f1f5f9',fontFamily:'Inter,system-ui,sans-serif',fontSize:12}},
        formatter:function(i){{ return i.data.tooltipDetails||i.name; }}
    }},
    toolbox:{{ feature:{{ saveAsImage:{{title:'Exporter en PNG',pixelRatio:2}} }} }},
    series:[{{ type:'graph', layout:'none',
        data:{j(nodes)}, links:{j(links)},
        roam:true, edgeSymbol:['none','arrow'], edgeSymbolSize:[0,8]
    }}]
}});

/* 2. Temps */
C.temps = echarts.init(document.getElementById('chart-temps'));
C.temps.setOption({{
    tooltip:tooltipDef, grid:gridDef,
    xAxis:{{ type:'value', name:'sec', axisLabel:{{fontSize:11}}, splitLine:{{lineStyle:{{type:'dashed',color:'#f1f5f9'}}}} }},
    yAxis:yAxisDef,
    series:[{{ type:'bar', data:{j(temps_data)}, barMaxWidth:16,
               itemStyle:{{color:'#3b82f6',borderRadius:[0,3,3,0]}},
               label:{{show:true,position:'right',fontSize:10,color:'#64748b',formatter:'{{c}} s'}} }}]
}});
bindClickOpen(C.temps);

/* 3. Scroll */
C.scroll = echarts.init(document.getElementById('chart-scroll'));
C.scroll.setOption({{
    tooltip:tooltipDef, grid:gridDef,
    xAxis:{{ type:'value', max:100, name:'%', axisLabel:{{fontSize:11}}, splitLine:{{lineStyle:{{type:'dashed',color:'#f1f5f9'}}}} }},
    yAxis:yAxisDef,
    series:[{{ type:'bar', data:{j(scroll_items)}, barMaxWidth:16,
               itemStyle:{{borderRadius:[0,3,3,0]}},
               label:{{show:true,position:'right',fontSize:10,color:'#64748b',formatter:'{{c}}%'}} }}]
}});
bindClickOpen(C.scroll);

/* 4. Interactions */
C.interactions = echarts.init(document.getElementById('chart-interactions'));
C.interactions.setOption({{
    tooltip:tooltipDef,
    legend:{{ data:['Clics','Copies','Saisies'], top:0, textStyle:{{fontSize:11,fontFamily:'Inter,system-ui,sans-serif'}} }},
    grid:{{ left:'38%', right:'8%', top:'10%', bottom:'8%' }},
    xAxis:{{ type:'value', axisLabel:{{fontSize:11}}, splitLine:{{lineStyle:{{type:'dashed',color:'#f1f5f9'}}}} }},
    yAxis:yAxisDef,
    series:[
        {{ name:'Clics',   type:'bar', stack:'t', barMaxWidth:16, data:{j(clics_data)},   itemStyle:{{color:'#6366f1'}} }},
        {{ name:'Copies',  type:'bar', stack:'t', barMaxWidth:16, data:{j(copies_data)},  itemStyle:{{color:'#059669'}} }},
        {{ name:'Saisies', type:'bar', stack:'t', barMaxWidth:16, data:{j(saisies_data)}, itemStyle:{{color:'#d97706'}} }}
    ]
}});
bindClickOpen(C.interactions);

/* 5. Pie */
C.pie = echarts.init(document.getElementById('chart-pie'));
C.pie.setOption({{
    tooltip:{{ trigger:'item', formatter:'{{b}} : {{c}} ({{d}}%)',
              textStyle:{{fontFamily:'Inter,system-ui,sans-serif',fontSize:12}} }},
    series:[{{ type:'pie', radius:['42%','72%'],
        data:{j(pie)},
        itemStyle:{{ borderRadius:5, borderColor:'#fff', borderWidth:2 }},
        color:['#6366f1','#059669','#d97706','#cbd5e1'],
        label:{{ fontSize:12, fontFamily:'Inter,system-ui,sans-serif' }},
        emphasis:{{ itemStyle:{{ shadowBlur:8, shadowColor:'rgba(0,0,0,0.15)' }} }}
    }}]
}});

/* 6. Domaines */
C.domaines = echarts.init(document.getElementById('chart-domaines'));
C.domaines.setOption({{
    tooltip:{{ trigger:'axis', textStyle:{{fontFamily:'Inter,system-ui,sans-serif',fontSize:12}} }},
    grid:{{ left:'30%', right:'10%', top:'5%', bottom:'8%' }},
    xAxis:{{ type:'value', minInterval:1, axisLabel:{{fontSize:11}}, splitLine:{{lineStyle:{{type:'dashed',color:'#f1f5f9'}}}} }},
    yAxis:{{ type:'category', data:{j(doms_labels)}, inverse:true, axisLabel:{{fontSize:12}} }},
    series:[{{ type:'bar', data:{j(doms_values)}, barMaxWidth:16,
               itemStyle:{{color:'#475569',borderRadius:[0,3,3,0]}},
               label:{{show:true,position:'right',fontSize:11,color:'#475569'}} }}]
}});

window.addEventListener('resize', function() {{ for(var k in C){{ if(C[k]) C[k].resize(); }} }});
</script>
</body>
</html>"""

    with open(fichier_sortie, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Dashboard genere : {fichier_sortie}")
    print(f"  {len(visites)} visites | {tot['pages']} pages | "
          f"{tot['clics']} clics | {tot['copies']} copies | {tot['saisies']} saisies | "
          f"{tot['back']} retours | {tot['closed']} fermes")


# =========================================================
if __name__ == "__main__":
    generer_dashboard(
        "Data_of_studies/etude26.json",
        "Visualisation/dashboard26.html"
    )
