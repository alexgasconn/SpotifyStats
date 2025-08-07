import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import zipfile
import json
from datetime import datetime
import random

st.set_page_config(page_title="Spotify Extended Dashboard", layout="wide")
st.markdown("### 📦 Spotify Extended Streaming History Dashboard")


# UPLOAD ZIP FILE
uploaded_file = st.sidebar.file_uploader("Upload your ZIP file with Spotify data", type="zip")

if uploaded_file:
    with zipfile.ZipFile(uploaded_file, 'r') as archive:
        # The folder name can vary, so we look for the pattern
        json_files = [f for f in archive.namelist() if f.startswith('MyData/endsong_') and f.endswith('.json')]
        # Fallback for the old naming convention if the new one is not found
        if not json_files:
            target_dir = "Spotify Extended Streaming History"
            json_files = [f for f in archive.namelist() if f.startswith(target_dir) and f.endswith('.json')]


        if not json_files:
            st.error("No 'endsong_...json' or 'Spotify Extended Streaming History' files found in the ZIP archive. Please make sure you have the correct file from Spotify.")
            st.stop()

        data = []
        for file in json_files:
            with archive.open(file) as f:
                content = json.load(f)
                data.extend(content)

    df = pd.DataFrame(data)

    # Basic preprocessing
    df['ts'] = pd.to_datetime(df['ts'], errors='coerce')
    df = df.dropna(subset=['ts', 'master_metadata_track_name']) # Ensure track name is not null
    df['minutes'] = df['ms_played'] / 60000
    df['year'] = df['ts'].dt.year
    df['month'] = df['ts'].dt.month
    df['weekday'] = df['ts'].dt.dayofweek # Monday=0, Sunday=6
    df['hour'] = df['ts'].dt.hour
    df['date'] = df['ts'].dt.date

    # Sidebar date filter
    st.sidebar.markdown("### 📅 Date Filters")
    min_date = df['date'].min()
    max_date = df['date'].max()
    start_date, end_date = st.sidebar.date_input(
        "Filter by date range",
        [min_date, max_date],
        min_value=min_date,
        max_value=max_date
    )

    # Ensure dates are in the correct format before filtering
    if isinstance(start_date, datetime):
        start_date = start_date.date()
    if isinstance(end_date, datetime):
        end_date = end_date.date()

    df = df[(df['date'] >= start_date) & (df['date'] <= end_date)]


    artist_filter = st.sidebar.multiselect("Filter by artist", df['master_metadata_album_artist_name'].dropna().unique())
    album_filter = st.sidebar.multiselect("Filter by album", df['master_metadata_album_album_name'].dropna().unique())
    track_filter = st.sidebar.multiselect("Filter by track", df['master_metadata_track_name'].dropna().unique())

    filtered_df = df.copy()
    if artist_filter:
        filtered_df = filtered_df[filtered_df['master_metadata_album_artist_name'].isin(artist_filter)]
    if album_filter:
        filtered_df = filtered_df[filtered_df['master_metadata_album_album_name'].isin(album_filter)]
    if track_filter:
        filtered_df = filtered_df[filtered_df['master_metadata_track_name'].isin(track_filter)]

    # NUEVO: Lista de pestañas actualizada
    tabs = st.tabs(["Top", "🏆 Weekly Ranking", "Temporal", "Distributions", "Heatmaps", "Streaks", "Artists & Albums", "Summary", "Game", "🌟 Your Wrapped"])

    with tabs[0]:
        st.subheader("🏆 Your All-Time & Filtered Top Lists")
        st.markdown("An overview of your most listened to tracks, artists, and albums based on the selected filters. Charts show total listening time, and tables provide additional details.")
        st.markdown("---")

        # Define el número de elementos a mostrar
        TOP_N = 15

        # Creamos las tres columnas para el dashboard
        col1, col2, col3 = st.columns(3, gap="large")

        # --- COLUMNA 1: TOP TRACKS ---
        with col1:
            st.markdown("#### 🎵 Top Tracks")

            # Agregamos para obtener minutos, conteo de reproducciones y el artista
            top_tracks_df = filtered_df.groupby(['master_metadata_track_name', 'master_metadata_album_artist_name']).agg(
                total_minutes=('minutes', 'sum'),
                play_count=('ts', 'count')
            ).sort_values('total_minutes', ascending=False).head(TOP_N).reset_index()

            # Gráfico de barras horizontal con Plotly para mejor visualización
            if not top_tracks_df.empty:
                fig_tracks = px.bar(
                    top_tracks_df.sort_values('total_minutes', ascending=True),
                    x='total_minutes',
                    y='master_metadata_track_name',
                    orientation='h',
                    text_auto='.0f',
                    title=f"Top {TOP_N} Tracks by Listening Time"
                )
                fig_tracks.update_traces(textposition='outside', marker_color='#1DB954')
                fig_tracks.update_layout(
                    yaxis_title=None,
                    xaxis_title="Total Minutes",
                    margin=dict(l=0, r=0, t=40, b=20),
                    height=450
                )
                st.plotly_chart(fig_tracks, use_container_width=True)

                # Tabla con detalles adicionales
                st.markdown("###### Detailed View")
                display_tracks = top_tracks_df[['master_metadata_track_name', 'master_metadata_album_artist_name', 'play_count', 'total_minutes']]
                display_tracks.columns = ['Track', 'Artist', 'Plays', 'Minutes']
                display_tracks['Minutes'] = display_tracks['Minutes'].round(0).astype(int)
                display_tracks.index = range(1, len(display_tracks) + 1)
                st.dataframe(display_tracks, use_container_width=True)
            else:
                st.warning("No track data available for the selected filters.")


        # --- COLUMNA 2: TOP ARTISTS ---
        with col2:
            st.markdown("#### 👩‍🎤 Top Artists")

            # Agregamos para obtener minutos y número de canciones únicas
            top_artists_df = filtered_df.groupby('master_metadata_album_artist_name').agg(
                total_minutes=('minutes', 'sum'),
                unique_tracks=('master_metadata_track_name', 'nunique')
            ).sort_values('total_minutes', ascending=False).head(TOP_N).reset_index()

            # Gráfico de barras horizontal con Plotly
            if not top_artists_df.empty:
                fig_artists = px.bar(
                    top_artists_df.sort_values('total_minutes', ascending=True),
                    x='total_minutes',
                    y='master_metadata_album_artist_name',
                    orientation='h',
                    text_auto='.0f',
                    title=f"Top {TOP_N} Artists by Listening Time"
                )
                fig_artists.update_traces(textposition='outside', marker_color='#1DB954')
                fig_artists.update_layout(
                    yaxis_title=None,
                    xaxis_title="Total Minutes",
                    margin=dict(l=0, r=0, t=40, b=20),
                    height=450
                )
                st.plotly_chart(fig_artists, use_container_width=True)

                # Tabla con detalles adicionales
                st.markdown("###### Detailed View")
                display_artists = top_artists_df.rename(columns={'master_metadata_album_artist_name': 'Artist', 'unique_tracks': 'Unique Tracks', 'total_minutes': 'Minutes'})
                display_artists['Minutes'] = display_artists['Minutes'].round(0).astype(int)
                display_artists.index = range(1, len(display_artists) + 1)
                st.dataframe(display_artists, use_container_width=True)
            else:
                st.warning("No artist data available for the selected filters.")

        # --- COLUMNA 3: TOP ALBUMS ---
        with col3:
            st.markdown("#### 📀 Top Albums")

            # Agregamos para obtener minutos, artista y número de canciones únicas
            top_albums_df = filtered_df.groupby(['master_metadata_album_album_name', 'master_metadata_album_artist_name']).agg(
                total_minutes=('minutes', 'sum'),
                unique_tracks=('master_metadata_track_name', 'nunique')
            ).sort_values('total_minutes', ascending=False).head(TOP_N).reset_index()

            # Gráfico de barras horizontal con Plotly
            if not top_albums_df.empty:
                fig_albums = px.bar(
                    top_albums_df.sort_values('total_minutes', ascending=True),
                    x='total_minutes',
                    y='master_metadata_album_album_name',
                    orientation='h',
                    text_auto='.0f',
                    title=f"Top {TOP_N} Albums by Listening Time"
                )
                fig_albums.update_traces(textposition='outside', marker_color='#1DB954')
                fig_albums.update_layout(
                    yaxis_title=None,
                    xaxis_title="Total Minutes",
                    margin=dict(l=0, r=0, t=40, b=20),
                    height=450
                )
                st.plotly_chart(fig_albums, use_container_width=True)

                # Tabla con detalles adicionales
                st.markdown("###### Detailed View")
                display_albums = top_albums_df.rename(columns={'master_metadata_album_album_name': 'Album', 'master_metadata_album_artist_name': 'Artist', 'unique_tracks': 'Unique Tracks', 'total_minutes': 'Minutes'})
                display_albums['Minutes'] = display_albums['Minutes'].round(0).astype(int)
                display_albums.index = range(1, len(display_albums) + 1)
                st.dataframe(display_albums, use_container_width=True)
            else:
                st.warning("No album data available for the selected filters.")

    ## NUEVO: Pestaña completa de Ranking Semanal con récords y historial por canción
    # NUEVO: Pestaña completa de Ranking Semanal con analytics de "data nerd", manejo de empates y formato mejorado
    with tabs[1]:
        st.subheader("🏆 Weekly Ranking Leaderboard (F1 Style)")
        st.markdown("""
        This chart calculates a leaderboard for your most listened-to tracks using a Formula 1 style scoring system.
        - Each week, we find your **top 10** most-listened tracks (by total minutes).
        - Points are awarded like in F1: **1st (25), 2nd (18), 3rd (15), 4th (12), 5th (10), 6th (8), 7th (6), 8th (4), 9th (2), 10th (1)**.
        - Below, you'll find the all-time leaderboard, a deep-dive into records, and a detailed history for each track.
        """)

        @st.cache_data(show_spinner="Calculating weekly rankings...")
        def calculate_weekly_ranking(df):
            track_artist_map = df.drop_duplicates(subset=['master_metadata_track_name'])[['master_metadata_track_name', 'master_metadata_album_artist_name']]
            df_copy = df.copy()
            df_copy['week_id'] = df_copy['ts'].dt.isocalendar().year.astype(str) + '-W' + df_copy['ts'].dt.isocalendar().week.astype(str).str.zfill(2)
            weekly_minutes = df_copy.groupby(['week_id', 'master_metadata_track_name'])['minutes'].sum().reset_index()
            points_map = {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1}
            def rank_and_score(group):
                top10 = group.nlargest(10, 'minutes').copy()
                top10['rank'] = range(1, len(top10) + 1)
                top10['points'] = top10['rank'].map(points_map)
                return top10
            weekly_ranking_df = weekly_minutes.groupby('week_id', group_keys=False).apply(rank_and_score)
            weekly_ranking_df = pd.merge(weekly_ranking_df, track_artist_map, on='master_metadata_track_name', how='left')
            return weekly_ranking_df

        weekly_results_df = calculate_weekly_ranking(filtered_df)

        if weekly_results_df.empty:
            st.warning("Not enough listening data in the selected period to generate weekly rankings.")
        else:
            st.markdown("---")
            st.subheader("🏁 All-Time Points Leaderboard")
            overall_scores = weekly_results_df.groupby('master_metadata_track_name').agg(total_points=('points', 'sum'), total_minutes=('minutes', 'sum')).sort_values(by='total_points', ascending=False).reset_index()
            overall_scores.rename(columns={'master_metadata_track_name': 'Track Name', 'total_points': 'Total Points', 'total_minutes': 'Total Minutes'}, inplace=True)
            overall_scores['Total Minutes'] = overall_scores['Total Minutes'].round(1)
            overall_scores = overall_scores[['Track Name', 'Total Points', 'Total Minutes']]
            overall_scores.index += 1
            st.dataframe(overall_scores, use_container_width=True)

            # --- SECCIÓN DE RÉCORDS Y FUN FACTS AMPLIADA ---
            st.markdown("---")
            st.subheader("🏆 All-Time Records & Fun Facts")

            # --- Funciones de ayuda para calcular récords y manejar empates ---
            def get_ties(series):
                if series.empty: return ("N/A", 0)
                max_value = series.max()
                tied_songs = series[series == max_value].index.tolist()
                return (", ".join(tied_songs), max_value)

            def get_max_consecutive_streak_series(df, rank_threshold):
                filtered_df = df[df['rank'] <= rank_threshold].copy()
                if filtered_df.empty: return pd.Series(dtype='int64')
                def calculate_streaks(group):
                    group = group.sort_values('week_id')
                    group['week_num'] = group['week_id'].str.split('-W').str[1].astype(int)
                    streaks = (group['week_num'].diff() != 1).cumsum()
                    return streaks.value_counts().max()
                return filtered_df.groupby('master_metadata_track_name').apply(calculate_streaks)

            def display_record(column, title, songs_str, value_str):
                column.markdown(f"**{title}**")
                column.markdown(f"<small>{songs_str}</small>", unsafe_allow_html=True)
                column.markdown(f"### {value_str}")

            with st.expander("👑 The GOATs (Greatest of All Time - Track Records)", expanded=True):
                st.markdown("#### Most Total Weeks In...")
                col1, col2, col3, col4 = st.columns(4)
                
                # Most Weeks in Top 1
                counts_t1 = weekly_results_df[weekly_results_df['rank'] <= 1].groupby('master_metadata_track_name').size()
                songs_t1, value_t1 = get_ties(counts_t1)
                display_record(col1, "Top 1", songs_t1, f"{int(value_t1)} weeks")

                # Most Weeks in Top 3
                counts_t3 = weekly_results_df[weekly_results_df['rank'] <= 3].groupby('master_metadata_track_name').size()
                songs_t3, value_t3 = get_ties(counts_t3)
                display_record(col2, "Top 3", songs_t3, f"{int(value_t3)} weeks")

                # Most Weeks in Top 5
                counts_t5 = weekly_results_df[weekly_results_df['rank'] <= 5].groupby('master_metadata_track_name').size()
                songs_t5, value_t5 = get_ties(counts_t5)
                display_record(col3, "Top 5", songs_t5, f"{int(value_t5)} weeks")

                # Most Weeks in Top 10
                counts_t10 = weekly_results_df.groupby('master_metadata_track_name').size()
                songs_t10, value_t10 = get_ties(counts_t10)
                display_record(col4, "Top 10", songs_t10, f"{int(value_t10)} weeks")
                
                st.divider()
                
                st.markdown("#### Most Consecutive Weeks In...")
                colA, colB, colC, colD = st.columns(4)

                # Most Consecutive Weeks in Top 1
                streaks_t1 = get_max_consecutive_streak_series(weekly_results_df, 1)
                songs_s_t1, value_s_t1 = get_ties(streaks_t1)
                display_record(colA, "Top 1", songs_s_t1, f"{int(value_s_t1)} weeks")

                # Most Consecutive Weeks in Top 3
                streaks_t3 = get_max_consecutive_streak_series(weekly_results_df, 3)
                songs_s_t3, value_s_t3 = get_ties(streaks_t3)
                display_record(colB, "Top 3", songs_s_t3, f"{int(value_s_t3)} weeks")

                # Most Consecutive Weeks in Top 5
                streaks_t5 = get_max_consecutive_streak_series(weekly_results_df, 5)
                songs_s_t5, value_s_t5 = get_ties(streaks_t5)
                display_record(colC, "Top 5", songs_s_t5, f"{int(value_s_t5)} weeks")

                # Most Consecutive Weeks in Top 10
                streaks_t10 = get_max_consecutive_streak_series(weekly_results_df, 10)
                songs_s_t10, value_s_t10 = get_ties(streaks_t10)
                display_record(colD, "Top 10", songs_s_t10, f"{int(value_s_t10)} weeks")


            with st.expander("👩‍🎤 Artist Dominance & Chart Volatility Records"):
                col1, col2, col3 = st.columns(3)
                # Constructor's Champion
                constructor_points = weekly_results_df.groupby('master_metadata_album_artist_name')['points'].sum()
                songs_c, value_c = get_ties(constructor_points)
                display_record(col1, "Constructor's Champion", songs_c, f"{int(value_c)} points")
                
                # Most Chart Hits
                artist_chart_hits = weekly_results_df.groupby('master_metadata_album_artist_name')['master_metadata_track_name'].nunique()
                songs_h, value_h = get_ties(artist_chart_hits)
                display_record(col2, "Most Chart Hits (Artist)", songs_h, f"{int(value_h)} songs")

                # Highest Debut
                debuts = weekly_results_df.loc[weekly_results_df.groupby('master_metadata_track_name')['week_id'].idxmin()]
                min_rank = debuts['rank'].min()
                highest_debut_songs = debuts[debuts['rank'] == min_rank]['master_metadata_track_name'].tolist()
                display_record(col3, "Highest Debut of All Time", ", ".join(highest_debut_songs), f"#{int(min_rank)}")


            # --- SECCIÓN DE HISTORIAL POR CANCIÓN ---
            st.markdown("---")
            st.subheader("📜 Track Position History")
            track_list = ["Select a track..."] + sorted(weekly_results_df['master_metadata_track_name'].unique())
            selected_track = st.selectbox("Choose a track to see its full history:", track_list)
            if selected_track != "Select a track...":
                history_df = weekly_results_df[weekly_results_df['master_metadata_track_name'] == selected_track].sort_values('week_id')
                fig = px.line(history_df, x='week_id', y='rank', title=f'Weekly Rank for "{selected_track}"', markers=True, labels={'week_id': 'Week', 'rank': 'Rank'})
                fig.update_yaxes(autorange="reversed", tick0=1, dtick=1)
                st.plotly_chart(fig, use_container_width=True)
                st.write("#### Weekly Data")
                history_display = history_df[['week_id', 'rank', 'minutes', 'points']].rename(columns={'week_id': 'Week', 'rank': 'Rank', 'minutes': 'Minutes Listened', 'points': 'Points Awarded'}).set_index('Week')
                history_display['Minutes Listened'] = history_display['Minutes Listened'].round(1)
                st.dataframe(history_display, use_container_width=True)

            # --- VISTA SEMANAL ---
            st.markdown("---")
            st.subheader("📅 View a Specific Week's Ranking")
            unique_weeks = sorted(weekly_results_df['week_id'].unique(), reverse=True)
            selected_week = st.selectbox("Choose a week to inspect:", unique_weeks)
            if selected_week:
                week_data = weekly_results_df[weekly_results_df['week_id'] == selected_week].sort_values('rank').copy()
                week_data['Minutes Listened'] = week_data['minutes'].round(1)
                week_data_display = week_data[['rank', 'master_metadata_track_name', 'minutes', 'points']].rename(columns={'rank': 'Rank', 'master_metadata_track_name': 'Track Name', 'minutes': 'Minutes Listened', 'points': 'Points Awarded'})
                st.dataframe(week_data_display.set_index('Rank'), use_container_width=True)

    with tabs[2]:
        st.subheader("📈 Monthly Evolution")
        monthly = filtered_df.set_index('ts').resample('M')['minutes'].sum()
        st.line_chart(monthly)

        st.subheader("📈 Weekly Evolution")
        weekly = filtered_df.set_index('ts').resample('W')['minutes'].sum()
        st.line_chart(weekly)

        # Selector for number of artists, albums, and tracks
        num_artists = st.number_input("Number of artists to show", min_value=1, max_value=20, value=5, step=1, key="artist_num")
        num_albums = st.number_input("Number of albums to show", min_value=1, max_value=20, value=5, step=1, key="album_num")
        num_tracks = st.number_input("Number of tracks to show", min_value=1, max_value=20, value=5, step=1, key="track_num")

        # Monthly evolution by artist
        st.subheader("📈 Monthly Evolution by Artist")
        top_artists = filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().nlargest(num_artists).index
        artist_monthly = filtered_df[filtered_df['master_metadata_album_artist_name'].isin(top_artists)].copy()
        pivot_artist = artist_monthly.pivot_table(index=pd.Grouper(key='ts', freq='M'), columns='master_metadata_album_artist_name', values='minutes', aggfunc='sum', fill_value=0)
        st.line_chart(pivot_artist)

        # Monthly evolution by album
        st.subheader("📈 Monthly Evolution by Album")
        top_albums = filtered_df.groupby('master_metadata_album_album_name')['minutes'].sum().nlargest(num_albums).index
        album_monthly = filtered_df[filtered_df['master_metadata_album_album_name'].isin(top_albums)].copy()
        pivot_album = album_monthly.pivot_table(index=pd.Grouper(key='ts', freq='M'), columns='master_metadata_album_album_name', values='minutes', aggfunc='sum', fill_value=0)
        st.line_chart(pivot_album)

        # Monthly evolution by track
        st.subheader("📈 Monthly Evolution by Track")
        top_tracks = filtered_df.groupby('master_metadata_track_name')['minutes'].sum().nlargest(num_tracks).index
        track_monthly = filtered_df[filtered_df['master_metadata_track_name'].isin(top_tracks)].copy()
        pivot_track = track_monthly.pivot_table(index=pd.Grouper(key='ts', freq='M'), columns='master_metadata_track_name', values='minutes', aggfunc='sum', fill_value=0)
        st.line_chart(pivot_track)

    with tabs[3]:
        st.subheader("📊 Distributions")
        fig, axs = plt.subplots(3, 2, figsize=(15, 12))
        fig.tight_layout(pad=4.0)

        sns.histplot(filtered_df['hour'], bins=24, ax=axs[0, 0], kde=True).set_title("By Hour of Day")
        sns.histplot(filtered_df['weekday'], bins=7, ax=axs[0, 1], kde=True).set_title("By Day of Week")
        axs[0, 1].set_xticks(range(7), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

        sns.histplot(filtered_df['month'], bins=12, ax=axs[1, 0], kde=True).set_title("By Month")
        axs[1, 0].set_xticks(range(1, 13))
        
        years = sorted(filtered_df['year'].unique())
        sns.histplot(filtered_df['year'], bins=len(years), ax=axs[1, 1]).set_title("By Year")
        axs[1, 1].set_xticks(years)

        # Distribution of track duration
        sns.histplot(filtered_df[filtered_df['minutes'] < 10]['minutes'], bins=50, ax=axs[2, 0], kde=True).set_title("Track Duration (Minutes, <10min)")
        
        # Distribution of playback start second
        filtered_df['start_second'] = filtered_df['ts'].dt.second
        sns.histplot(filtered_df['start_second'], bins=60, ax=axs[2, 1], color='orange', kde=True)
        axs[2, 1].set_title("Playback Start Second")
        axs[2, 1].set_xlabel("Second of the Minute (0-59)")
        axs[2, 1].set_ylabel("Count")

        st.pyplot(fig)


    with tabs[4]:
        st.subheader("🗺️ Activity Heatmap (Day of Week vs Hour)")
        pivot = filtered_df.pivot_table(index='weekday', columns='hour', values='minutes', aggfunc='sum', fill_value=0)
        pivot.index = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        fig = plt.figure(figsize=(12, 5))
        sns.heatmap(pivot, cmap="viridis", linewidths=.5)
        plt.title("Listening activity by hour and day of the week")
        st.pyplot(fig)

        st.subheader("📅 Calendar Heatmap (Day vs Month)")
        filtered_df['day_of_month'] = filtered_df['ts'].dt.day
        calendar_pivot = filtered_df.pivot_table(index='month', columns='day_of_month', values='minutes', aggfunc='sum', fill_value=0)
        fig = plt.figure(figsize=(14, 6))
        sns.heatmap(calendar_pivot, cmap="viridis", linewidths=.5)
        plt.title("Listening activity by day and month")
        st.pyplot(fig)

        col1, col2, col3 = st.columns(3)
        with col1:
            st.subheader("Top 5 Artists")
            top_artists = filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().nlargest(5).index
            top_artists_df = filtered_df[filtered_df['master_metadata_album_artist_name'].isin(top_artists)]
            artist_pivot = top_artists_df.pivot_table(index='year', columns='master_metadata_album_artist_name', values='minutes', aggfunc='sum', fill_value=0)
            fig = plt.figure(figsize=(10, 4))
            sns.heatmap(artist_pivot, cmap="viridis", annot=True, fmt=".0f")
            st.pyplot(fig)
        with col2:
            st.subheader("Top 5 Albums")
            top_albums = filtered_df.groupby('master_metadata_album_album_name')['minutes'].sum().nlargest(5).index
            top_albums_df = filtered_df[filtered_df['master_metadata_album_album_name'].isin(top_albums)]
            album_pivot = top_albums_df.pivot_table(index='year', columns='master_metadata_album_album_name', values='minutes', aggfunc='sum', fill_value=0)
            fig = plt.figure(figsize=(10, 4))
            sns.heatmap(album_pivot, cmap="viridis", annot=True, fmt=".0f")
            st.pyplot(fig)
        with col3:
            st.subheader("Top 5 Tracks")
            top_tracks = filtered_df.groupby('master_metadata_track_name')['minutes'].sum().nlargest(5).index
            top_tracks_df = filtered_df[filtered_df['master_metadata_track_name'].isin(top_tracks)]
            track_pivot = top_tracks_df.pivot_table(index='year', columns='master_metadata_track_name', values='minutes', aggfunc='sum', fill_value=0)
            fig = plt.figure(figsize=(10, 4))
            sns.heatmap(track_pivot, cmap="viridis", annot=True, fmt=".0f")
            st.pyplot(fig)


    with tabs[5]:
        st.subheader("📆 Listening Streaks")

        daily_minutes = filtered_df.groupby('date')['minutes'].sum()
        full_date_range = pd.date_range(start=daily_minutes.index.min(), end=daily_minutes.index.max())
        daily_minutes = daily_minutes.reindex(full_date_range.date, fill_value=0)

        days_with = (daily_minutes > 0).sum()
        days_without = (daily_minutes == 0).sum()
        total_days_in_range = len(daily_minutes)

        streaks = (daily_minutes > 0).astype(int).groupby(daily_minutes.eq(0).cumsum()).sum()
        max_streak = streaks.max() if not streaks.empty else 0

        zero_streaks = (daily_minutes == 0).astype(int).groupby(daily_minutes.gt(0).cumsum()).sum()
        max_zero_streak = zero_streaks.max() if not zero_streaks.empty else 0

        st.metric("Total days in selected range", total_days_in_range)
        st.metric("Days with listening", f"{days_with} days")
        st.metric("Days without listening", f"{days_without} days")
        st.metric("Longest streak of consecutive listening days", f"{max_streak} days")
        st.metric("Longest streak of consecutive days without listening", f"{max_zero_streak} days")
        st.write(f"Average minutes per day (on days you listened): {daily_minutes[daily_minutes > 0].mean():.2f}")
        st.write(f"Average minutes per day (across all days in range): {daily_minutes.mean():.2f}")

    with tabs[6]:
        st.subheader("👑 Top 5 Artists by Year")
        artist_year = filtered_df.groupby(['year', 'master_metadata_album_artist_name'])['minutes'].sum().reset_index()
        top = artist_year.sort_values(['year','minutes'], ascending=[True, False]).groupby('year').head(5)
        fig = px.bar(top, x='year', y='minutes', color='master_metadata_album_artist_name',
                     title="Top 5 Most Listened Artists Each Year", barmode='group',
                     labels={'minutes': 'Total Minutes Listened', 'year': 'Year', 'master_metadata_album_artist_name': 'Artist'})
        st.plotly_chart(fig, use_container_width=True)

    with tabs[7]:
        st.subheader("📋 Global Statistics Summary")
        
        total_minutes = int(filtered_df['minutes'].sum())
        total_hours = round(filtered_df['minutes'].sum() / 60, 2)
        total_tracks = filtered_df['master_metadata_track_name'].nunique()
        total_albums = filtered_df['master_metadata_album_album_name'].nunique()
        total_artists = filtered_df['master_metadata_album_artist_name'].nunique()
        total_days = filtered_df['date'].nunique()
        total_weeks = filtered_df.groupby([filtered_df['ts'].dt.isocalendar().year, filtered_df['ts'].dt.isocalendar().week]).ngroups
        total_months = filtered_df.groupby(['year', 'month']).ngroups
        total_years = filtered_df['year'].nunique()

        col1, col2, col3 = st.columns(3)
        col1.metric("Total Hours Listened", f"{total_hours:,.2f} h")
        col2.metric("Total Minutes Listened", f"{total_minutes:,.0f} min")
        col3.metric("Total Days with Listening", f"{total_days:,}")

        col1.metric("Unique Tracks", f"{total_tracks:,}")
        col2.metric("Unique Albums", f"{total_albums:,}")
        col3.metric("Unique Artists", f"{total_artists:,}")
        
        st.markdown("---")
        most_played_track = filtered_df.groupby('master_metadata_track_name')['minutes'].sum().idxmax()
        most_played_track_minutes = filtered_df.groupby('master_metadata_track_name')['minutes'].sum().max()
        most_played_artist = filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().idxmax()
        most_played_artist_minutes = filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().max()
        most_played_album = filtered_df.groupby('master_metadata_album_album_name')['minutes'].sum().idxmax()
        most_played_album_minutes = filtered_df.groupby('master_metadata_album_album_name')['minutes'].sum().max()

        st.write(f"🔝 **Most played track:** {most_played_track} ({int(most_played_track_minutes)} min)")
        st.write(f"👑 **Most played artist:** {most_played_artist} ({int(most_played_artist_minutes)} min)")
        st.write(f"🏆 **Most played album:** {most_played_album} ({int(most_played_album_minutes)} min)")
        st.markdown("---")
        
        avg_minutes_per_day = filtered_df.groupby('date')['minutes'].sum().mean()
        st.write(f"📊 **Average minutes per day (on listening days):** {avg_minutes_per_day:.2f} min")
        
        st.markdown("---")
        col1, col2, col3 = st.columns(3)
        with col1:
            st.markdown("### 🏅 Top 5 Tracks")
            st.dataframe(filtered_df.groupby('master_metadata_track_name')['minutes'].sum().nlargest(5).reset_index().rename(columns={'minutes': 'Minutes (sum)'}))
        with col2:
            st.markdown("### 🏅 Top 5 Artists")
            st.dataframe(filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().nlargest(5).reset_index().rename(columns={'minutes': 'Minutes (sum)'}))
        with col3:
            st.markdown("### 🏅 Top 5 Albums")
            st.dataframe(filtered_df.groupby('master_metadata_album_album_name')['minutes'].sum().nlargest(5).reset_index().rename(columns={'minutes': 'Minutes (sum)'}))
            
        st.markdown("---")
        filtered_df['datetime_hour'] = filtered_df['ts'].dt.floor('H')
        hourly_minutes = filtered_df.groupby('datetime_hour')['minutes'].sum()
        if not hourly_minutes.empty:
            full_hour_range = pd.date_range(start=hourly_minutes.index.min(), end=hourly_minutes.index.max(), freq='H')
            hourly_minutes = hourly_minutes.reindex(full_hour_range, fill_value=0)
            
            hourly_streaks = (hourly_minutes > 0).astype(int).groupby(hourly_minutes.eq(0).cumsum()).sum()
            max_hour_streak = hourly_streaks.max() if not hourly_streaks.empty else 0
            st.write(f"⏰ **Longest streak of consecutive hours with listening:** {max_hour_streak} hours")


    with tabs[8]:
        st.subheader("🎲 Game: Which is more played?")
        game_type = st.radio("What do you want to compare?", ["Artists", "Tracks"], horizontal=True)

        @st.cache_data(show_spinner=False)
        def get_top_items(df, col_name, n):
            return (df.groupby(col_name)['minutes']
                      .sum()
                      .nlargest(n)
                      .reset_index()
                      .rename(columns={col_name: 'name', 'minutes': 'minutes'}))

        if game_type == "Artists":
            top_items = get_top_items(filtered_df, 'master_metadata_album_artist_name', 100)
            label = "artist"
        else: # Tracks
            top_items = get_top_items(filtered_df, 'master_metadata_track_name', 200)
            label = "track"

        if f"game_score_{label}" not in st.session_state:
            st.session_state[f"game_score_{label}"] = {'correct': 0, 'incorrect': 0}
        if f"game_pair_{label}" not in st.session_state:
            st.session_state[f"game_pair_{label}"] = None
        if f"game_answered_{label}" not in st.session_state:
            st.session_state[f"game_answered_{label}"] = True

        if len(top_items) < 2:
            st.warning(f"Not enough {label} data to play. Try adjusting filters.")
        else:
            if st.session_state[f"game_answered_{label}"]:
                st.session_state[f"game_pair_{label}"] = random.sample(range(len(top_items)), 2)
                st.session_state[f"game_answered_{label}"] = False
            
            idx1, idx2 = st.session_state[f"game_pair_{label}"]
            option1 = top_items.iloc[idx1]
            option2 = top_items.iloc[idx2]

            st.write(f"Which {label} have you listened to more?")
            
            colA, colB = st.columns(2)
            
            is_answered = st.session_state.get(f"game_show_result_{label}", False)
            
            with colA:
                if st.button(option1['name'], key=f"{label}_A", use_container_width=True, disabled=is_answered):
                    st.session_state[f"game_show_result_{label}"] = True
                    st.session_state[f"game_player_choice_{label}"] = option1['name']
                    st.rerun()

            with colB:
                if st.button(option2['name'], key=f"{label}_B", use_container_width=True, disabled=is_answered):
                    st.session_state[f"game_show_result_{label}"] = True
                    st.session_state[f"game_player_choice_{label}"] = option2['name']
                    st.rerun()
            
            score = st.session_state[f"game_score_{label}"]
            st.info(f"Score: {score['correct']} Correct | {score['incorrect']} Incorrect")

            if is_answered:
                player_choice_name = st.session_state[f"game_player_choice_{label}"]
                
                if option1['minutes'] >= option2['minutes']:
                    correct_choice = option1
                else:
                    correct_choice = option2
                
                if player_choice_name == correct_choice['name']:
                    st.success("Correct!")
                    if not st.session_state.get(f"game_scored_this_round_{label}", False):
                        st.session_state[f"game_score_{label}"]['correct'] += 1
                else:
                    st.error("Incorrect!")
                    if not st.session_state.get(f"game_scored_this_round_{label}", False):
                        st.session_state[f"game_score_{label}"]['incorrect'] += 1

                st.session_state[f"game_scored_this_round_{label}"] = True
                
                st.write(f"**{option1['name']}**: {option1['minutes']:.0f} minutes")
                st.write(f"**{option2['name']}**: {option2['minutes']:.0f} minutes")
                
                if st.button("Next Question", key=f"{label}_next"):
                    st.session_state[f"game_answered_{label}"] = True
                    st.session_state[f"game_show_result_{label}"] = False
                    st.session_state[f"game_scored_this_round_{label}"] = False
                    st.rerun()


    with tabs[9]: # Ajustado para la posición 9
        st.title("🌟 Your Personalized Wrapped")
        st.markdown("Relive your year in music. Unlike the official Wrapped, here *you* are in control. Select a year to generate a deep and interactive analysis of your listening habits.")

        # --- 1. CONTROL DEL TIEMPO: EL SELECTOR DE AÑO ---
        available_years = sorted(df['year'].unique(), reverse=True)
        if not available_years:
            st.warning("No data available to generate a Wrapped report.")
            st.stop()
        
        header_cols = st.columns([3, 1])
        with header_cols[0]:
            st.markdown("###")
            selected_year = st.selectbox("Select a year to analyze:", available_years, label_visibility="collapsed")
        with header_cols[1]:
            st.image("https://storage.googleapis.com/pr-newsroom-wp/1/2023/11/Spotify_Wrapped_2023_Logo_Black.png", width=150)

        # Filtra el DataFrame principal para el año seleccionado.
        wrapped_df = df[df['year'] == selected_year].copy()

        if wrapped_df.empty:
            st.error(f"No listening data found for the year {selected_year}. Please select another year.")
        else:
            # --- SECCIÓN 2: TUS HEADLINES (CON ESTILO SPOTIFY) ---
            st.header(f"Your {selected_year} Headlines")
            
            total_minutes = wrapped_df['minutes'].sum()
            top_artist_info = wrapped_df.groupby('master_metadata_album_artist_name')['minutes'].sum().nlargest(1).reset_index()
            top_track_info = wrapped_df.groupby(['master_metadata_track_name', 'master_metadata_album_artist_name'])['minutes'].sum().nlargest(1).reset_index()
            top_artist_name = top_artist_info['master_metadata_album_artist_name'].iloc[0]
            top_track_name = top_track_info['master_metadata_track_name'].iloc[0]

            card_cols = st.columns(3)
            with card_cols[0]:
                st.markdown(f"""
                <div style="background-color: #535353; border-radius: 10px; padding: 20px; height: 160px; display: flex; flex-direction: column; justify-content: center;">
                <p style="font-size: 16px; color: #B3B3B3; margin:0;">Total Listening Time</p>
                <p style="font-size: 36px; font-weight: bold; color: #FFFFFF;">{int(total_minutes):,}</p>
                <p style="font-size: 16px; color: #B3B3B3; margin:0;">minutes</p>
                </div>
                """, unsafe_allow_html=True)
            with card_cols[1]:
                st.markdown(f"""
                <div style="background: linear-gradient(135deg, #B43B3B, #FF7878); border-radius: 10px; padding: 20px; height: 160px; display: flex; flex-direction: column; justify-content: center;">
                <p style="font-size: 16px; color: #FFFFFF; margin:0;">Your Top Artist</p>
                <p style="font-size: 28px; font-weight: bold; color: #FFFFFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-top:10px" title="{top_artist_name}">{top_artist_name}</p>
                </div>
                """, unsafe_allow_html=True)
            with card_cols[2]:
                st.markdown(f"""
                <div style="background: linear-gradient(135deg, #2A52BE, #5F9EA0); border-radius: 10px; padding: 20px; height: 160px; display: flex; flex-direction: column; justify-content: center;">
                <p style="font-size: 16px; color: #FFFFFF; margin:0;">Your Top Track</p>
                <p style="font-size: 28px; font-weight: bold; color: #FFFFFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-top:10px" title="{top_track_name}">{top_track_name}</p>
                </div>
                """, unsafe_allow_html=True)
            
            st.markdown("---")
            
            # --- SECCIÓN 3: LA CARRERA MENSUAL ---
            st.header("The Monthly Race to the Top")
            @st.cache_data
            def calculate_monthly_race(df_year):
                df_year['month_name'] = df_year['ts'].dt.strftime('%B')
                monthly_top5 = df_year.groupby(['month_name', 'master_metadata_album_artist_name'])['minutes'].sum().reset_index()
                monthly_top5['rank'] = monthly_top5.groupby('month_name')['minutes'].rank(method='first', ascending=False)
                return monthly_top5[monthly_top5['rank'] <= 5]
            race_df = calculate_monthly_race(wrapped_df)
            month_order = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
            race_df['month_name'] = pd.Categorical(race_df['month_name'], categories=month_order, ordered=True)
            race_df.sort_values('month_name', inplace=True)
            fig_race = px.bar(race_df, x="minutes", y="rank", orientation='h', color="master_metadata_album_artist_name", animation_frame="month_name", animation_group="master_metadata_album_artist_name", text="master_metadata_album_artist_name", title="Your Top 5 Artists, Month by Month")
            fig_race.update_layout(yaxis=dict(autorange="reversed", showticklabels=False, title="Rank"), xaxis=dict(title="Minutes Listened"), legend_title_text='Artist', height=500)
            fig_race.update_traces(textposition='outside', textfont_size=14)
            fig_race.layout.xaxis.range = [0, race_df['minutes'].max() * 1.15]
            st.plotly_chart(fig_race, use_container_width=True)

            st.markdown("---")

            # --- SECCIÓN 4: TU PERFIL DE ESCUCHA (CON LÓGICA MEJORADA) ---
            st.header("Your Listening Profile")
            st.markdown("Let's dive deep into your habits: what, when, and how you listened.")
            
            profile_cols = st.columns(3)

            with profile_cols[0]:
                st.subheader("🕰️ The Time of Day")
                wrapped_df['hour'] = wrapped_df['ts'].dt.hour
                bins = [-1, 4, 11, 17, 21, 23]
                labels = ['Late Night', 'Morning', 'Afternoon', 'Evening', 'Late Night']
                wrapped_df['time_of_day'] = pd.cut(wrapped_df['hour'], bins=bins, labels=labels, ordered=False)
                time_of_day_dist = wrapped_df.groupby('time_of_day')['minutes'].sum().reset_index()
                fig_tod = px.pie(time_of_day_dist, names='time_of_day', values='minutes', hole=0.4, title="Listening by Time of Day", color_discrete_sequence=px.colors.sequential.Plasma_r)
                fig_tod.update_layout(legend_title_text=None, legend=dict(orientation="h", yanchor="bottom", y=-0.4))
                st.plotly_chart(fig_tod, use_container_width=True)

            with profile_cols[1]:
                st.subheader("🧭 Listener DNA")
                st.markdown("How you engaged with music this year.")
                @st.cache_data
                def analyze_listener_dna(full_df, year_df, current_year):
                    first_listen_df = full_df.loc[full_df.groupby('master_metadata_track_name')['ts'].idxmin()]
                    new_discoveries_this_year = first_listen_df[first_listen_df['year'] == current_year]['master_metadata_track_name'].unique()
                    plays_in_year = year_df['master_metadata_track_name'].value_counts()
                    explorer_tracks = plays_in_year[plays_in_year.isin([1, 2]) & plays_in_year.index.isin(new_discoveries_this_year)].index
                    minutes_explorer = year_df[year_df['master_metadata_track_name'].isin(explorer_tracks)]['minutes'].sum()
                    loyalist_tracks = plays_in_year[plays_in_year >= 5].index
                    minutes_loyalist = year_df[year_df['master_metadata_track_name'].isin(loyalist_tracks)]['minutes'].sum()
                    old_discoveries = first_listen_df[first_listen_df['year'] < current_year]['master_metadata_track_name'].unique()
                    deep_cut_tracks = plays_in_year[(plays_in_year < 5) & (plays_in_year.index.isin(old_discoveries))].index
                    minutes_deep_cuts = year_df[year_df['master_metadata_track_name'].isin(deep_cut_tracks)]['minutes'].sum()
                    minutes_total = year_df['minutes'].sum()
                    minutes_casual = minutes_total - minutes_explorer - minutes_loyalist - minutes_deep_cuts
                    dna_df = pd.DataFrame([
                        {'Category': 'Explorer (New songs)', 'Minutes': minutes_explorer},
                        {'Category': 'Loyalist (Heavy rotation)', 'Minutes': minutes_loyalist},
                        {'Category': 'Deep Cuts (Old favorites)', 'Minutes': minutes_deep_cuts},
                        {'Category': 'Casual (The rest)', 'Minutes': minutes_casual}
                    ])
                    return dna_df
                dna_df = analyze_listener_dna(df, wrapped_df, selected_year)
                fig_dna = px.pie(dna_df, names='Category', values='Minutes', hole=0.4, title="Breakdown of Your Listening", color_discrete_sequence=px.colors.sequential.Viridis, hover_data={'Minutes':':.0f'})
                fig_dna.update_layout(legend_title_text=None, legend=dict(orientation="h", yanchor="bottom", y=-0.4))
                st.plotly_chart(fig_dna, use_container_width=True)
            
            with profile_cols[2]:
                st.subheader("⏳ Time Traveler")
                wrapped_df['release_year'] = pd.to_numeric(wrapped_df['master_metadata_album_album_name'].str.extract(r'\((\d{4})\)')[0], errors='coerce').fillna(wrapped_df['year'])
                def get_era(release_year, listen_year):
                    age = listen_year - release_year
                    if age <= 1: return f"From {listen_year}"
                    if age <= 5: return "Recent"
                    if age <= 15: return "Modern Classic"
                    return "Throwback"
                wrapped_df['era'] = wrapped_df.apply(lambda row: get_era(row['release_year'], selected_year), axis=1)
                era_dist = wrapped_df.groupby('era')['minutes'].sum().reset_index()
                fig_era = px.pie(era_dist, names='era', values='minutes', hole=0.4, title="Listening by Music Era", color_discrete_sequence=px.colors.sequential.RdBu)
                fig_era.update_layout(legend_title_text=None, legend=dict(orientation="h", yanchor="bottom", y=-0.4))
                st.plotly_chart(fig_era, use_container_width=True)

            # --- SECCIÓN 5: TU TARJETA DE PRESENTACIÓN FINAL (SOLUCIÓN DEFINITIVA) ---
            st.markdown("---")
            st.header(f"Your {selected_year} Masterpiece")
            st.markdown("This is your year, summarized. The ultimate shareable card with the most important stats.")

            with st.container():
                # --- Cálculos para la tarjeta ---
                total_tracks_unique = wrapped_df['master_metadata_track_name'].nunique()
                top_era = era_dist.loc[era_dist['minutes'].idxmax()]['era'] if not era_dist.empty else "Various"
                top_time_of_day = time_of_day_dist.loc[time_of_day_dist['minutes'].idxmax()]['time_of_day'] if not time_of_day_dist.empty else "Anytime"
                
                # 1. Definir la plantilla HTML con placeholders
                html_template = """
                <div style="background: linear-gradient(135deg, #1D2B64, #2c3e50); border-radius: 15px; padding: 25px; color: white; font-family: sans-serif;">
                    <h2 style="text-align: center; font-weight: bold; margin-bottom: 5px;">My Wrapped __{YEAR}__</h2>
                    <p style="text-align: center; font-size: 14px; color: #B3B3B3; margin-top: 0;">A Year in Review</p>
                    <hr style="border-color: #1DB954; margin: 15px 0;">

                    <div style="display: flex; justify-content: space-around; text-align: center; margin-bottom: 25px;">
                        <div>
                            <p style="font-size: 14px; color: #B3B3B3; margin:0;">TOTAL MINUTES</p>
                            <p style="font-size: 24px; font-weight: bold;">__{TOTAL_MINUTES}__</p>
                        </div>
                        <div>
                            <p style="font-size: 14px; color: #B3B3B3; margin:0;">UNIQUE SONGS</p>
                            <p style="font-size: 24px; font-weight: bold;">__{TOTAL_TRACKS}__</p>
                        </div>
                    </div>

                    <div style="background-color: rgba(0,0,0,0.2); padding: 15px; border-radius: 10px;">
                        <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px 15px; align-items: center;">
                            <span style="font-size: 24px;">👑</span>
                            <div>
                                <p style="font-size: 12px; color: #B3B3B3; margin:0;">TOP ARTIST</p>
                                <p style="font-size: 16px; font-weight: bold; margin:0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="__{TOP_ARTIST}__">__{TOP_ARTIST}__</p>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px 15px; align-items: center; margin-top: 10px;">
                            <span style="font-size: 24px;">🎶</span>
                            <div>
                                <p style="font-size: 12px; color: #B3B3B3; margin:0;">TOP TRACK</p>
                                <p style="font-size: 16px; font-weight: bold; margin:0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="__{TOP_TRACK}__">__{TOP_TRACK}__</p>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-around; text-align: center; margin-top: 25px;">
                         <div>
                            <p style="font-size: 14px; color: #B3B3B3; margin:0;">PRIME TIME</p>
                            <p style="font-size: 18px; font-weight: bold;">__{PRIME_TIME}__</p>
                        </div>
                        <div>
                            <p style="font-size: 14px; color: #B3B3B3; margin:0;">FAVORITE ERA</p>
                            <p style="font-size: 18px; font-weight: bold;">__{FAVORITE_ERA}__</p>
                        </div>
                    </div>
                    
                    <p style="font-size: 10px; color: #B3B3B3; text-align: center; margin-top: 20px;">Generated with Spotify Extended Dashboard</p>
                </div>
                """
                
                # 2. Rellenar la plantilla con los datos
                card_html = html_template.replace("__{YEAR}__", str(selected_year))
                card_html = card_html.replace("__{TOTAL_MINUTES}__", f"{int(total_minutes):,}")
                card_html = card_html.replace("__{TOTAL_TRACKS}__", f"{total_tracks_unique:,}")
                card_html = card_html.replace("__{TOP_ARTIST}__", top_artist_name)
                card_html = card_html.replace("__{TOP_TRACK}__", top_track_name)
                card_html = card_html.replace("__{PRIME_TIME}__", top_time_of_day)
                card_html = card_html.replace("__{FAVORITE_ERA}__", top_era)

                # 3. Renderizar el HTML final
                st.markdown(card_html, unsafe_allow_html=True)
