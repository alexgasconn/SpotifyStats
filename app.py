import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import zipfile
import os
import json
from io import BytesIO
from datetime import datetime

st.set_page_config(page_title="Spotify Extended Dashboard", layout="wide")
st.title("📦 Spotify Extended Streaming History Dashboard")

# SUBIR ARCHIVO ZIP
uploaded_file = st.sidebar.file_uploader("Sube tu archivo ZIP con los datos de Spotify", type="zip")

if uploaded_file:
    with zipfile.ZipFile(uploaded_file, 'r') as archive:
        target_dir = "Spotify Extended Streaming History"
        json_files = [f for f in archive.namelist() if f.startswith(target_dir) and f.endswith('.json')]

        data = []
        for file in json_files:
            with archive.open(file) as f:
                content = json.load(f)
                data.extend(content)

    df = pd.DataFrame(data)

    # Preprocesado básico
    df['ts'] = pd.to_datetime(df['ts'], errors='coerce')
    df = df.dropna(subset=['ts'])
    df['minutes'] = df['ms_played'] / 60000
    df['year'] = df['ts'].dt.year
    df['month'] = df['ts'].dt.month
    df['weekday'] = df['ts'].dt.dayofweek
    df['hour'] = df['ts'].dt.hour
    df['date'] = df['ts'].dt.date

    artist_filter = st.sidebar.multiselect("Filtrar por artista", df['master_metadata_album_artist_name'].dropna().unique())
    album_filter = st.sidebar.multiselect("Filtrar por álbum", df['master_metadata_album_album_name'].dropna().unique())
    track_filter = st.sidebar.multiselect("Filtrar por canción", df['master_metadata_track_name'].dropna().unique())

    filtered_df = df.copy()
    if artist_filter:
        filtered_df = filtered_df[filtered_df['master_metadata_album_artist_name'].isin(artist_filter)]
    if album_filter:
        filtered_df = filtered_df[filtered_df['master_metadata_album_album_name'].isin(album_filter)]
    if track_filter:
        filtered_df = filtered_df[filtered_df['master_metadata_track_name'].isin(track_filter)]

    tabs = st.tabs(["Top", "Temporal", "Distribuciones", "Heatmaps", "Rachas", "Artistas & Álbumes", "Resumen"])

    with tabs[0]:
        st.subheader("🎵 Canciones más escuchadas")
        top_tracks = filtered_df.groupby('master_metadata_track_name')['minutes'].sum().sort_values(ascending=False).head(20)
        st.bar_chart(top_tracks)

        st.subheader("👩‍🎤 Artistas más escuchados")
        top_artists = filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().sort_values(ascending=False).head(20)
        st.bar_chart(top_artists)

        st.subheader("📀 Álbumes más escuchados")
        top_albums = filtered_df.groupby('master_metadata_album_album_name')['minutes'].sum().sort_values(ascending=False).head(20)
        st.bar_chart(top_albums)

    with tabs[1]:
        st.subheader("📈 Evolución mensual")
        monthly = filtered_df.groupby(filtered_df['ts'].dt.to_period("M")).sum(numeric_only=True)['minutes']
        st.line_chart(monthly)

    with tabs[2]:
        st.subheader("📊 Distribuciones")
        fig, axs = plt.subplots(3, 2, figsize=(14, 10))
        sns.histplot(filtered_df['hour'], bins=24, ax=axs[0, 0]).set_title("Por hora del día")
        sns.histplot(filtered_df['weekday'], bins=7, ax=axs[0, 1]).set_title("Por día de la semana")
        sns.histplot(filtered_df['month'], bins=12, ax=axs[1, 0]).set_title("Por mes")
        sns.histplot(filtered_df['year'], bins=len(filtered_df['year'].unique()), ax=axs[1, 1]).set_title("Por año")
        sns.histplot(filtered_df['minutes'], bins=30, ax=axs[2, 0]).set_title("Duración sesiones")
        axs[2, 1].axis('off')
        st.pyplot(fig)

    with tabs[3]:
        st.subheader("🗺️ Heatmaps cruzados")
        pivot = filtered_df.pivot_table(index='weekday', columns='hour', values='minutes', aggfunc='sum', fill_value=0)
        fig = plt.figure(figsize=(10, 4))
        sns.heatmap(pivot, cmap="YlGnBu")
        st.pyplot(fig)

    with tabs[4]:
        st.subheader("📆 Rachas de escucha")
        streak_data = filtered_df.groupby('date')['minutes'].sum()
        streak_days = streak_data[streak_data > 0].count()
        st.metric("Días con escucha", streak_days)

    with tabs[5]:
        st.subheader("👑 Comparativa artistas y álbumes")
        artist_year = filtered_df.groupby(['year', 'master_metadata_album_artist_name'])['minutes'].sum().reset_index()
        top = artist_year.sort_values(['year','minutes'], ascending=[True, False]).groupby('year').head(5)
        fig = px.bar(top, x='year', y='minutes', color='master_metadata_album_artist_name', barmode='group')
        st.plotly_chart(fig, use_container_width=True)

    with tabs[6]:
        st.subheader("📋 Estadísticas globales")
        st.write(f"Total de minutos: {int(filtered_df['minutes'].sum())} min")
        st.write(f"Total de horas: {round(filtered_df['minutes'].sum()/60, 2)} h")
        st.write(f"Canción más escuchada: {filtered_df.groupby('master_metadata_track_name')['minutes'].sum().idxmax()}")
        st.write(f"Artista más escuchado: {filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().idxmax()}")
