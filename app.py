import streamlit as st
import spotipy
from spotipy.oauth2 import SpotifyOAuth
import pandas as pd
import matplotlib.pyplot as plt
import plotly.express as px

import logging
import random

# CONFIGURACIÓN DE LOGGING
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# CONFIGURACIÓN DE LA APP DE SPOTIFY
CLIENT_ID = "772f387bafac4393a8cafbf09ee5aa86"
CLIENT_SECRET = "07d0d3b97c68425a832b6dcc6d5838ec"
REDIRECT_URI = "http://localhost:8888/callback"
SCOPE = "user-top-read user-read-recently-played user-library-read"

st.set_page_config(page_title="Spotify Stats Dashboard", layout="wide")
st.title("🎧 Spotify Stats Dashboard")


@st.cache_resource
def authenticate():
    logger.info("Authenticating with Spotify...")
    return spotipy.Spotify(auth_manager=SpotifyOAuth(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        redirect_uri=REDIRECT_URI,
        scope=SCOPE
    ))


logger.info("Starting authentication process")
sp = authenticate()
logger.info("Authentication complete")

# SELECCIÓN DEL PERIODO DE ANÁLISIS
range_map = {
    "Corto plazo (últimas 4 semanas)": "short_term",
    "Medio plazo (últimos 6 meses)": "medium_term",
    "Largo plazo (todo el historial)": "long_term"
}
time_range = st.selectbox("Periodo de análisis", list(range_map.keys()))
selected_range = range_map[time_range]
logger.info(f"Selected time range: {selected_range}")

# CARGA Y PROCESAMIENTO DE DATOS
logger.info("Fetching top tracks...")
top_tracks = sp.current_user_top_tracks(limit=20, time_range=selected_range)
logger.info(f"Fetched {len(top_tracks['items'])} top tracks")

logger.info("Fetching top artists...")
top_artists = sp.current_user_top_artists(limit=20, time_range=selected_range)
logger.info(f"Fetched {len(top_artists['items'])} top artists")

tracks_df = pd.DataFrame([{
    'name': t['name'],
    'artist': t['artists'][0]['name'],
    'album': t['album']['name'],
    'duration_min': t['duration_ms'] / 60000
} for t in top_tracks['items']])
logger.info(f"Tracks DataFrame shape: {tracks_df.shape}")

artists_df = pd.DataFrame([{
    'name': a['name'],
    'popularity': a['popularity'],
    'genres': ", ".join(a['genres']),
    'followers': a['followers']['total']
} for a in top_artists['items']])
logger.info(f"Artists DataFrame shape: {artists_df.shape}")

# VISUALIZACIONES
col1, col2 = st.columns(2)

with col1:
    st.subheader("🎵 Top Canciones")
    fig1 = px.bar(tracks_df, x='name', y='duration_min', color='artist',
                  title="Duración de tus canciones más escuchadas",
                  labels={'duration_min': 'Duración (min)'},
                  height=400)
    st.plotly_chart(fig1, use_container_width=True)

with col2:
    st.subheader("👩‍🎤 Top Artistas")
    fig2 = px.bar(artists_df, x='name', y='followers', title="Seguidores por artista",
                  labels={'followers': 'Seguidores'}, height=400)
    st.plotly_chart(fig2, use_container_width=True)

st.subheader("📀 Álbumes más escuchados")
album_counts = tracks_df['album'].value_counts().nlargest(10)
fig3, ax3 = plt.subplots()
album_counts.plot(kind='bar', ax=ax3)
ax3.set_ylabel("Veces en Top")
ax3.set_title("Álbumes más frecuentes en tu top")
st.pyplot(fig3)

st.subheader("🏷️ Géneros más escuchados")
genres = []
for a in top_artists['items']:
    genres.extend(a['genres'])
genre_series = pd.Series(genres).value_counts().head(10)
fig4, ax4 = plt.subplots()
genre_series.plot(kind='barh', ax=ax4)
ax4.invert_yaxis()
ax4.set_xlabel("Frecuencia")
ax4.set_title("Top Géneros")
st.pyplot(fig4)

# TIEMPO TOTAL DE ESCUCHA
total_minutes = tracks_df['duration_min'].sum()
st.info(
    f"🕒 Tiempo estimado escuchando tu Top 20: **{int(total_minutes)} minutos**")



# ===========================
# 🎲 Juego: ¿Cuál es el más escuchado?
# ===========================

st.subheader("🎲 Juego: ¿Cuál es el más escuchado?")

tabs = st.tabs(["Juego de Artistas", "Juego de Álbumes", "Juego de Canciones"])

def quiz_game(df, label, display_col):
    # Inicializar puntuación si no existe
    score_key = f"{label}_score"
    if score_key not in st.session_state:
        st.session_state[score_key] = 0

    # Seleccionar dos opciones distintas al azar
    if len(df) < 2:
        st.warning("No hay suficientes datos para jugar.")
        return

    idx1, idx2 = random.sample(range(len(df)), 2)
    option1 = df.iloc[idx1]
    option2 = df.iloc[idx2]

    st.write(f"¿Cuál {label} está más arriba en tu ranking?")

    colA, colB = st.columns(2)
    with colA:
        if st.button(option1[display_col], key=f"{label}_A_{idx1}_{idx2}"):
            if idx1 < idx2:
                st.success("¡Correcto!")
                st.session_state[score_key] += 1
            else:
                st.error("Incorrecto.")
                st.session_state[score_key] = 0
            st.experimental_rerun()
    with colB:
        if st.button(option2[display_col], key=f"{label}_B_{idx1}_{idx2}"):
            if idx2 < idx1:
                st.success("¡Correcto!")
                st.session_state[score_key] += 1
            else:
                st.error("Incorrecto.")
                st.session_state[score_key] = 0
            st.experimental_rerun()

    st.info(f"Puntuación actual: {st.session_state[score_key]}")

with tabs[0]:
    quiz_game(artists_df, "artista", "name")

with tabs[1]:
    albums_df = tracks_df[['album']].copy()
    albums_df['count'] = albums_df['album'].map(tracks_df['album'].value_counts())
    albums_df = albums_df.drop_duplicates().sort_values('count', ascending=False).reset_index(drop=True)
    quiz_game(albums_df, "álbum", "album")

with tabs[2]:
    quiz_game(tracks_df, "canción", "name")
