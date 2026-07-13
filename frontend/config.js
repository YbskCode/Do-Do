// Railway backend URL (Railway → Do-Do → Settings → Networking → Public Domain)
const API_BASE_URL = "https://do-do-production.up.railway.app";

const GUEST_FLAG_KEY = "isGuest";
const GUEST_TASKS_KEY = "guestTasks";

function apiUrl(path) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${API_BASE_URL}${normalized}`;
}

function isGuestSession() {
    return localStorage.getItem(GUEST_FLAG_KEY) === "true";
}

function getGuestTasks() {
    try {
        const raw = localStorage.getItem(GUEST_TASKS_KEY);
        const tasks = raw ? JSON.parse(raw) : [];
        return Array.isArray(tasks) ? tasks : [];
    } catch (e) {
        console.error("Failed to parse guest tasks:", e);
        return [];
    }
}

function saveGuestTasks(tasks) {
    localStorage.setItem(GUEST_TASKS_KEY, JSON.stringify(tasks));
}

function clearGuestSession() {
    localStorage.removeItem(GUEST_FLAG_KEY);
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("authToken");
}
