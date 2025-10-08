// js/main.js

import { processSpotifyZip } from './store.js';
import { showLoading, hideLoading, renderUI, populateWrappedFilter, renderWrappedContent } from './ui.js';
import { setupGame } from './game.js';

document.addEventListener('DOMContentLoaded', () => {
    // Referencias al DOM
    const uploadSection = document.getElementById('upload-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const zipInput = document.getElementById('zip-input');
    const uploadButton = document.getElementById('upload-button');
    const applyFilterBtn = document.getElementById('apply-filter-btn');
    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');
    const wrappedYearFilter = document.getElementById('wrapped-year-filter');

    // NUEVAS REFERENCIAS A LOS FILTROS
    const artistFilter = document.getElementById('artist-filter');
    const albumFilter = document.getElementById('album-filter');
    const trackFilter = document.getElementById('track-filter');

    // Estado global de la aplicación
    window.spotifyData = {
        full: [],
        filtered: []
    };

    // --- MANEJADORES DE EVENTOS ---
    uploadButton.addEventListener('click', () => zipInput.click());

    zipInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        showLoading('Unzipping and processing files (this may take a moment)...');
        try {
            const data = await processSpotifyZip(file);
            window.spotifyData.full = data;
            window.spotifyData.filtered = data;

            uploadSection.classList.add('hidden');
            dashboardSection.classList.remove('hidden');

            // Configurar la UI por primera vez
            setupDateFilters(data);
            populateOtherFilters(data);
            renderUI();
            setupTabNavigation();
            setupGame();
            populateWrappedFilter();

            wrappedYearFilter.addEventListener('change', renderWrappedContent);


            const podcastStats = podcasts.analyzePodcasts(data);
            if (podcastStats) {
                podcasts.renderTopShowsChart(podcastStats.topShows);
                podcasts.renderTopEpisodesChart(podcastStats.topEpisodes);
                podcasts.renderPodcastTimeByDay(podcastStats.podcastData);
            }

        } catch (error) {
            console.error('Failed to process Spotify data:', error);
            alert(`Error: ${error.message}`);
        } finally {
            hideLoading();
        }
    });

    applyFilterBtn.addEventListener('click', () => {
        applyAllFilters(); // USAMOS UNA FUNCIÓN PARA APLICAR TODOS LOS FILTROS
    });

    // MANEJADORES DE CAMBIO PARA LOS NUEVOS FILTROS (APLICAR FILTRO INMEDIATAMENTE)
    artistFilter.addEventListener('change', applyAllFilters);
    albumFilter.addEventListener('change', applyAllFilters);
    trackFilter.addEventListener('change', applyAllFilters);


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
            // Asumiendo que `data` ya está ordenado por fecha
            const firstDate = data[0].date;
            const lastDate = data[data.length - 1].date;

            dateFromInput.min = firstDate;
            dateFromInput.max = lastDate;
            dateFromInput.value = firstDate; // Establecer valor inicial

            dateToInput.min = firstDate;
            dateToInput.max = lastDate;
            dateToInput.value = lastDate; // Establecer valor inicial
        }
    }

    // NUEVA FUNCIÓN PARA POPULAR LOS FILTROS DE ARTISTA, ÁLBUM Y CANCIÓN
    function populateOtherFilters(data) {
        const uniqueArtists = [...new Set(data.map(d => d.artistName).filter(Boolean))].sort();
        const uniqueAlbums = [...new Set(data.map(d => d.albumName).filter(Boolean))].sort();
        const uniqueTracks = [...new Set(data.map(d => d.trackName).filter(Boolean))].sort();

        artistFilter.innerHTML = '<option value="">All Artists</option>' + uniqueArtists.map(artist => `<option value="${artist}">${artist}</option>`).join('');
        albumFilter.innerHTML = '<option value="">All Albums</option>' + uniqueAlbums.map(album => `<option value="${album}">${album}</option>`).join('');
        trackFilter.innerHTML = '<option value="">All Tracks</option>' + uniqueTracks.map(track => `<option value="${track}">${track}</option>`).join('');
    }

    // NUEVA FUNCIÓN PARA APLICAR TODOS LOS FILTROS
    function applyAllFilters() {
        showLoading('Applying filters...');
        const from = dateFromInput.value;
        const to = dateToInput.value;
        const selectedArtist = artistFilter.value;
        const selectedAlbum = albumFilter.value;
        const selectedTrack = trackFilter.value;

        window.spotifyData.filtered = window.spotifyData.full.filter(d => {
            const date = d.date;
            if (from && date < from) return false;
            if (to && date > to) return false;
            if (selectedArtist && d.artistName !== selectedArtist) return false;
            if (selectedAlbum && d.albumName !== selectedAlbum) return false;
            if (selectedTrack && d.trackName !== selectedTrack) return false;
            return true;
        });

        renderUI();
        hideLoading();
    }
});