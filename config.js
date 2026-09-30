/**
 * CONFIGURAÇÕES GERAIS (Administrador / GitHub Pages)
 * Aqui você controla propagandas e temporizadores.
 */
const CONFIG = {
    // Lista de propagandas (imagens ou vídeos embed do YouTube).
    // Deixe o array vazio [] para desativar as propagandas.
    anuncios: [
        { tipo: "imagem", url: "https://picsum.photos/800/450?random=1" },
        { tipo: "youtube", url: "https://www.youtube.com/embed/tgbNymZ7vqY?autoplay=1&controls=0&mute=1" },
        { tipo: "imagem", url: "https://picsum.photos/800/450?random=2" }
    ],
    
    // Duração da propaganda em segundos
    anuncioDuracaoSegundos: 5, 
    
    // Duração do cronômetro de transição (countdown) para o próximo cantor em segundos
    tempoCountdownSegundos: 10  
};
