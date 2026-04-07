import json
import pandas as pd
import plotly.express as px
from urllib.parse import urlparse

def generer_dashboard(fichier_entree, html_sortie):
    with open(fichier_entree, 'r', encoding='utf-8') as f:
        logs = json.load(f)

    # On ne filtre QUE les événements 'page_quittee' car c'est eux qui ont le temps réel et le scroll
    donnees_pages =[log for log in logs if log.get('type') == 'page_quittee']
    
    if not donnees_pages:
        print("Pas assez de données pour générer les graphiques.")
        return

    df = pd.DataFrame(donnees_pages)
    
    # Garder la valeur maximale pour chaque URL (si l'utilisateur y est retourné plusieurs fois)
    df_groupe = df.groupby('url').agg({
        'temps_passe_ms': 'max',
        'maxScroll': 'max'
    }).reset_index()

    # Conversion en secondes pour la lisibilité
    df_groupe['temps_sec'] = df_groupe['temps_passe_ms'] / 1000
    # URL courte pour l'affichage
    df_groupe['url_courte'] = df_groupe['url'].apply(lambda x: urlparse(x).netloc + urlparse(x).path[:20] + '...')

    # 1. GRAPHIQUE TEMPS PASSÉ (Toutes les pages)
    fig_temps = px.bar(df_groupe.sort_values('temps_sec', ascending=True), 
                  x='temps_sec', y='url_courte', orientation='h',
                  title='Temps total passé par page',
                  labels={'temps_sec': 'Temps (Secondes)', 'url_courte': 'Page'},
                  color='temps_sec', color_continuous_scale='Viridis', height=600)

    # 2. GRAPHIQUE SCROLL MAX
    fig_scroll = px.bar(df_groupe.sort_values('maxScroll', ascending=True), 
                  x='maxScroll', y='url_courte', orientation='h',
                  title='Profondeur de lecture (Scroll %) par page',
                  labels={'maxScroll': 'Scroll (%)', 'url_courte': 'Page'},
                  color='maxScroll', color_continuous_scale='Blues', height=600)
    fig_scroll.update_xaxes(range=[0, 100])

    # 3. NUAGE DE POINTS (Temps VS Scroll)
    fig_scatter = px.scatter(df_groupe, x='temps_sec', y='maxScroll', 
                             hover_name='url_courte', size='temps_sec',
                             title='Corrélation : Temps passé VS Profondeur de lecture',
                             labels={'temps_sec': 'Temps passé (Secondes)', 'maxScroll': 'Scroll (%)'},
                             color='maxScroll', color_continuous_scale='RdYlGn', height=600)
    fig_scatter.update_yaxes(range=[0, 110])

    # Création du fichier HTML
    with open(html_sortie, 'w', encoding='utf-8') as f:
        f.write("<html><head><title>Dashboard d'Étude</title><style>body{font-family:sans-serif; background:#f1f5f9; padding:20px;} .card{background:white; padding:20px; border-radius:8px; margin-bottom:30px; box-shadow:0 2px 4px rgba(0,0,0,0.1);}</style></head><body>")
        f.write("<h1 style='text-align:center;'>📊 Analyse de la Session</h1>")
        
        f.write("<div class='card'>")
        f.write(fig_scatter.to_html(full_html=False, include_plotlyjs='cdn'))
        f.write("</div>")
        
        f.write("<div class='card'>")
        f.write(fig_temps.to_html(full_html=False, include_plotlyjs=False))
        f.write("</div>")

        f.write("<div class='card'>")
        f.write(fig_scroll.to_html(full_html=False, include_plotlyjs=False))
        f.write("</div>")
        
        f.write("</body></html>")

    print(f"Super Dashboard généré : {html_sortie}")

if __name__ == "__main__": 
    generer_dashboard("Data_of_studies/etude3.json", "Visualisation/dashboard3.html")
    generer_dashboard("Data_of_studies/etude4.json", "Visualisation/dashboard4.html")