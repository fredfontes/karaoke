/**
 * LÓGICA PRINCIPAL DO APLICATIVO (Karaoke.top)
 */
let currentSession = "";
let queue = [];
let isHost = false;

window.onload = () => {
    // Verifica se a URL possui o parâmetro ?session=
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');

    if (sessionParam) {
        // Modo Convidado: entra direto na tela de adicionar música
        currentSession = sessionParam;
        document.getElementById('guest-session-title').innerText = currentSession;
        showScreen('screen-guest');
        document.getElementById('subtitle').innerText = "Adicione sua música à fila";

        loadQueueFromLocal();
        renderGuestQueue();
        setInterval(() => {
            loadQueueFromLocal();
            renderGuestQueue();
        }, 2000);
    } else {
        // Modo Anfitrião: tela inicial de criar sessão
        showScreen('screen-create');
    }
};

// Sincroniza instantaneamente as listas entre abas do navegador quando o localStorage for alterado
window.addEventListener('storage', (event) => {
    if (event.key === `karaoke_queue_${currentSession}`) {
        loadQueueFromLocal();
        renderQueue();
        renderGuestQueue();
    }
});

/**
 * Alterna a visibilidade das telas principais
 */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

/**
 * Cria uma nova sessão (Anfitrião)
 */
function createSession() {
    const inputName = document.getElementById('session-name').value.trim();
    if (!inputName) {
        alert("Por favor, digite um nome para a sessão.");
        return;
    }

    currentSession = inputName.replace(/\s+/g, '-').toLowerCase(); 
    isHost = true;
    queue = [];
    saveQueueToLocal();

    const newUrl = `${window.location.origin}${window.location.pathname}?session=${currentSession}`;
    window.history.pushState({ session: currentSession }, '', newUrl);

    setupHostPanel();
}

/**
 * Prepara a tela de controle do Anfitrião, QR Code e escuta a fila
 */
function setupHostPanel() {
    showScreen('screen-panel');
    document.getElementById('subtitle').innerText = "Painel de Controle: " + currentSession;

    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?session=${currentSession}`;
    document.getElementById('session-url-text').innerText = shareUrl;

    // Gera o QR Code com a URL compartilhável
    document.getElementById('qrcode-container').innerHTML = ""; 
    new QRCode(document.getElementById("qrcode-container"), {
        text: shareUrl,
        width: 180,
        height: 180,
        colorDark : "#0f172a",
        colorLight : "#ffffff",
    });

    renderQueue();

    // Atualiza a fila periodicamente a partir do localStorage
    setInterval(() => {
        loadQueueFromLocal();
        renderQueue();
    }, 2000);
}

/**
 * Adiciona música à fila (Convidado)
 */
function addSongToQueue() {
    const guestName = document.getElementById('guest-name').value.trim();
    const songName = document.getElementById('song-name').value.trim();

    if (!guestName || !songName) {
        alert("Preencha seu nome e a música.");
        return;
    }

    loadQueueFromLocal(); 
    queue.push({ singer: guestName, song: songName });
    saveQueueToLocal();

    document.getElementById('guest-name').value = "";
    document.getElementById('song-name').value = "";
    document.getElementById('guest-feedback').style.display = "block";

    // Atualiza imediatamente a playlist na tela local e no painel do anfitrião
    renderGuestQueue();
    renderQueue();

    setTimeout(() => { 
        document.getElementById('guest-feedback').style.display = "none"; 
    }, 4000);
}

/**
 * Salva a fila no localStorage
 */
function saveQueueToLocal() {
    localStorage.setItem(`karaoke_queue_${currentSession}`, JSON.stringify(queue));
}

/**
 * Carrega a fila do localStorage
 */
function loadQueueFromLocal() {
    const saved = localStorage.getItem(`karaoke_queue_${currentSession}`);
    if (saved) {
        queue = JSON.parse(saved);
    }
}

/**
 * Renderiza os itens da fila na tela do anfitrião
 */
function renderQueue() {
    if (!isHost) return;

    const container = document.getElementById('queue-container');
    const btnPlay = document.getElementById('btn-play-current');
    container.innerHTML = "";

    if (queue.length === 0) {
        container.innerHTML = `<div class="queue-item">Nenhuma música na fila. Escaneie o QR Code!</div>`;
        btnPlay.disabled = true;
        return;
    }

    btnPlay.disabled = false;

    queue.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'queue-item';
        div.innerHTML = `
            <div>
                <div class="singer-name">${index === 0 ? "🎤 Atual: " : (index + 1) + ". "}${item.singer}</div>
                <div class="song-name">${item.song}</div>
            </div>
        `;
        if (index === 0) div.style.borderLeft = "4px solid var(--accent-color)";
        container.appendChild(div);
    });
}

/**
 * Renderiza os itens da fila na tela do convidado
 */
function renderGuestQueue() {
    const container = document.getElementById('guest-queue-container');
    if (!container) return;

    container.innerHTML = "";

    if (queue.length === 0) {
        container.innerHTML = `<div class="queue-item">Nenhuma música na fila ainda. Seja o primeiro a pedir!</div>`;
        return;
    }

    queue.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'queue-item';
        div.innerHTML = `
            <div>
                <div class="singer-name">${index === 0 ? "🎤 A cantar agora: " : (index + 1) + ". "}${item.singer}</div>
                <div class="song-name">${item.song}</div>
            </div>
        `;
        if (index === 0) div.style.borderLeft = "4px solid var(--accent-color)";
        container.appendChild(div);
    });
}

/**
 * Abre a busca no YouTube para a música atual da fila
 */
function playCurrentSong() {
    if (queue.length === 0) return;
    const current = queue[0];
    const searchQuery = encodeURIComponent(`${current.song} karaoke`);
    window.open(`https://www.youtube.com/results?search_query=${searchQuery}`, '_blank');
}

/**
 * Avança para o próximo cantor na fila
 */
function nextSinger() {
    if (queue.length === 0) return;

    queue.shift();
    saveQueueToLocal();
    renderQueue();

    if (queue.length > 0) {
        processTransition();
    } else {
        alert("A fila acabou! Aguardando novos pedidos.");
    }
}

/**
 * Processa a transição (Anúncio -> Countdown)
 */
function processTransition() {
    if (typeof CONFIG !== 'undefined' && CONFIG.anuncios && CONFIG.anuncios.length > 0) {
        showAd();
    } else {
        showCountdown();
    }
}

/**
 * Exibe tela cheia de propaganda aleatória
 */
function showAd() {
    const overlayAd = document.getElementById('overlay-ad');
    const adContent = document.getElementById('ad-content');
    const adTimerLabel = document.getElementById('ad-timer');

    const randomAd = CONFIG.anuncios[Math.floor(Math.random() * CONFIG.anuncios.length)];

    if (randomAd.tipo === "imagem") {
        adContent.innerHTML = `<img src="${randomAd.url}" class="ad-image">`;
    } else if (randomAd.tipo === "youtube") {
        adContent.innerHTML = `<iframe src="${randomAd.url}" class="ad-video" allow="autoplay; encrypted-media"></iframe>`;
    }

    overlayAd.classList.remove('hidden');

    let timeLeft = CONFIG.anuncioDuracaoSegundos || 5;
    adTimerLabel.innerText = timeLeft;

    const interval = setInterval(() => {
        timeLeft--;
        adTimerLabel.innerText = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(interval);
            overlayAd.classList.add('hidden');
            adContent.innerHTML = "";
            showCountdown();
        }
    }, 1000);
}

/**
 * Exibe a contagem regressiva para o próximo cantor
 */
function showCountdown() {
    const overlayCountdown = document.getElementById('overlay-countdown');
    const numberLabel = document.getElementById('countdown-number');

    const nextPerson = queue[0];
    document.getElementById('countdown-singer').innerText = nextPerson.singer;
    document.getElementById('countdown-song').innerText = nextPerson.song;

    overlayCountdown.classList.remove('hidden');

    let timeLeft = (typeof CONFIG !== 'undefined' && CONFIG.tempoCountdownSegundos) ? CONFIG.tempoCountdownSegundos : 10;
    numberLabel.innerText = timeLeft;

    const interval = setInterval(() => {
        timeLeft--;
        numberLabel.innerText = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(interval);
            overlayCountdown.classList.add('hidden');
        }
    }, 1000);
}
