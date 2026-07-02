const MOTIVATIONAL_QUOTES = [
    "Başarı, her gün tekrarlanan küçük çabaların toplamıdır.",
    "Bugün çalış, yarın rahat et.",
    "Disiplin, hedefler ile başarı arasındaki köprüdür.",
    "Her pomodoro, hayallerine atılan bir adımdır.",
    "Odaklan, çalış, başar — pes etme.",
    "Büyük hedefler, küçük ve düzenli adımlarla kazanılır.",
    "Çalışkanlık, yeteneğin en güvenilir yol arkadaşıdır.",
    "Her gün biraz daha iyi ol — bu yeterli.",
    "Azim, zor günlerde seni ayakta tutan güçtür.",
    "Düzenli çalışma, en büyük farkı yaratan alışkanlıktır.",
    "Kendine inan; geri kalanı emekle gelir.",
    "Bugünkü fedakarlık, yarının özgürlüğüdür."
];

function showMotivationalQuote() {
    const quoteElement = document.getElementById("motivationalQuote");
    if (!quoteElement || MOTIVATIONAL_QUOTES.length === 0) {
        return;
    }

    const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
    quoteElement.textContent = `"${MOTIVATIONAL_QUOTES[randomIndex]}"`;
}

document.addEventListener("DOMContentLoaded", showMotivationalQuote);
