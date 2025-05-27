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
import random

st.set_page_config(page_title="Spotify Extended Dashboard", layout="wide")
st.title("📦 Spotify Extended Streaming History Dashboard")

# UPLOAD ZIP FILE
uploaded_file = st.sidebar.file_uploader("Upload your ZIP file with Spotify data", type="zip")

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

    # Basic preprocessing
    df['ts'] = pd.to_datetime(df['ts'], errors='coerce')
    df = df.dropna(subset=['ts'])
    df['minutes'] = df['ms_played'] / 60000
    df['year'] = df['ts'].dt.year
    df['month'] = df['ts'].dt.month
    df['weekday'] = df['ts'].dt.dayofweek
    df['hour'] = df['ts'].dt.hour
    df['date'] = df['ts'].dt.date

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

    tabs = st.tabs(["Top", "Temporal", "Distributions", "Heatmaps", "Streaks", "Artists & Albums", "Summary", "Game"])

    with tabs[0]:
        st.subheader("🎵 Most Played Tracks")
        top_tracks = filtered_df.groupby('master_metadata_track_name')['minutes'].sum().sort_values(ascending=False).head(20)
        st.bar_chart(top_tracks)

        st.subheader("👩‍🎤 Most Played Artists")
        top_artists = filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().sort_values(ascending=False).head(20)
        st.bar_chart(top_artists)

        st.subheader("📀 Most Played Albums")
        top_albums = filtered_df.groupby('master_metadata_album_album_name')['minutes'].sum().sort_values(ascending=False).head(20)
        st.bar_chart(top_albums)

    with tabs[1]:
        st.subheader("📈 Monthly Evolution")
        monthly = filtered_df.groupby(filtered_df['ts'].dt.to_period("M")).sum(numeric_only=True)['minutes']
        st.line_chart(monthly)

        st.subheader("📈 Weekly Evolution")
        weekly = filtered_df.groupby(filtered_df['ts'].dt.to_period("W")).sum(numeric_only=True)['minutes']
        st.line_chart(weekly)

        # Selector for number of artists, albums, and tracks
        num_artists = st.number_input("Number of artists to show", min_value=1, max_value=20, value=5, step=1)
        num_albums = st.number_input("Number of albums to show", min_value=1, max_value=20, value=5, step=1)
        num_tracks = st.number_input("Number of tracks to show", min_value=1, max_value=20, value=5, step=1)

        # Monthly evolution by artist
        st.subheader("📈 Monthly Evolution by Artist")
        top_artists = filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().sort_values(ascending=False).head(num_artists).index
        artist_monthly = filtered_df[filtered_df['master_metadata_album_artist_name'].isin(top_artists)].copy()
        artist_monthly['month_period'] = artist_monthly['ts'].dt.to_period("M")
        pivot_artist = artist_monthly.pivot_table(index='month_period', columns='master_metadata_album_artist_name', values='minutes', aggfunc='sum', fill_value=0)
        st.line_chart(pivot_artist)

        # Monthly evolution by album
        st.subheader("📈 Monthly Evolution by Album")
        top_albums = filtered_df.groupby('master_metadata_album_album_name')['minutes'].sum().sort_values(ascending=False).head(num_albums).index
        album_monthly = filtered_df[filtered_df['master_metadata_album_album_name'].isin(top_albums)].copy()
        album_monthly['month_period'] = album_monthly['ts'].dt.to_period("M")
        pivot_album = album_monthly.pivot_table(index='month_period', columns='master_metadata_album_album_name', values='minutes', aggfunc='sum', fill_value=0)
        st.line_chart(pivot_album)

        # Monthly evolution by track
        st.subheader("📈 Monthly Evolution by Track")
        top_tracks = filtered_df.groupby('master_metadata_track_name')['minutes'].sum().sort_values(ascending=False).head(num_tracks).index
        track_monthly = filtered_df[filtered_df['master_metadata_track_name'].isin(top_tracks)].copy()
        track_monthly['month_period'] = track_monthly['ts'].dt.to_period("M")
        pivot_track = track_monthly.pivot_table(index='month_period', columns='master_metadata_track_name', values='minutes', aggfunc='sum', fill_value=0)
        st.line_chart(pivot_track)

    with tabs[2]:
        st.subheader("📊 Distributions")
        fig, axs = plt.subplots(3, 2, figsize=(14, 10))
        sns.histplot(filtered_df['hour'], bins=24, ax=axs[0, 0]).set_title("By Hour of Day")
        sns.histplot(filtered_df['weekday'], bins=7, ax=axs[0, 1]).set_title("By Day of Week")
        sns.histplot(filtered_df['month'], bins=12, ax=axs[1, 0]).set_title("By Month")
        sns.histplot(filtered_df['year'], bins=len(filtered_df['year'].unique()), ax=axs[1, 1]).set_title("By Year")
        sns.histplot(filtered_df['minutes'], bins=30, ax=axs[2, 0]).set_title("Session Duration")
        axs[2, 1].axis('off')
        st.pyplot(fig)
        # Distribution of seconds of tracks
        if 'ms_played' in filtered_df.columns:
            filtered_df['seconds'] = filtered_df['ms_played'] / 1000
            sns.histplot(filtered_df['seconds'], bins=30, ax=axs[2, 1]).set_title("Session Duration (seconds)")
        else:
            axs[2, 1].axis('off')

        # Distribution of the second when playback started (real minute second)
        if 'ts' in filtered_df.columns:
            filtered_df['start_second'] = filtered_df['ts'].dt.second
            sns.histplot(filtered_df['start_second'], bins=60, ax=axs[2, 1], color='orange')
            axs[2, 1].set_title("Playback Start Second")
            axs[2, 1].set_xlabel("Second (0-59)")
            axs[2, 1].set_ylabel("Counts")
            st.pyplot(fig)

    with tabs[3]:
        st.subheader("🗺️ Cross Heatmaps")
        pivot = filtered_df.pivot_table(index='weekday', columns='hour', values='minutes', aggfunc='sum', fill_value=0)
        fig = plt.figure(figsize=(10, 4))
        sns.heatmap(pivot, cmap="YlGnBu")
        st.pyplot(fig)

        # more heatmaps
        st.subheader("📅 Monthly Heatmap")
        monthly_pivot = filtered_df.pivot_table(index='year', columns='month', values='minutes', aggfunc='sum', fill_value=0)
        fig = plt.figure(figsize=(10, 4))
        sns.heatmap(monthly_pivot, cmap="YlGnBu")
        st.pyplot(fig)

        st.subheader("📆 Daily Heatmap")
        daily_pivot = filtered_df.pivot_table(index='year', columns='date', values='minutes', aggfunc='sum', fill_value=0)
        fig = plt.figure(figsize=(10, 4))
        sns.heatmap(daily_pivot, cmap="YlGnBu")
        st.pyplot(fig)

        st.subheader("📊 Heatmap of Minutes by Top 5 Artists")
        top_artists = filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().sort_values(ascending=False).head(5).index
        top_artists_df = filtered_df[filtered_df['master_metadata_album_artist_name'].isin(top_artists)]
        artist_pivot = top_artists_df.pivot_table(index='year', columns='master_metadata_album_artist_name', values='minutes', aggfunc='sum', fill_value=0)
        fig = plt.figure(figsize=(10, 4))
        sns.heatmap(artist_pivot, cmap="YlGnBu")
        st.pyplot(fig)

        st.subheader("📊 Heatmap of Minutes by Top 5 Albums")
        top_albums = filtered_df.groupby('master_metadata_album_album_name')['minutes'].sum().sort_values(ascending=False).head(5).index
        top_albums_df = filtered_df[filtered_df['master_metadata_album_album_name'].isin(top_albums)]
        album_pivot = top_albums_df.pivot_table(index='year', columns='master_metadata_album_album_name', values='minutes', aggfunc='sum', fill_value=0)
        fig = plt.figure(figsize=(10, 4))
        sns.heatmap(album_pivot, cmap="YlGnBu")
        st.pyplot(fig)

        st.subheader("📊 Heatmap of Minutes by Top 5 Tracks")
        top_tracks = filtered_df.groupby('master_metadata_track_name')['minutes'].sum().sort_values(ascending=False).head(5).index
        top_tracks_df = filtered_df[filtered_df['master_metadata_track_name'].isin(top_tracks)]
        track_pivot = top_tracks_df.pivot_table(index='year', columns='master_metadata_track_name', values='minutes', aggfunc='sum', fill_value=0)
        fig = plt.figure(figsize=(10, 4))
        sns.heatmap(track_pivot, cmap="YlGnBu")
        st.pyplot(fig)

    with tabs[4]:
        st.subheader("📆 Listening Streaks")

        streak_data = filtered_df.groupby('date')['minutes'].sum().sort_index()
        days_with_listening = streak_data[streak_data > 0].index

        # Total days in range
        total_days = (streak_data.index.max() - streak_data.index.min()).days + 1

        # Days with and without listening
        days_with = (streak_data > 0).sum()
        days_without = (streak_data == 0).sum()

        # Calculate streaks of consecutive days with listening
        streaks = []
        current_streak = 0
        max_streak = 0
        for val in (streak_data > 0):
            if val:
                current_streak += 1
                max_streak = max(max_streak, current_streak)
            else:
                if current_streak > 0:
                    streaks.append(current_streak)
                current_streak = 0
        if current_streak > 0:
            streaks.append(current_streak)

        # Calculate streaks of consecutive days without listening
        zero_streaks = []
        current_zero_streak = 0
        max_zero_streak = 0
        for val in (streak_data == 0):
            if val:
                current_zero_streak += 1
                max_zero_streak = max(max_zero_streak, current_zero_streak)
            else:
                if current_zero_streak > 0:
                    zero_streaks.append(current_zero_streak)
                current_zero_streak = 0
        if current_zero_streak > 0:
            zero_streaks.append(current_zero_streak)

        st.metric("Days with listening", days_with)
        st.metric("Days without listening", days_without)
        st.metric("Total days", total_days)
        st.metric("Longest streak of consecutive listening days", max_streak)
        st.metric("Longest streak of consecutive days without listening", max_zero_streak)
        st.write(f"Average minutes per day with listening: {streak_data[streak_data > 0].mean():.2f}")
        st.write(f"Average minutes per day (including days without listening): {streak_data.mean():.2f}")

    with tabs[5]:
        st.subheader("👑 Artists and Albums Comparison")
        artist_year = filtered_df.groupby(['year', 'master_metadata_album_artist_name'])['minutes'].sum().reset_index()
        top = artist_year.sort_values(['year','minutes'], ascending=[True, False]).groupby('year').head(5)
        fig = px.bar(top, x='year', y='minutes', color='master_metadata_album_artist_name', barmode='group')
        st.plotly_chart(fig, use_container_width=True)

    with tabs[6]:
        st.subheader("📋 Global Statistics")

        total_minutes = int(filtered_df['minutes'].sum())
        total_hours = round(filtered_df['minutes'].sum() / 60, 2)
        total_tracks = filtered_df['master_metadata_track_name'].nunique()
        total_albums = filtered_df['master_metadata_album_album_name'].nunique()
        total_artists = filtered_df['master_metadata_album_artist_name'].nunique()
        total_days = filtered_df['date'].nunique()
        total_weeks = filtered_df['ts'].dt.isocalendar().week.nunique()
        total_months = filtered_df['month'].nunique()
        total_years = filtered_df['year'].nunique()

        most_played_track = filtered_df.groupby('master_metadata_track_name')['minutes'].sum().idxmax()
        most_played_track_minutes = filtered_df.groupby('master_metadata_track_name')['minutes'].sum().max()
        most_played_artist = filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().idxmax()
        most_played_artist_minutes = filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().max()
        most_played_album = filtered_df.groupby('master_metadata_album_album_name')['minutes'].sum().idxmax()
        most_played_album_minutes = filtered_df.groupby('master_metadata_album_album_name')['minutes'].sum().max()

        avg_minutes_per_day = filtered_df.groupby('date')['minutes'].sum().mean()
        avg_minutes_per_week = filtered_df.groupby([filtered_df['ts'].dt.isocalendar().year, filtered_df['ts'].dt.isocalendar().week])['minutes'].sum().mean()
        avg_minutes_per_month = filtered_df.groupby(['year', 'month'])['minutes'].sum().mean()

        first_date = filtered_df['date'].min()
        last_date = filtered_df['date'].max()

        total_seconds = int(filtered_df['minutes'].sum() * 60)
        st.write(f"⏱️ **Total seconds:** {total_seconds:,} sec")
        st.write(f"🕒 **Total minutes:** {total_minutes:,} min")
        st.write(f"⏳ **Total hours:** {total_hours:,} h")
        st.write(f"🎶 **Total unique tracks:** {total_tracks:,}")
        st.write(f"💿 **Total unique albums:** {total_albums:,}")
        st.write(f"👩‍🎤 **Total unique artists:** {total_artists:,}")
        st.write(f"📅 **Total days with listening:** {total_days:,}")
        st.write(f"📆 **Total weeks:** {total_weeks:,}")
        st.write(f"🗓️ **Total months:** {total_months:,}")
        st.write(f"📈 **Total years:** {total_years:,}")
        st.write(f"🔝 **Most played track:** {most_played_track} ({int(most_played_track_minutes)} min)")
        st.write(f"👑 **Most played artist:** {most_played_artist} ({int(most_played_artist_minutes)} min)")
        st.write(f"🏆 **Most played album:** {most_played_album} ({int(most_played_album_minutes)} min)")
        st.write(f"📊 **Average minutes per day:** {avg_minutes_per_day:.2f} min")
        st.write(f"📊 **Average minutes per week:** {avg_minutes_per_week:.2f} min")
        st.write(f"📊 **Average minutes per month:** {avg_minutes_per_month:.2f} min")
        st.write(f"🗓️ **First recorded day:** {first_date}")
        st.write(f"🗓️ **Last recorded day:** {last_date}")

        # Top 5 tracks, artists, and albums
        st.markdown("### 🏅 Top 5 Tracks")
        st.dataframe(filtered_df.groupby('master_metadata_track_name')['minutes'].sum().sort_values(ascending=False).head(5).reset_index().rename(columns={'minutes': 'Minutes'}))

        st.markdown("### 🏅 Top 5 Artists")
        st.dataframe(filtered_df.groupby('master_metadata_album_artist_name')['minutes'].sum().sort_values(ascending=False).head(5).reset_index().rename(columns={'minutes': 'Minutes'}))

        st.markdown("### 🏅 Top 5 Albums")
        st.dataframe(filtered_df.groupby('master_metadata_album_album_name')['minutes'].sum().sort_values(ascending=False).head(5).reset_index().rename(columns={'minutes': 'Minutes'}))

        # Day with most listening
        top_day = filtered_df.groupby('date')['minutes'].sum().idxmax()
        top_day_minutes = filtered_df.groupby('date')['minutes'].sum().max()
        st.write(f"📅 **Day with most listening:** {top_day} ({int(top_day_minutes)} min)")

        # Week with most listening (showing year and week)
        week_minutes = filtered_df.groupby([filtered_df['ts'].dt.isocalendar().year, filtered_df['ts'].dt.isocalendar().week])['minutes'].sum()
        top_week = week_minutes.idxmax()
        top_week_minutes = week_minutes.max()
        st.write(f"📆 **Week with most listening:** Year {top_week[0]}, Week {top_week[1]} ({int(top_week_minutes)} min)")

        # Month with most listening
        month_minutes = filtered_df.groupby(['year', 'month'])['minutes'].sum()
        top_month = month_minutes.idxmax()
        top_month_minutes = month_minutes.max()
        st.write(f"🗓️ **Month with most listening:** {top_month} ({int(top_month_minutes)} min)")

        # Additional stats: max tracks, albums, and artists in a day
        tracks_per_day = filtered_df.groupby('date')['master_metadata_track_name'].nunique()
        max_tracks_day = tracks_per_day.idxmax()
        max_tracks = tracks_per_day.max()
        st.write(f"🎵 **Max unique tracks in a day:** {max_tracks} ({max_tracks_day})")

        albums_per_day = filtered_df.groupby('date')['master_metadata_album_album_name'].nunique()
        max_albums_day = albums_per_day.idxmax()
        max_albums = albums_per_day.max()
        st.write(f"💿 **Max unique albums in a day:** {max_albums} ({max_albums_day})")

        artists_per_day = filtered_df.groupby('date')['master_metadata_album_artist_name'].nunique()
        max_artists_day = artists_per_day.idxmax()
        max_artists = artists_per_day.max()
        st.write(f"👩‍🎤 **Max unique artists in a day:** {max_artists} ({max_artists_day})")

        # Additional interesting stats
        min_day = filtered_df.groupby('date')['minutes'].sum().idxmin()
        min_day_minutes = filtered_df.groupby('date')['minutes'].sum().min()
        st.write(f"📉 **Day with least listening (with listening):** {min_day} ({int(min_day_minutes)} min, {int(min_day_minutes*60)} sec)")

        st.write(f"🔢 **Average unique tracks per day:** {tracks_per_day.mean():.2f}")
        st.write(f"🔢 **Average unique albums per day:** {albums_per_day.mean():.2f}")
        st.write(f"🔢 **Average unique artists per day:** {artists_per_day.mean():.2f}")



        # Most number of consecutive hours with listening, and show start/end hour
        filtered_df['datetime_hour'] = filtered_df['ts'].dt.floor('H')
        hourly_minutes = filtered_df.groupby('datetime_hour')['minutes'].sum().sort_index()
        hourly_presence = (hourly_minutes > 0).astype(int)

        max_hour_streak = 0
        current_streak = 0
        streak_start = None
        streak_end = None
        temp_start = None

        for idx, present in enumerate(hourly_presence):
            if present:
                if current_streak == 0:
                    temp_start = hourly_minutes.index[idx]
                current_streak += 1
                # Only update max when there's an ongoing streak
                if current_streak > max_hour_streak:
                    max_hour_streak = current_streak
                    streak_start = temp_start
                    streak_end = hourly_minutes.index[idx]
            else:
                current_streak = 0  # Reset only when there's a gap

        if max_hour_streak > 0:
            st.write(f"⏰ **Longest streak of consecutive hours with listening:** {max_hour_streak} (from {streak_start} to {streak_end})")
        else:
            st.write("⏰ **No consecutive hours with listening found.**")

    with tabs[7]:
        st.subheader("🎲 Juego: ¿Cuál es el más escuchado? (Artistas o Canciones)")

        game_type = st.radio("¿Qué quieres comparar?", ["Artistas", "Canciones"])

        def get_top_df(df, col_name):
            return (
                df.groupby(col_name)['minutes']
                .sum()
                .sort_values(ascending=False)
                .reset_index()
                .rename(columns={col_name: 'name', 'minutes': 'minutes'})
            )

        if game_type == "Artistas":
            top_df = get_top_df(filtered_df, 'master_metadata_album_artist_name').head(50)
            label = "artista"
        else:
            top_df = get_top_df(filtered_df, 'master_metadata_track_name').head(300)
            label = "canción"

        score_key = f"{label}_score"
        if score_key not in st.session_state:
            st.session_state[score_key] = 0

        if len(top_df) < 2:
            st.warning("No hay suficientes datos para jugar.")
        else:
            idx1, idx2 = random.sample(range(len(top_df)), 2)
            option1 = top_df.iloc[idx1]
            option2 = top_df.iloc[idx2]

            st.write(f"¿Cuál {label} has escuchado más?")

            colA, colB = st.columns(2)
            with colA:
                if st.button(option1['name'], key=f"{label}_A_{idx1}_{idx2}"):
                    if option1['minutes'] >= option2['minutes']:
                        st.success("¡Correcto!")
                        st.session_state[score_key] += 1
                    else:
                        st.error("Incorrecto.")
                        st.session_state[score_key] = 0
                    st.experimental_rerun()
            with colB:
                if st.button(option2['name'], key=f"{label}_B_{idx2}_{idx1}"):
                    if option2['minutes'] >= option1['minutes']:
                        st.success("¡Correcto!")
                        st.session_state[score_key] += 1
                    else:
                        st.error("Incorrecto.")
                        st.session_state[score_key] = 0
                    st.experimental_rerun()

            st.info(f"Puntuación actual: {st.session_state[score_key]}")
