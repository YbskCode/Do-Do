const darkModeToggle = document.getElementById("darkModeBtn");

// Apply saved preference on page load
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
}

if (darkModeToggle) {
    darkModeToggle.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");

        // Save preference
        if (document.body.classList.contains("dark-mode")) {
            localStorage.setItem("theme", "dark");
            darkModeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            localStorage.setItem("theme", "light");
            darkModeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
    });

    // Set correct icon on load
    if (savedTheme === "dark") {
        darkModeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
}