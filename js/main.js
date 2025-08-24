import { processSpotifyZip } from './store.js';
import { showLoading, hideLoading, renderUI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    // Referencias al DOM
    const uploadSection = document.getElementById('upload-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const zipInput = document.getElementById('zip-input');
    const uploadButton = document.getElementById('upload-button');
    
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

        showLoading('Unzipping and processing files...');
        try {
            const data = await processSpotifyZip(file);
            window.spotifyData.full = data;
            window.spotifyData.filtered = data;

            uploadSection.classList.add('hidden');
            dashboardSection.classList.remove('hidden');
            
            renderUI(); // Renderiza toda la UI por primera vez
            setupTabNavigation(); // Configura la navegación por pestañas

        } catch (error) {
            console.error('Failed to process Spotify data:', error);
            alert(`Error: ${error.message}`);
        } finally {
            hideLoading();
        }
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
});