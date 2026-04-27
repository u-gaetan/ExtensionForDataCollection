import json
import base64
import sys
import csv
import io
from datetime import datetime
from urllib.parse import urlparse, parse_qs


# ═══════════════════════════════════════════════════════════
# UTILITAIRES
# ═══════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════
# GESTION DES PERIODES DE QUESTIONS
# ═══════════════════════════════════════════════════════════

ANSWER_TYPES = {'demographics', 'research_answer', 'self_assessment', 'memory_answer'}

COLOR_PALETTE = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#06b6d4', '#ef4444', '#84cc16',
    '#a855f7', '#14b8a6', '#f43f5e', '#eab308'
]


def create_question_periods(reponses):
    if not reponses:
        return []
    answers = sorted(
        [r for r in reponses if r.get('type') in ANSWER_TYPES],
        key=lambda r: r.get('timestamp', '')
    )
    if not answers:
        return []
    periods = []
    for i, a in enumerate(answers):
        qid = a.get('questionId', '')
        atype = a.get('type', '')
        if qid:
            label = str(qid) if str(qid).startswith('Q') else f'Q{i+1}'
        elif atype == 'demographics':
            label = f'Demo{i+1}'
        elif atype == 'self_assessment':
            label = f'Eval{i+1}'
        elif atype == 'memory_answer':
            label = f'Mem{i+1}'
        else:
            label = f'R{i+1}'
        periods.append({
            'label': label,
            'type': atype,
            'questionId': qid,
            'start': answers[i - 1]['timestamp'] if i > 0 else None,
            'end': a['timestamp'],
            'data': a.get('data', {})
        })
    return periods


def get_question_label(timestamp, periods):
    if not periods or not timestamp:
        return ''
    for p in periods:
        in_start = (p['start'] is None or timestamp >= p['start'])
        in_end = (timestamp <= p['end'])
        if in_start and in_end:
            return p['label']
    if timestamp > periods[-1]['end']:
        return 'Post-Q'
    return ''


# ═══════════════════════════════════════════════════════════
# GENERATION PRINCIPALE
# ═══════════════════════════════════════════════════════════

def generer_dashboard(fichier_entree, fichier_sortie):
    with open(fichier_entree, 'r', encoding='utf-8') as f:
        raw = json.load(f)

    # --- Support des 2 formats ---
    if isinstance(raw, list):
        logs, reponses = raw, []
    elif isinstance(raw, dict):
        logs, reponses = raw.get('events', []), raw.get('reponses', [])
    else:
        raise ValueError("Format de fichier non supporté")

    question_periods = create_question_periods(reponses)
    has_questions = len(question_periods) > 0

    q_colors = {}
    for i, p in enumerate(question_periods):
        q_colors[p['label']] = COLOR_PALETTE[i % len(COLOR_PALETTE)]

    # ────────────────────────────────────────────────
    # ETAPE 1 : Visites + interactions + questions
    # ────────────────────────────────────────────────
    visites = []
    visit_by_id = {}
    dernier_chrono = None
    tab_stack = {}
    tab_pointer = {}

    for log in logs:
        t = log.get('type')
        url = log.get('url', '')
        vid = log.get('visitId')

        if t == 'navigation':
            tab_id = log.get('tabId')
            is_back = False
            is_forward = False
            if tab_id is not None:
                if tab_id not in tab_stack:
                    tab_stack[tab_id] = []
                    tab_pointer[tab_id] = -1
                stack = tab_stack[tab_id]
                ptr = tab_pointer[tab_id]
                if ptr >= 1 and stack[ptr - 1] == url:
                    is_back = True
                    tab_pointer[tab_id] = ptr - 1
                elif ptr < len(stack) - 1 and stack[ptr + 1] == url:
                    is_forward = True
                    tab_pointer[tab_id] = ptr + 1
                else:
                    tab_stack[tab_id] = stack[:ptr + 1] + [url]
                    tab_pointer[tab_id] = ptr + 1
            if log.get('transitionType') == 'back_forward':
                if not is_back and not is_forward:
                    is_back = True

            ts = log.get('timestamp', '')
            qlabel = get_question_label(ts, question_periods)

            v = {
                'id': len(visites), 'url': url, 'visitId': vid,
                'parentUrl': log.get('parentUrl', ''),
                'tabId': tab_id,
                'is_back': is_back, 'is_forward': is_forward,
                'timestamp': ts,
                'clics': 0, 'maxScroll': 0, 'temps_ms': 0,
                'copies': [], 'saisies': [], 'tab_closed': False,
                'parent_chrono': dernier_chrono['id'] if dernier_chrono else None,
                'nom': extraire_nom_court(url),
                'question': qlabel
            }
            visites.append(v)
            if vid:
                visit_by_id[vid] = v
            dernier_chrono = v

        elif t == 'tab_closed':
            tid = log.get('tabId')
            for vv in reversed(visites):
                if vv.get('tabId') == tid:
                    vv['tab_closed'] = True
                    break
            tab_stack.pop(tid, None)
            tab_pointer.pop(tid, None)

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

    if not visites:
        print("Aucune visite trouvée.")
        return

    # ────────────────────────────────────────────────
    # ETAPE 2 : Arbre (noeuds + liens)
    # ────────────────────────────────────────────────
    nodes, links = [], []
    EX, EY = 180, 140
    branch_of = {}
    max_y = 0
    xi = 0

    for v in visites:
        nid = f"n{v['id']}"
        src, curv = None, 0
        if v['parentUrl'] and v['parentUrl'] not in (
                "Demarrage de l'experience", "Ouverture directe / Nouvel onglet"):
            for pv in reversed(visites[:v['id']]):
                if pv['url'] == v['parentUrl']:
                    src = f"n{pv['id']}"
                    curv = 0 if (v.get('tabId') and pv.get('tabId') and v['tabId'] == pv['tabId']) else 0.3
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
        ts_s = round(v['temps_ms'] / 1000, 1)
        url_esc = v['url'].replace("&", "&amp;").replace('"', "&quot;").replace("'", "&#39;")
        url_short = v['url'] if len(v['url']) < 60 else v['url'][:57] + "..."

        name = v['nom']
        if v['question']:
            name = f"[{v['question']}] {name}"
        if v['tab_closed']:
            name += "  [fermé]"

        tip = (f"<div style='max-width:340px;white-space:normal;padding:8px 10px;"
               f"font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.6;'>"
               f"<div style='font-weight:600;color:#e2e8f0;word-break:break-all;'>{url_short}</div>")
        if v['question']:
            qc = q_colors.get(v['question'], '#94a3b8')
            tip += (f"<div style='display:inline-block;background:{qc};color:#fff;padding:2px 8px;"
                    f"border-radius:4px;font-size:11px;font-weight:600;margin:4px 0;'>{v['question']}</div>")
        tip += f"<div style='border-top:1px solid #334155;margin:8px 0;'></div>"
        if v['is_back']:
            tip += "<div style='color:#f97316;font-weight:600;margin-bottom:4px;'>Retour arriere (back)</div>"
        if v['is_forward']:
            tip += "<div style='color:#3b82f6;font-weight:600;margin-bottom:4px;'>Navigation avant (forward)</div>"
        if v['tab_closed']:
            tip += "<div style='color:#f87171;font-weight:600;margin-bottom:4px;'>Onglet ferme</div>"
        tip += (f"<table style='width:100%;font-size:12px;color:#cbd5e1;'>"
                f"<tr><td style='padding:2px 0;'>Heure</td><td style='text-align:right;font-weight:600;'>{heure}</td></tr>"
                f"<tr><td>Temps passe</td><td style='text-align:right;font-weight:600;'>{ts_s} s</td></tr>"
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
            "symbol": generer_symbole_svg(v['clics'] > 0, bool(v['copies']), bool(v['saisies']), v['tab_closed']),
            "symbolSize": 30 if v['tab_closed'] else (26 if has_act else 18),
            "label": {"show": True, "position": "bottom", "rotate": 30,
                      "align": "left", "verticalAlign": "top",
                      "distance": 8, "fontSize": 11, "color": "#475569",
                      "fontFamily": "Inter, system-ui, sans-serif"},
            "tooltipDetails": tip
        })

        if src:
            if v['is_back']:
                ec, et, ew = "#e87623", "dashed", 2.5
                el = {"show": True, "formatter": "\u21A9 BACK", "fontSize": 10, "fontWeight": "bold",
                      "color": "#fff", "backgroundColor": "#e87623", "borderRadius": 3,
                      "padding": [2, 6], "fontFamily": "Inter, system-ui, sans-serif"}
            elif v['is_forward']:
                ec, et, ew = "#2563eb", "dashed", 2.5
                el = {"show": True, "formatter": "\u21AA FWD", "fontSize": 10, "fontWeight": "bold",
                      "color": "#fff", "backgroundColor": "#2563eb", "borderRadius": 3,
                      "padding": [2, 6], "fontFamily": "Inter, system-ui, sans-serif"}
            else:
                ec, et, ew = "#94a3b8", "solid", 1.5
                el = None
            lnk = {"source": src, "target": nid,
                    "lineStyle": {"curveness": curv, "color": ec, "width": ew, "type": et}}
            if el:
                lnk["label"] = el
            links.append(lnk)
        xi += 1

    # ────────────────────────────────────────────────
    # ETAPE 3 : Métriques agrégées par URL
    # ────────────────────────────────────────────────
    url_order = []
    url_groups = {}
    for v in visites:
        u = v['url']
        if u not in url_groups:
            url_order.append(u)
            url_groups[u] = {
                'url': u, 'nom': v['nom'],
                'temps_ms': 0, 'maxScroll': 0, 'clics': 0,
                'copies': [], 'saisies': [], 'nb_visites': 0,
                'back_count': 0, 'forward_count': 0, 'closed_count': 0,
                'questions': set()
            }
        g = url_groups[u]
        g['temps_ms'] += v['temps_ms']
        g['maxScroll'] = max(g['maxScroll'], v['maxScroll'])
        g['clics'] += v['clics']
        g['copies'].extend(v['copies'])
        g['saisies'].extend(v['saisies'])
        g['nb_visites'] += 1
        if v.get('is_back'):    g['back_count'] += 1
        if v.get('is_forward'): g['forward_count'] += 1
        if v.get('tab_closed'): g['closed_count'] += 1
        if v.get('question'):   g['questions'].add(v['question'])

    vr = [url_groups[u] for u in url_order]
    labels = [v['nom'] for v in vr]
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
        'forward': sum(1 for v in visites if v['is_forward']),
        'closed': sum(1 for v in visites if v['tab_closed']),
        'tabs': len(set(v['tabId'] for v in visites if v['tabId'])),
        'pages': len(vr)
    }

    pie = []
    if tot['clics']:   pie.append({"name": "Clics",   "value": tot['clics']})
    if tot['copies']:  pie.append({"name": "Copies",  "value": tot['copies']})
    if tot['saisies']: pie.append({"name": "Saisies", "value": tot['saisies']})
    if not pie:        pie.append({"name": "Aucune interaction", "value": 1})

    doms = {}
    for v in vr:
        try:
            d = urlparse(v['url']).netloc.replace('www.', '')
            if not d:
                d = v['url'].split('://')[0] + '://'
        except:
            d = '?'
        doms[d] = doms.get(d, 0) + v['nb_visites']
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

    # ────────────────────────────────────────────────
    # ETAPE 4a : Labels de questions uniques (pour filtres)
    # ────────────────────────────────────────────────
    all_q_labels = []
    seen_q = set()
    for v in visites:
        q = v.get('question', '')
        if q and q not in seen_q:
            all_q_labels.append(q)
            seen_q.add(q)

    # ────────────────────────────────────────────────
    # ETAPE 4b : Tableau détaillé (par visite)
    # ────────────────────────────────────────────────
    detail_rows_html = ""
    for v in visites:
        url_esc = v['url'].replace("&", "&amp;").replace('"', "&quot;").replace("'", "&#39;")
        q = v.get('question', '')
        qc = q_colors.get(q, '#64748b')
        tags = ""
        if v.get('is_back'):    tags += '<span class="tag tag-orange">Back</span>'
        if v.get('is_forward'): tags += '<span class="tag tag-blue">Fwd</span>'
        if v.get('tab_closed'): tags += '<span class="tag tag-red">Fermé</span>'
        if v['clics']:          tags += f'<span class="tag tag-indigo">{v["clics"]} clic(s)</span>'
        if v['copies']:         tags += f'<span class="tag tag-green">{len(v["copies"])} copie(s)</span>'
        if v['saisies']:        tags += f'<span class="tag tag-amber">{len(v["saisies"])} saisie(s)</span>'
        cp = "; ".join(f'"{t[:30]}"' for t in v['copies']) or "—"
        sa = "; ".join(f'"{t[:30]}"' for t in v['saisies']) or "—"
        heure = ts_to_heure(v['timestamp'])
        q_badge = f'<span class="q-badge" style="background:{qc}">{q}</span>' if q else '—'

        detail_rows_html += f"""<tr data-question="{q}">
            <td>{q_badge}</td>
            <td class="cell-mono">{heure}</td>
            <td><a href="{url_esc}" target="_blank" class="cell-link" title="{url_esc}">{v['nom']}</a></td>
            <td class="cell-right">{round(v['temps_ms']/1000,1)} s</td>
            <td class="cell-right">{v['maxScroll']}%</td>
            <td class="cell-right">{v['clics']}</td>
            <td class="cell-dim">{cp}</td>
            <td class="cell-dim">{sa}</td>
            <td>{tags}</td>
        </tr>"""

    # ────────────────────────────────────────────────
    # ETAPE 4c : Tableau agrégé par URL
    # ────────────────────────────────────────────────
    agg_rows_html = ""
    for v in vr:
        url_esc = v['url'].replace("&", "&amp;").replace('"', "&quot;").replace("'", "&#39;")
        qs = ", ".join(sorted(v['questions'])) if v['questions'] else "—"
        tags = ""
        if v['back_count']:    tags += f'<span class="tag tag-orange">{v["back_count"]} Back</span>'
        if v['forward_count']: tags += f'<span class="tag tag-blue">{v["forward_count"]} Fwd</span>'
        if v['closed_count']:  tags += f'<span class="tag tag-red">{v["closed_count"]} Fermé</span>'
        if v['clics']:         tags += f'<span class="tag tag-indigo">{v["clics"]} clic(s)</span>'
        if v['copies']:        tags += f'<span class="tag tag-green">{len(v["copies"])} copie(s)</span>'
        if v['saisies']:       tags += f'<span class="tag tag-amber">{len(v["saisies"])} saisie(s)</span>'
        cp = "; ".join(f'"{t[:30]}"' for t in v['copies']) or "—"
        sa = "; ".join(f'"{t[:30]}"' for t in v['saisies']) or "—"

        agg_rows_html += f"""<tr>
            <td>{qs}</td>
            <td class="cell-right">{v['nb_visites']}</td>
            <td><a href="{url_esc}" target="_blank" class="cell-link" title="{url_esc}">{v['nom']}</a></td>
            <td class="cell-right">{round(v['temps_ms']/1000,1)} s</td>
            <td class="cell-right">{v['maxScroll']}%</td>
            <td class="cell-right">{v['clics']}</td>
            <td class="cell-dim">{cp}</td>
            <td class="cell-dim">{sa}</td>
            <td>{tags}</td>
        </tr>"""

    # ────────────────────────────────────────────────
    # ETAPE 4d : Tableau des réponses
    # ────────────────────────────────────────────────
    reponses_rows_html = ""
    for r in sorted(reponses, key=lambda x: x.get('timestamp', '')):
        rtype = r.get('type', '—')
        qid = r.get('questionId', '—') or '—'
        ts_r = ts_to_heure(r.get('timestamp', ''))
        diff = r.get('difficulty', '—') or '—'
        data_r = r.get('data', {})
        if isinstance(data_r, dict):
            data_summary = "; ".join(f"{k}: {str(dv)[:40]}" for k, dv in list(data_r.items())[:4])
        else:
            data_summary = str(data_r)[:100]
        data_full = json.dumps(data_r, ensure_ascii=False)[:200].replace('"', '&quot;')

        reponses_rows_html += f"""<tr>
            <td class="cell-mono">{ts_r}</td>
            <td><span class="tag tag-blue">{rtype}</span></td>
            <td><strong>{qid}</strong></td>
            <td>{diff}</td>
            <td class="cell-dim" title="{data_full}">{data_summary}</td>
        </tr>"""

    # ────────────────────────────────────────────────
    # ETAPE 4e : Checkboxes filtres questions
    # ────────────────────────────────────────────────
    q_filter_html = ""
    if has_questions:
        q_filter_html += '<div class="q-filter-bar">'
        q_filter_html += '<span class="filter-title">Filtrer par question :</span>'
        q_filter_html += '<label class="q-cb"><input type="checkbox" checked onchange="toggleAllQ(this)"> Toutes</label>'
        for ql in all_q_labels:
            qc = q_colors.get(ql, '#64748b')
            q_filter_html += (
                f'<label class="q-cb">'
                f'<input type="checkbox" checked data-question="{ql}" onchange="filterByQuestion()">'
                f' <span class="q-dot" style="background:{qc}"></span> {ql}</label>'
            )
        q_filter_html += '</div>'

    # ────────────────────────────────────────────────
    # ETAPE 5 : Sérialisation JSON
    # ────────────────────────────────────────────────
    j = lambda x: json.dumps(x, ensure_ascii=False)

    nb_reponses = len(reponses)
    reponses_tab_display = "inline-block" if nb_reponses > 0 else "none"

    # ────────────────────────────────────────────────
    # ETAPE 6 : HTML complet
    # ────────────────────────────────────────────────
    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Analyse de session — Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*,*::before,*::after {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:'Inter',system-ui,sans-serif; background:#f8fafc; color:#1e293b; font-size:14px; }}
.header {{
    background:#1e293b; color:#f1f5f9; padding:18px 28px;
    display:flex; align-items:center; justify-content:space-between;
    border-bottom:3px solid #3b82f6;
}}
.header h1 {{ font-size:18px; font-weight:700; letter-spacing:-0.3px; }}
.header-meta {{ font-size:12px; color:#94a3b8; display:flex; gap:18px; margin-top:4px; }}
.tabs {{ display:flex; background:#fff; border-bottom:1px solid #e2e8f0; padding:0 20px; flex-wrap:wrap; }}
.tab-btn {{
    padding:12px 20px; border:none; background:none; font-size:13px; font-weight:500;
    color:#64748b; cursor:pointer; border-bottom:2px solid transparent;
    transition:color .2s, border-color .2s; font-family:inherit;
}}
.tab-btn:hover {{ color:#1e293b; }}
.tab-btn.active {{ color:#3b82f6; border-bottom-color:#3b82f6; }}
.tab-content {{ display:none; padding:24px; }}
.tab-content.active {{ display:block; }}
.stats-row {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom:20px; }}
.stat-card {{
    background:#fff; border-radius:10px; padding:14px 18px;
    box-shadow:0 1px 3px rgba(0,0,0,0.06); border:1px solid #e2e8f0;
}}
.stat-label {{ font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }}
.stat-value {{ font-size:22px; font-weight:700; margin-top:2px; }}
.chart-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; }}
.chart-box {{
    background:#fff; border-radius:10px; padding:16px;
    box-shadow:0 1px 3px rgba(0,0,0,0.06); border:1px solid #e2e8f0;
}}
.chart-box h3 {{ font-size:13px; font-weight:600; margin-bottom:10px; color:#334155; }}
.chart-full {{ grid-column: span 2; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; }}
th {{ background:#f1f5f9; padding:10px 12px; text-align:left; font-weight:600;
     color:#334155; border-bottom:2px solid #e2e8f0; position:sticky; top:0; z-index:1; }}
td {{ padding:8px 12px; border-bottom:1px solid #f1f5f9; vertical-align:top; }}
tr:hover {{ background:#f8fafc; }}
.cell-right {{ text-align:right; }}
.cell-mono {{ font-family:'JetBrains Mono',monospace; font-size:12px; }}
.cell-link {{ color:#3b82f6; text-decoration:none; }}
.cell-link:hover {{ text-decoration:underline; }}
.cell-dim {{ color:#64748b; font-size:12px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
.tag {{ display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; margin:1px 2px; }}
.tag-orange {{ background:#fff7ed; color:#c2410c; }}
.tag-blue {{ background:#eff6ff; color:#1d4ed8; }}
.tag-red {{ background:#fef2f2; color:#b91c1c; }}
.tag-indigo {{ background:#eef2ff; color:#4338ca; }}
.tag-green {{ background:#f0fdf4; color:#15803d; }}
.tag-amber {{ background:#fffbeb; color:#b45309; }}
.q-badge {{
    display:inline-block; padding:2px 10px; border-radius:4px;
    font-size:11px; font-weight:700; color:#fff;
}}
.q-filter-bar {{
    display:flex; align-items:center; gap:12px; padding:10px 16px;
    background:#f1f5f9; border-radius:8px; margin-bottom:12px; flex-wrap:wrap;
}}
.filter-title {{ font-size:12px; font-weight:600; color:#334155; }}
.q-cb {{ font-size:12px; color:#475569; cursor:pointer; display:flex; align-items:center; gap:4px; }}
.q-dot {{ display:inline-block; width:10px; height:10px; border-radius:50%; }}
.toolbar {{ display:flex; gap:10px; margin-bottom:12px; align-items:center; }}
.btn {{
    padding:8px 16px; border:none; border-radius:6px; font-size:12px;
    font-weight:600; cursor:pointer; font-family:inherit; transition:background .2s;
}}
.btn-primary {{ background:#3b82f6; color:#fff; }}
.btn-primary:hover {{ background:#2563eb; }}
.btn-secondary {{ background:#e2e8f0; color:#334155; }}
.btn-secondary:hover {{ background:#cbd5e1; }}
.legend-box {{
    background:#fff; border-radius:10px; padding:16px; margin-top:16px;
    box-shadow:0 1px 3px rgba(0,0,0,0.06); border:1px solid #e2e8f0;
    display:flex; flex-wrap:wrap; gap:16px; font-size:12px; color:#475569;
}}
.legend-item {{ display:flex; align-items:center; gap:6px; }}
.legend-circle {{ width:14px; height:14px; border-radius:50%; }}
.table-wrap {{ max-height:70vh; overflow:auto; border-radius:8px; border:1px solid #e2e8f0; }}
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>Analyse de session de navigation</h1>
    <div class="header-meta">
      <span>{len(visites)} visites</span>
      <span>{tot['pages']} pages uniques</span>
      <span>{tot['tabs']} onglets</span>
      <span>Durée : {duree_str}</span>
      <span>{tot['back']} back / {tot['forward']} fwd</span>
      {"<span>" + str(nb_reponses) + " réponses</span>" if nb_reponses else ""}
    </div>
  </div>
</div>

<div class="tabs">
  <button class="tab-btn active" onclick="switchTab('arbre')">Arbre de navigation</button>
  <button class="tab-btn" onclick="switchTab('metriques')">Métriques</button>
  <button class="tab-btn" onclick="switchTab('detail')">Données détaillées</button>
  <button class="tab-btn" onclick="switchTab('agrege')">Agrégé par URL</button>
  <button class="tab-btn" style="display:{reponses_tab_display}" onclick="switchTab('reponses')">Réponses ({nb_reponses})</button>
</div>

<!-- ═══════════ TAB : ARBRE ═══════════ -->
<div id="tab-arbre" class="tab-content active">
  <div class="chart-box" style="height:600px;overflow:auto;">
    <div id="chart-arbre" style="width:{max(1200, xi*EX+200)}px; height:{max(500, max_y+300)}px;"></div>
  </div>
  <div class="legend-box">
    <div class="legend-item"><div class="legend-circle" style="background:#6366f1;"></div> Clics</div>
    <div class="legend-item"><div class="legend-circle" style="background:#059669;"></div> Copies</div>
    <div class="legend-item"><div class="legend-circle" style="background:#d97706;"></div> Saisie clavier</div>
    <div class="legend-item"><div class="legend-circle" style="background:#64748b;"></div> Aucune interaction</div>
    <div class="legend-item"><div class="legend-circle" style="background:#fff;border:3px solid #dc2626;"></div> Onglet fermé</div>
    <div class="legend-item"><span style="color:#e87623;font-weight:600;">- - ↩ BACK</span></div>
    <div class="legend-item"><span style="color:#2563eb;font-weight:600;">- - ↪ FWD</span></div>
  </div>
</div>

<!-- ═══════════ TAB : MÉTRIQUES ═══════════ -->
<div id="tab-metriques" class="tab-content">
  <div class="stats-row">
    <div class="stat-card"><div class="stat-label">Pages visitées</div><div class="stat-value">{tot['pages']}</div></div>
    <div class="stat-card"><div class="stat-label">Temps total</div><div class="stat-value">{round(tot['temps']/1000)}s</div></div>
    <div class="stat-card"><div class="stat-label">Clics</div><div class="stat-value" style="color:#6366f1">{tot['clics']}</div></div>
    <div class="stat-card"><div class="stat-label">Copies</div><div class="stat-value" style="color:#059669">{tot['copies']}</div></div>
    <div class="stat-card"><div class="stat-label">Saisies</div><div class="stat-value" style="color:#d97706">{tot['saisies']}</div></div>
    <div class="stat-card"><div class="stat-label">Retours (back)</div><div class="stat-value" style="color:#ea580c">{tot['back']}</div></div>
    <div class="stat-card"><div class="stat-label">Onglets fermés</div><div class="stat-value" style="color:#dc2626">{tot['closed']}</div></div>
  </div>
  <div class="chart-grid">
    <div class="chart-box chart-full"><h3>Temps passé par page (s)</h3><div id="chart-temps" style="height:{ch}px;"></div></div>
    <div class="chart-box chart-full"><h3>Profondeur de scroll (%)</h3><div id="chart-scroll" style="height:{ch}px;"></div></div>
    <div class="chart-box"><h3>Répartition des interactions</h3><div id="chart-pie" style="height:300px;"></div></div>
    <div class="chart-box"><h3>Domaines les plus visités</h3><div id="chart-domaines" style="height:300px;"></div></div>
  </div>
</div>

<!-- ═══════════ TAB : DONNÉES DÉTAILLÉES ═══════════ -->
<div id="tab-detail" class="tab-content">
  {q_filter_html}
  <div class="toolbar">
    <button class="btn btn-primary" onclick="exportDetailCSV()">Télécharger CSV</button>
    <span id="detail-count" style="font-size:12px;color:#64748b;">{len(visites)} lignes</span>
  </div>
  <div class="table-wrap">
    <table id="detail-table">
      <thead><tr>
        <th>Question</th><th>Heure</th><th>Page</th><th>Temps</th>
        <th>Scroll</th><th>Clics</th><th>Copies</th><th>Saisies</th><th>Tags</th>
      </tr></thead>
      <tbody id="detail-tbody">{detail_rows_html}</tbody>
    </table>
  </div>
</div>

<!-- ═══════════ TAB : AGRÉGÉ PAR URL ═══════════ -->
<div id="tab-agrege" class="tab-content">
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Questions</th><th>Visites</th><th>Page</th><th>Temps total</th>
        <th>Scroll max</th><th>Clics</th><th>Copies</th><th>Saisies</th><th>Tags</th>
      </tr></thead>
      <tbody>{agg_rows_html}</tbody>
    </table>
  </div>
</div>

<!-- ═══════════ TAB : RÉPONSES ═══════════ -->
<div id="tab-reponses" class="tab-content">
  <div class="toolbar">
    <button class="btn btn-primary" onclick="exportReponsesCSV()">Télécharger CSV</button>
    <span style="font-size:12px;color:#64748b;">{nb_reponses} réponses</span>
  </div>
  <div class="table-wrap">
    <table id="reponses-table">
      <thead><tr>
        <th>Heure</th><th>Type</th><th>Question ID</th><th>Difficulté</th><th>Données</th>
      </tr></thead>
      <tbody>{reponses_rows_html}</tbody>
    </table>
  </div>
</div>

<script>
// ───────── Onglets ─────────
function switchTab(id) {{
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + id).classList.add('active');
    event.target.classList.add('active');
    if (id === 'arbre') setTimeout(() => window.__arbreChart && window.__arbreChart.resize(), 100);
}}

// ───────── Filtres questions ─────────
function filterByQuestion() {{
    var checks = document.querySelectorAll('.q-filter-bar input[data-question]');
    var active = new Set();
    checks.forEach(function(cb) {{ if (cb.checked) active.add(cb.dataset.question); }});
    var rows = document.querySelectorAll('#detail-tbody tr');
    var visible = 0;
    rows.forEach(function(row) {{
        var q = row.getAttribute('data-question');
        if (!q || active.has(q)) {{
            row.style.display = '';
            visible++;
        }} else {{
            row.style.display = 'none';
        }}
    }});
    document.getElementById('detail-count').textContent = visible + ' / {len(visites)} lignes';
    // Sync "Toutes"
    var allCb = document.querySelector('.q-filter-bar input:not([data-question])');
    if (allCb) allCb.checked = (active.size === checks.length);
}}

function toggleAllQ(allCb) {{
    var checks = document.querySelectorAll('.q-filter-bar input[data-question]');
    checks.forEach(function(cb) {{ cb.checked = allCb.checked; }});
    filterByQuestion();
}}

// ───────── Export CSV ─────────
function exportDetailCSV() {{
    var rows = document.querySelectorAll('#detail-tbody tr');
    var csv = 'Question;Heure;Page;Temps (s);Scroll (%);Clics;Copies;Saisies;Tags\\n';
    rows.forEach(function(row) {{
        if (row.style.display === 'none') return;
        var cells = row.querySelectorAll('td');
        var line = [];
        cells.forEach(function(c) {{
            var txt = c.innerText.replace(/"/g, '""').replace(/;/g, ',');
            line.push('"' + txt + '"');
        }});
        csv += line.join(';') + '\\n';
    }});
    downloadCSV(csv, 'donnees_detaillees.csv');
}}

function exportReponsesCSV() {{
    var rows = document.querySelectorAll('#reponses-table tbody tr');
    var csv = 'Heure;Type;QuestionID;Difficulte;Donnees\\n';
    rows.forEach(function(row) {{
        var cells = row.querySelectorAll('td');
        var line = [];
        cells.forEach(function(c) {{
            var txt = c.innerText.replace(/"/g, '""').replace(/;/g, ',');
            line.push('"' + txt + '"');
        }});
        csv += line.join(';') + '\\n';
    }});
    downloadCSV(csv, 'reponses.csv');
}}

function downloadCSV(csv, filename) {{
    var bom = '\\uFEFF';
    var blob = new Blob([bom + csv], {{ type: 'text/csv;charset=utf-8;' }});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}}

// ───────── Charts ECharts ─────────
var nodesData = {j(nodes)};
var linksData = {j(links)};

// Arbre
(function() {{
    var dom = document.getElementById('chart-arbre');
    var chart = echarts.init(dom);
    window.__arbreChart = chart;
    chart.setOption({{
        tooltip: {{
            trigger:'item', backgroundColor:'#1e293b', borderColor:'#334155',
            borderWidth:1, padding:0,
            formatter: function(p) {{
                if (p.dataType==='node') return p.data.tooltipDetails || p.name;
                if (p.dataType==='edge') {{
                    var s = nodesData.find(function(n){{return n.id===p.data.source}});
                    var t = nodesData.find(function(n){{return n.id===p.data.target}});
                    return (s?s.name:'?') + ' → ' + (t?t.name:'?');
                }}
                return '';
            }}
        }},
        animationDuration: 800,
        series: [{{
            type:'graph', layout:'none', coordinateSystem:null,
            data: nodesData, links: linksData,
            edgeSymbol:['none','arrow'], edgeSymbolSize:[0,8],
            roam:true, zoom:0.9, draggable:true,
            emphasis:{{ focus:'adjacency', lineStyle:{{ width:3 }} }},
            lineStyle:{{ opacity:0.8 }}
        }}]
    }});
}})();

// Temps passé
(function() {{
    var chart = echarts.init(document.getElementById('chart-temps'));
    chart.setOption({{
        tooltip:{{ trigger:'axis' }},
        grid:{{ left:180, right:40, top:10, bottom:30 }},
        xAxis:{{ type:'value', name:'Secondes' }},
        yAxis:{{ type:'category', data:{j(labels)}, inverse:true,
                 axisLabel:{{ fontSize:11, width:160, overflow:'truncate' }} }},
        series:[{{ type:'bar', data:{j(temps_data)}, color:'#3b82f6',
                   label:{{ show:true, position:'right', fontSize:11 }} }}]
    }});
}})();

// Scroll
(function() {{
    var chart = echarts.init(document.getElementById('chart-scroll'));
    chart.setOption({{
        tooltip:{{ trigger:'axis' }},
        grid:{{ left:180, right:40, top:10, bottom:30 }},
        xAxis:{{ type:'value', max:100, name:'%' }},
        yAxis:{{ type:'category', data:{j(labels)}, inverse:true,
                 axisLabel:{{ fontSize:11, width:160, overflow:'truncate' }} }},
        series:[{{ type:'bar', data:{j(scroll_items)},
                   label:{{ show:true, position:'right', fontSize:11, formatter:'{{c}}%' }} }}]
    }});
}})();

// Pie interactions
(function() {{
    var chart = echarts.init(document.getElementById('chart-pie'));
    chart.setOption({{
        tooltip:{{ trigger:'item' }},
        color:['#6366f1','#059669','#d97706','#94a3b8'],
        series:[{{ type:'pie', radius:['40%','70%'], data:{j(pie)},
                   label:{{ fontSize:12 }},
                   emphasis:{{ itemStyle:{{ shadowBlur:10, shadowColor:'rgba(0,0,0,0.2)' }} }} }}]
    }});
}})();

// Domaines
(function() {{
    var chart = echarts.init(document.getElementById('chart-domaines'));
    chart.setOption({{
        tooltip:{{ trigger:'axis' }},
        grid:{{ left:140, right:30, top:10, bottom:30 }},
        xAxis:{{ type:'value' }},
        yAxis:{{ type:'category', data:{j(doms_labels)}, inverse:true,
                 axisLabel:{{ fontSize:11, width:120, overflow:'truncate' }} }},
        series:[{{ type:'bar', data:{j(doms_values)}, color:'#8b5cf6',
                   label:{{ show:true, position:'right', fontSize:11 }} }}]
    }});
}})();
</script>
</body>
</html>"""

    with open(fichier_sortie, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"Dashboard généré : {fichier_sortie}")
    print(f"  - {len(visites)} visites, {tot['pages']} pages uniques")
    print(f"  - {nb_reponses} réponses au questionnaire")
    print(f"  - {len(question_periods)} périodes de questions détectées")
    if has_questions:
        for p in question_periods:
            print(f"    [{p['label']}] {p['type']} — {p.get('questionId', '?')}")


# ═══════════════════════════════════════════════════════════
# POINT D'ENTRÉE
# ═══════════════════════════════════════════════════════════

if __name__ == '__main__':
    nom_dossier_data = "Data_of_studies"
    nom_fichier_entree = "session_session_1776695169378_0mrnyu_2026-04-20.json"

    entree = nom_dossier_data + "/" + nom_fichier_entree
    sortie = "Visualisation/"+nom_fichier_entree.replace(".json", "_dashboard.html")

    generer_dashboard(entree, sortie)
