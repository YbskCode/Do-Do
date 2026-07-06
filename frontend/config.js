// Railway backend URL (Railway → Do-Do → Settings → Networking → Public Domain)
const API_BASE_URL = "https://do-do-production.up.railway.app";

function apiUrl(path) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${API_BASE_URL}${normalized}`;
}
