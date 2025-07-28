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
    tabs = st.tabs(["Top", "🏆 Weekly Ranking", "Temporal", "Distributions", "Heatmaps", "Streaks", "Artists & Albums", "Summary", "Game"])

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

    # NUEVO: Pestaña completa de Ranking Semanal
    with tabs[1]:
        st.subheader("🏆 Weekly Ranking Leaderboard")
        st.markdown("""
        This chart calculates a leaderboard for your most listened-to tracks. Here's how it works:
        - Each week, we find your top 5 most-listened tracks (by total minutes).
        - Points are awarded: **1st place (10), 2nd (7), 3rd (5), 4th (3), 5th (1)**.
        - Points are awarded like in F1: **1st (25), 2nd (18), 3rd (15), 4th (12), 5th (10), 6th (8), 7th (6), 8th (4), 9th (2), 10th (1)**.
        - The "All-Time Leaderboard" shows the total points accumulated by each track over the selected period.
        - You can also select a specific week to see the Top 5 for that period.
        """)

        @st.cache_data(show_spinner="Calculating weekly rankings...")
        def calculate_weekly_ranking(df):
            """
            Calculates the top 5 tracks for each week and assigns points.
            """
            df_copy = df.copy()
            # Use ISO week for standard week definitions. zfill ensures correct sorting.
            df_copy['week_id'] = df_copy['ts'].dt.isocalendar().year.astype(str) + \
                                '-W' + df_copy['ts'].dt.isocalendar().week.astype(str).str.zfill(2)

            # Sum minutes per track per week
            weekly_minutes = df_copy.groupby(['week_id', 'master_metadata_track_name'])['minutes'].sum().reset_index()

            # Assign points based on rank within each week
            # points_map = {1: 10, 2: 7, 3: 5, 4: 3, 5: 1}
            points_map = {
                1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 
                6: 8, 7: 6, 8: 4, 9: 2, 10: 1
                }

            def rank_and_score(group):
                top5 = group.nlargest(10, 'minutes').copy()
                top5['rank'] = range(1, len(top5) + 1)
                top5['points'] = top5['rank'].map(points_map)
                return top5

            # Apply the function to each weekly group
            weekly_ranking_df = weekly_minutes.groupby('week_id', group_keys=False).apply(rank_and_score)

            return weekly_ranking_df

        weekly_results_df = calculate_weekly_ranking(filtered_df)

        if weekly_results_df.empty:
            st.warning("Not enough listening data in the selected period to generate weekly rankings.")
        else:
            st.markdown("---")
            st.subheader("🏁 All-Time Points Leaderboard")
            
            # Calculate overall scores
            overall_scores = weekly_results_df.groupby('master_metadata_track_name')['points'].sum().sort_values(ascending=False).reset_index()
            overall_scores.rename(columns={'master_metadata_track_name': 'Track Name', 'points': 'Total Points'}, inplace=True)
            overall_scores.index += 1 # Start index from 1 for rank
            
            st.dataframe(overall_scores, use_container_width=True)

            st.markdown("---")
            st.subheader("📅 View a Specific Week's Ranking")
            
            # Create selector for weekly view
            unique_weeks = sorted(weekly_results_df['week_id'].unique(), reverse=True)
            selected_week = st.selectbox("Choose a week to inspect:", unique_weeks)
            
            if selected_week:
                week_data = weekly_results_df[weekly_results_df['week_id'] == selected_week].sort_values('rank').copy()
                
                # Format for display
                week_data['Minutes Listened'] = week_data['minutes'].round(1)
                week_data_display = week_data[['rank', 'master_metadata_track_name', 'Minutes Listened', 'points']]
                week_data_display.rename(columns={'rank': 'Rank', 'master_metadata_track_name': 'Track Name', 'points': 'Points Awarded'}, inplace=True)
                
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