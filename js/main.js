import { processSpotifyZip } from './store.js';
import { showLoading, hideLoading, renderUI, populateWrappedFilter } from './ui.js';
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
            renderUI();
            setupTabNavigation();
            setupGame();
            populateWrappedFilter();

        } catch (error) {
            console.error('Failed to process Spotify data:', error);
            alert(`Error: ${error.message}`);
        } finally {
            hideLoading();
        }
    });

    applyFilterBtn.addEventListener('click', () => {
        const from = dateFromInput.value;
        const to = dateToInput.value;

        window.spotifyData.filtered = window.spotifyData.full.filter(d => {
            const date = d.date;
            if (from && date < from) return false;
            if (to && date > to) return false;
            return true;
        });
        
        // Vuelve a renderizar toda la UI con los datos filtrados
        renderUI();
    });

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
            dateFromInput.min = data[0].date;
            dateFromInput.max = data[data.length - 1].date;
            dateToInput.min = data[0].date;
            dateToInput.max = data[data.length - 1].date;
        }
    }
});