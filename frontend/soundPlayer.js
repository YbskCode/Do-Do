const soundSelect = document.getElementById("soundSelect");
const soundToggleBtn = document.getElementById("soundToggleBtn");

let currentAudio = null;
let isPlaying = false;

if (soundToggleBtn && soundSelect) {
    soundToggleBtn.addEventListener("click", () => {
        const selectedSound = soundSelect.value;

        // If nothing selected, alert user
        if (!selectedSound) {
            alert("Please select a sound first!");
            return;
        }

        if (isPlaying) {
            // Stop the sound
            currentAudio.pause();
            currentAudio.currentTime = 0;
            isPlaying = false;
            soundToggleBtn.innerHTML = '<i class="fa-solid fa-play"></i> Play';
        } else {
            // Stop previous sound if switching
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }

            // Play new sound
            currentAudio = new Audio(selectedSound);
            currentAudio.loop = true;
            currentAudio.play();
            isPlaying = true;
            soundToggleBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop';
        }
    });

    // When user changes sound while playing, switch automatically
    soundSelect.addEventListener("change", () => {
        if (isPlaying) {
            currentAudio.pause();
            currentAudio.currentTime = 0;

            currentAudio = new Audio(soundSelect.value);
            currentAudio.loop = true;
            currentAudio.play();
        }
    });
}