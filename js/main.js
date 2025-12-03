// js/main.js

import { processSpotifyZip } from './store.js';
import { showLoading, hideLoading, renderUI, populateWrappedFilter, renderWrappedContent } from './ui.js';
import { setupGame } from './game.js';
import * as podcasts from './podcasts.js';

document.addEventListener('DOMContentLoaded', () => {
    // References
    const uploadSection = document.getElementById('upload-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const zipInput = document.getElementById('zip-input');
    const uploadButton = document.getElementById('upload-button');
    const applyFilterBtn = document.getElementById('apply-filter-btn');
    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');
    const wrappedYearFilter = document.getElementById('wrapped-year-filter');

    const artistFilter = document.getElementById('artist-filter');
    const albumFilter = document.getElementById('album-filter');
    const trackFilter = document.getElementById('track-filter');

    window.spotifyData = {
        full: [],
        filtered: []
    };

    // --- EVENT HANDLERS ---
    uploadButton.addEventListener('click', () => zipInput.click());

    zipInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        showLoading('Unzipping and processing files...');
        try {
            const data = await processSpotifyZip(file);
            window.spotifyData.full = data;
            window.spotifyData.filtered = data;

            uploadSection.classList.add('hidden');
            dashboardSection.classList.remove('hidden');

            setupDateFilters(data);
            populateOtherFilters(data);
            
            setupTabNavigation();
            setupGame();
            populateWrappedFilter();

            wrappedYearFilter.addEventListener('change', renderWrappedContent);

            // --- FIXED: Render Initial UI ---
            renderUI(); // Renders Music Charts
            podcasts.renderPodcastUI(data); // Renders Podcast Charts

        } catch (error) {
            console.error('Failed to process Spotify data:', error);
            alert(`Error: ${error.message}`);
        } finally {
            hideLoading();
        }
    });

    // --- FIXED: Single Filter Function ---
    // We remove the separate listener for applyFilterBtn and just use the unified function
    // But if you want a manual button, keep it:
    applyFilterBtn.addEventListener('click', applyAllFilters);

    // Auto-apply filters on change
    // artistFilter.addEventListener('change', applyAllFilters);
    // albumFilter.addEventListener('change', applyAllFilters);
    // trackFilter.addEventListener('change', applyAllFilters);
    // dateFromInput.addEventListener('change', applyAllFilters); // Add this!
    // dateToInput.addEventListener('change', applyAllFilters);   // Add this!


    function setupTabNavigation() {
        const tabLinks = document.querySelectorAll('.tab-link');
        const tabContents = document.querySelectorAll('.tab-content');

        tabLinks.forEach(link => {
            link.addEventListener('click', () => {
                const tabId = link.getAttribute('data-tab');
                tabLinks.forEach(item => item.classList.remove('active'));
                tabContents.forEach(item => item.classList.remove('active'));
                link.classList.add('active');
                document.getElementById(tabId).classList.add('active');
            });
        });
    }

    function setupDateFilters(data) {
        if (data.length > 0) {
            // Ensure sorting happens here if not guaranteed by store.js
            // const sorted = [...data].sort((a,b) => new Date(a.date) - new Date(b.date));
            const firstDate = data[0].date;
            const lastDate = data[data.length - 1].date;

            dateFromInput.min = firstDate;
            dateFromInput.max = lastDate;
            dateFromInput.value = firstDate;
            
            dateToInput.min = firstDate;
            dateToInput.max = lastDate;
            dateToInput.value = lastDate;
        }
    }

    function populateOtherFilters(data) {
        // Optimization: Use Sets directly
        const uniqueArtists = [...new Set(data.map(d => d.artistName).filter(Boolean))].sort();
        const uniqueAlbums = [...new Set(data.map(d => d.albumName).filter(Boolean))].sort();
        const uniqueTracks = [...new Set(data.map(d => d.trackName).filter(Boolean))].sort();

        artistFilter.innerHTML = '<option value="">All Artists</option>' + uniqueArtists.map(a => `<option value="${a}">${a}</option>`).join('');
        albumFilter.innerHTML = '<option value="">All Albums</option>' + uniqueAlbums.map(a => `<option value="${a}">${a}</option>`).join('');
        trackFilter.innerHTML = '<option value="">All Tracks</option>' + uniqueTracks.map(t => `<option value="${t}">${t}</option>`).join('');
    }

    // --- FIXED: applyAllFilters ---
    function applyAllFilters() {
        showLoading('Applying filters...');
        
        // Use a small timeout to allow the Loading Spinner to render before the heavy loop
        setTimeout(() => {
            const from = dateFromInput.value;
            const to = dateToInput.value;
            const selectedArtist = artistFilter.value;
            const selectedAlbum = albumFilter.value;
            const selectedTrack = trackFilter.value;

            window.spotifyData.filtered = window.spotifyData.full.filter(d => {
                const date = d.date; // Ensure format matches input (YYYY-MM-DD)
                
                // Date Filter
                if (from && date < from) return false;
                if (to && date > to) return false;
                
                // Metadata Filters
                if (selectedArtist && d.artistName !== selectedArtist) return false;
                if (selectedAlbum && d.albumName !== selectedAlbum) return false;
                if (selectedTrack && d.trackName !== selectedTrack) return false;
                
                return true;
            });

            // 1. Render General Music Charts
            renderUI(); 

            // 2. Render Podcast Charts with the NEW filtered data
            podcasts.renderPodcastUI(window.spotifyData.filtered); 

            hideLoading();
        }, 50); // 50ms delay
    }
});