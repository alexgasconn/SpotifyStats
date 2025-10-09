// js/podcasts.js

Chart.register(ChartDataLabels);

let topShowsChart = null;
let topEpisodesChart = null;
let podcastTimelineChart = null;


let currentPodcastTimelineUnit = 'week';


export function analyzePodcasts(fullData) {
    console.log('[Podcasts] Total entries received:', fullData.length);

    const rawPodcastData = fullData.filter(d => {
        return d.episodeName != null &&
               d.episodeName !== '' &&
               d.episodeShowName != null &&
               d.episodeShowName !== '';
    });

    console.log('[Podcasts] Entries identified as podcasts:', rawPodcastData.length);

    if (rawPodcastData.length === 0) {
        return { topShows: [], topEpisodes: [], podcastData: [] };
    }

    const podcastData = rawPodcastData.map(d => {
        const tsStr = d.ts || d.endTime || d.timestamp || null;
        const tsDate = tsStr ? new Date(tsStr) : null;
        const isValidDate = tsDate && !isNaN(tsDate.getTime());

        const durationMin = Number(d.msPlayed ?? d.durationMs ?? 0) / 60000;

        return {
            ...d,
            durationMin,
            year: isValidDate ? tsDate.getFullYear() : null,
            month: isValidDate ? tsDate.getMonth() : null,
            date: isValidDate ? tsDate.toISOString().split('T')[0] : null,
            ts: isValidDate ? tsDate.toISOString() : null
        };
    }).filter(d => d.durationMin > 0 && d.date);

    const showMap = {};
    podcastData.forEach(d => {
        const show = d.episodeShowName || 'Unknown Show';
        const minutes = d.durationMin;

        if (!showMap[show]) {
            showMap[show] = { minutes: 0, episodes: {}, episodeCount: 0 };
        }
        showMap[show].minutes += minutes;

        const ep = d.episodeName || 'Unknown Episode';
        if (!showMap[show].episodes[ep]) {
            showMap[show].episodes[ep] = 0;
            showMap[show].episodeCount++;
        }
        showMap[show].episodes[ep] += minutes;
    });

    const topShows = Object.entries(showMap)
        .map(([name, info]) => ({
            name,
            minutes: info.minutes,
            episodeCount: info.episodeCount,
            episodes: info.episodes
        }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10);

    console.log('[Podcasts] Top Shows:', topShows);

    const allEpisodes = [];
    Object.entries(showMap).forEach(([showName, info]) => {
        Object.entries(info.episodes).forEach(([epName, minutes]) => {
            allEpisodes.push({
                show: showName,
                name: epName,
                minutes
            });
        });
    });
    const topEpisodes = allEpisodes
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10);

    console.log('[Podcasts] Top Episodes:', topEpisodes);

    return { topShows, topEpisodes, podcastData };
}

// --- Opciones comunes para texto blanco ---
const whiteTextOptions = {
    color: '#fff',
    title: { color: '#fff' },
    ticks: { color: '#fff' },
    grid: { color: 'rgba(255,255,255,0.2)' }
};

export function renderTopShowsChart(topShows) {
    const canvas = document.getElementById('topShowsChart');
    if (!canvas) return console.error('[Podcasts] Canvas element "topShowsChart" not found');

    const ctx = canvas.getContext('2d');
    if (topShowsChart) topShowsChart.destroy();

    if (topShows.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('No podcast data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    const labels = topShows.map(s => {
        const name = s.name.length > 30 ? s.name.substring(0, 30) + '...' : s.name;
        return `${name} (${s.episodeCount} eps)`;
    });

    topShowsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Minutes Listened',
                data: topShows.map(s => Math.round(s.minutes)),
                backgroundColor: 'rgba(30, 215, 96, 0.8)',
                borderColor: 'rgba(30, 215, 96, 1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false, labels: { color: '#fff' }, datalabels: false },
                tooltip: {
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function(context) {
                            const show = topShows[context.dataIndex];
                            const hours = Math.floor(show.minutes / 60);
                            const mins = Math.round(show.minutes % 60);
                            return [`Time: ${hours}h ${mins}m`, `Episodes: ${show.episodeCount}`];
                        }
                    }
                }
            },
            scales: {
                x: { ...whiteTextOptions, title: { ...whiteTextOptions.title, text: 'Minutes' } },
                y: { ...whiteTextOptions }
            }
        }
    });
}

export function renderTopEpisodesChart(topEpisodes) {
    const canvas = document.getElementById('topEpisodesChart');
    if (!canvas) return console.error('[Podcasts] Canvas element "topEpisodesChart" not found');

    const ctx = canvas.getContext('2d');
    if (topEpisodesChart) topEpisodesChart.destroy();

    if (topEpisodes.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('No episode data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    const labels = topEpisodes.map(e => {
        const epName = e.name.length > 40 ? e.name.substring(0, 40) + '...' : e.name;
        const showName = e.show.length > 20 ? e.show.substring(0, 20) + '...' : e.show;
        return `${epName} (${showName})`;
    });

    topEpisodesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Minutes Listened',
                data: topEpisodes.map(e => Math.round(e.minutes)),
                backgroundColor: 'rgba(29, 185, 84, 0.8)',
                borderColor: 'rgba(29, 185, 84, 1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false, labels: { color: '#fff' }, datalabels: false },
                tooltip: {
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function(context) {
                            const episode = topEpisodes[context.dataIndex];
                            const hours = Math.floor(episode.minutes / 60);
                            const mins = Math.round(episode.minutes % 60);
                            return [`Time: ${hours}h ${mins}m`, `Show: ${episode.show}`];
                        }
                    }
                }
            },
            scales: {
                x: { ...whiteTextOptions, title: { ...whiteTextOptions.title, text: 'Minutes' } },
                y: { ...whiteTextOptions }
            }
        }
    });
}

// --- RENDER DE TIMELINE ---
export function renderPodcastTimeByDay(podcastData) {
    const canvas = document.getElementById('podcastTimelineChart');
    if (!canvas) return console.error('[Podcasts] Canvas element "podcastTimelineChart" not found');

    const ctx = canvas.getContext('2d');
    if (podcastTimelineChart) podcastTimelineChart.destroy();

    if (!podcastData.length) {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.font = '16px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('No timeline data available', canvas.width/2, canvas.height/2);
        return;
    }

    const timeMap = {};
    podcastData.forEach(d => {
        if (!d.date) return;
        let key;
        switch(currentPodcastTimelineUnit) {
            case 'year': key = d.year != null ? String(d.year) : null; break;
            case 'month': key = d.year != null && d.month != null ? `${d.year}-${String(d.month+1).padStart(2,'0')}` : null; break;
            case 'week': key = getStartOfWeek(new Date(d.date)); break;
            case 'day':
            default: key = d.date; break;
        }
        if (!key) return;
        if (!timeMap[key]) timeMap[key] = 0;
        timeMap[key] += d.durationMin;
    });

    const sortedData = Object.entries(timeMap)
        .sort((a,b)=>a[0].localeCompare(b[0]))
        .map(([date,minutes])=>({date, minutes: Math.round(minutes)}));

    const labels = sortedData.map(d => formatDateLabel(d.date, currentPodcastTimelineUnit));
    const data = sortedData.map(d=>d.minutes);

    podcastTimelineChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets:[{ label:'Minutes', data, borderColor:'rgba(30,215,96,1)', backgroundColor:'rgba(30,215,96,0.1)', borderWidth:2, fill:true, tension:0.4 }] },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                legend:{ display:false, labels:{color:'#fff'}, datalabels: false },
                title:{ display:true, text:`Podcast Listening Over Time (${currentPodcastTimelineUnit})`, font:{size:16,weight:'bold'}, color:'#fff' },
                tooltip:{
                    titleColor:'#fff',
                    bodyColor:'#fff',
                    callbacks:{ label: ctx=> { const val = ctx.parsed.y ?? 0; const h=Math.floor(val/60); const m=Math.round(val%60); return `${h}h ${m}m`; } }
                }
            },
            scales:{ y:{...whiteTextOptions, title:{...whiteTextOptions.title, text:'Minutes'}}, x:{...whiteTextOptions, ticks:{...whiteTextOptions.ticks, maxRotation:45, minRotation:45}} }
        }
    });
}

// --- BOTONES DE TIMELINE ---
export function setupPodcastTimelineControls(podcastData) {
    const controls = ['day','week','month','year'];
    const container = document.getElementById('podcastTimelineControls');
    if (!container) return console.error('[Podcasts] Timeline controls container not found');

    container.innerHTML = '';
    controls.forEach(ctrl=>{
        const button = document.createElement('button');
        button.textContent = ctrl.charAt(0).toUpperCase()+ctrl.slice(1);
        button.className='timeline-btn';
        button.dataset.unit = ctrl;
        if(ctrl==='week') button.classList.add('active'); // default

        button.addEventListener('click', ()=>{
            currentPodcastTimelineUnit = button.dataset.unit;
            container.querySelectorAll('.timeline-btn').forEach(b=>b.classList.remove('active'));
            button.classList.add('active');
            renderPodcastTimeByDay(podcastData);
        });

        container.appendChild(button);
    });
}

// --- FUNCIONES AUXILIARES ---
function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function formatDateLabel(dateStr, unit) {
    const date = new Date(dateStr);
    switch(unit){
        case 'year': return dateStr;
        case 'month': return date.toLocaleDateString('en-US',{year:'numeric', month:'short'});
        case 'week': return date.toLocaleDateString('en-US',{month:'short', day:'numeric'});
        case 'day':
        default: return date.toLocaleDateString('en-US',{month:'short', day:'numeric'});
    }
}


export function renderPodcastStats(podcastDataArray) {
    // Ensure we got an array
    if (!Array.isArray(podcastDataArray)) {
        console.error('[Podcasts] podcastDataArray is not an array:', podcastDataArray);
        podcastDataArray = [];
    }

    const container = document.getElementById('podcastStatsGrid');
    if (!container) {
        console.error('[Podcasts] Stats grid container "podcastStatsGrid" not found');
        return;
    }

    // Clear previous stats
    container.innerHTML = '';
    console.log('[Podcasts] renderPodcastStats: Called. podcastData length:', podcastDataArray.length);

    if (podcastDataArray.length === 0) {
        container.innerHTML = '<p style="color:#fff; text-align:center;">No podcast data available to show stats.</p>';
        console.warn('[Podcasts] renderPodcastStats: No podcast data available, displaying message.');
        return;
    }

    // Total listening time
    const totalMinutes = podcastDataArray.reduce((acc, d) => acc + (d.durationMin || 0), 0);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = Math.round(totalMinutes % 60);

    // Unique shows and episodes
    const uniqueShows = new Set();
    const uniqueEpisodes = new Set();
    const totalEpisodesListened = podcastDataArray.length;

    podcastDataArray.forEach(d => {
        const showName = d.episodeShowName || 'Unknown Show';
        const episodeName = d.episodeName || 'Unknown Episode';
        uniqueShows.add(showName);
        uniqueEpisodes.add(`${showName} - ${episodeName}`);
    });

    const numberOfUniqueShows = uniqueShows.size;
    const numberOfUniqueEpisodes = uniqueEpisodes.size;

    // First and last listen dates
    const sortedDates = podcastDataArray
        .map(d => new Date(d.ts))
        .filter(d => !isNaN(d))
        .sort((a, b) => a - b);

    const firstListenDate = sortedDates.length > 0 ? sortedDates[0] : null;
    const lastListenDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;

    const formatDate = date => date
        ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : 'N/A';

    // Stats array
    const stats = [
        { title: 'Total Listening Time', value: `${totalHours}h ${remainingMinutes}m` },
        { title: 'Unique Shows Listened', value: numberOfUniqueShows },
        { title: 'Unique Episodes', value: numberOfUniqueEpisodes, subText: `(Total Listens: ${totalEpisodesListened})` },
        { title: 'First Listen', value: formatDate(firstListenDate) },
        { title: 'Last Listen', value: formatDate(lastListenDate) }
    ];

    // Append stat items
    stats.forEach(stat => {
        const statItem = document.createElement('div');
        statItem.className = 'stat-item';
        statItem.innerHTML = `
            <h3>${stat.title}</h3>
            <p>${stat.value}</p>
            ${stat.subText ? `<p class="small-text">${stat.subText}</p>` : ''}
        `;
        container.appendChild(statItem);
    });
}




// --- FUNCIÓN PARA RENDER COMPLETO ---
export function renderPodcastUI(fullData){
    const { topShows, topEpisodes, podcastData } = analyzePodcasts(fullData);
    renderPodcastStats(podcastData);
    renderTopShowsChart(topShows);
    renderTopEpisodesChart(topEpisodes);
    setupPodcastTimelineControls(podcastData);
    renderPodcastTimeByDay(podcastData);
    
}