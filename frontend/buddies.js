const goBackBtn = document.getElementById("goBackBtn");
const addBuddyForm = document.getElementById("addBuddyForm");
const buddyIdentifierInput = document.getElementById("buddyIdentifierInput");
const addBuddyBtn = document.getElementById("addBuddyBtn");
const requestsSection = document.getElementById("requestsSection");
const requestsList = document.getElementById("requestsList");
const buddiesList = document.getElementById("buddiesList");
const showPresenceToggle = document.getElementById("showPresenceToggle");
const showTaskNameToggle = document.getElementById("showTaskNameToggle");
const showOnLeaderboardToggle = document.getElementById("showOnLeaderboardToggle");
const savePrivacyBtn = document.getElementById("savePrivacyBtn");
const myUsername = document.getElementById("myUsername");
const myFriendCode = document.getElementById("myFriendCode");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardChampions = document.getElementById("leaderboardChampions");
const leaderboardWeekLabel = document.getElementById("leaderboardWeekLabel");
const leaderboardHiddenNote = document.getElementById("leaderboardHiddenNote");
const leaderboardModal = document.getElementById("leaderboardModal");
const openLeaderboardBtn = document.getElementById("openLeaderboardBtn");
const closeLeaderboardBtn = document.getElementById("closeLeaderboardBtn");
const buddyAchievementsModal = document.getElementById("buddyAchievementsModal");
const closeBuddyAchievementsBtn = document.getElementById("closeBuddyAchievementsBtn");
const buddyAchievementsTitle = document.getElementById("buddyAchievementsTitle");
const buddyAchievementsCount = document.getElementById("buddyAchievementsCount");
const buddyAchievementsList = document.getElementById("buddyAchievementsList");
const buddyAchievementsLoadingSpinner = document.getElementById("buddyAchievementsLoadingSpinner");
const buddyAchievementsModalBody = document.getElementById("buddyAchievementsModalBody");

let buddyPollTimer = null;
let currentBuddies = [];

function openLeaderboardModal() {
    if (!leaderboardModal) return;
    leaderboardModal.style.display = "flex";
    loadLeaderboard();
}

function closeLeaderboardModal() {
    if (!leaderboardModal) return;
    leaderboardModal.style.display = "none";
    if (window.location.hash === "#leaderboard" || window.location.hash === "#leaderboardSection") {
        history.replaceState(null, "", window.location.pathname + window.location.search);
    }
}

async function openBuddyAchievementsModal(userId, buddyName) {
    if (!buddyAchievementsModal) return;

    buddyAchievementsModal.style.display = "flex";
    if (buddyAchievementsTitle) {
        buddyAchievementsTitle.textContent = buddyName
            ? `${buddyName}'s Achievements`
            : "Buddy Achievements";
    }
    if (buddyAchievementsCount) {
        buddyAchievementsCount.textContent = "Loading...";
    }
    if (buddyAchievementsLoadingSpinner) {
        buddyAchievementsLoadingSpinner.style.display = "flex";
        buddyAchievementsLoadingSpinner.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            <p>Loading achievements...</p>
        `;
    }
    if (buddyAchievementsModalBody) buddyAchievementsModalBody.style.display = "none";

    try {
        if (typeof DoDoAchievements === "undefined") {
            throw new Error("Achievements module not loaded");
        }
        const data = await DoDoAchievements.fetchUserAchievements(userId);
        if (buddyAchievementsTitle && data.user?.name) {
            buddyAchievementsTitle.textContent = `${data.user.name}'s Achievements`;
        }
        if (buddyAchievementsCount) {
            buddyAchievementsCount.textContent =
                `${data.unlockedCount || 0} / ${data.totalCount || 0} unlocked`;
        }
        DoDoAchievements.renderList(data.achievements || [], buddyAchievementsList);
        if (buddyAchievementsLoadingSpinner) buddyAchievementsLoadingSpinner.style.display = "none";
        if (buddyAchievementsModalBody) buddyAchievementsModalBody.style.display = "block";
    } catch (err) {
        console.error(err);
        if (buddyAchievementsLoadingSpinner) {
            buddyAchievementsLoadingSpinner.style.display = "flex";
            buddyAchievementsLoadingSpinner.innerHTML = `
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>${escapeHtml(err.message || "Could not load achievements.")}</p>
            `;
        }
        if (buddyAchievementsCount) buddyAchievementsCount.textContent = "";
    }
}

function closeBuddyAchievementsModal() {
    if (!buddyAchievementsModal) return;
    buddyAchievementsModal.style.display = "none";
}

if (goBackBtn) {
    goBackBtn.addEventListener("click", () => {
        window.location.href = "directing.html";
    });
}

function formatUserTag(user) {
    return `@${user.username}`;
}

function formatUserMeta(user) {
    return `${formatUserTag(user)} · #${user.friendCode}`;
}

function statusClass(status) {
    return `buddy-status buddy-status--${status || "offline"}`;
}

function formatStatusLabel(buddy) {
    const label = DoDoPresence.STATUS_LABELS[buddy.status] || "Offline";
    if (buddy.status === "focusing" && buddy.currentTaskName) {
        return `${label} · ${buddy.currentTaskName}`;
    }
    if (buddy.sessionEndsAt && (buddy.status === "focusing" || buddy.status === "on_break")) {
        const ends = new Date(buddy.sessionEndsAt);
        const mins = Math.max(0, Math.ceil((ends - Date.now()) / 60000));
        return `${label} · ${mins}m left`;
    }
    return label;
}

function renderBuddies(buddies) {
    if (!buddies.length) {
        buddiesList.innerHTML = '<li class="buddy-empty">No study buddies yet. Add someone by username or friend code!</li>';
        return;
    }

    buddiesList.innerHTML = buddies.map((buddy) => `
        <li class="buddy-item">
            <div class="buddy-info">
                <span class="${statusClass(buddy.status)}" title="${DoDoPresence.STATUS_LABELS[buddy.status]}"></span>
                <div>
                    <strong>${escapeHtml(buddy.name)}</strong>
                    <span class="buddy-meta">${escapeHtml(formatUserMeta(buddy))}</span>
                    <span class="buddy-status-text">${escapeHtml(formatStatusLabel(buddy))}</span>
                </div>
            </div>
            <div class="buddy-actions">
                <button class="buddy-message-btn" data-user-id="${buddy.id}" title="Message">
                    <i class="fa-solid fa-comment"></i>
                </button>
                <button class="buddy-achievements-btn" data-user-id="${buddy.id}"
                    data-name="${escapeHtml(buddy.name)}" title="View achievements">
                    <i class="fa-solid fa-medal"></i>
                </button>
                <button class="buddy-remove-btn" data-user-id="${buddy.id}" title="Remove buddy">
                    <i class="fa-solid fa-user-minus"></i>
                </button>
            </div>
        </li>
    `).join("");

    buddiesList.querySelectorAll(".buddy-message-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            window.location.href = `messages.html?user=${btn.dataset.userId}`;
        });
    });

    buddiesList.querySelectorAll(".buddy-achievements-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            openBuddyAchievementsModal(btn.dataset.userId, btn.dataset.name);
        });
    });

    buddiesList.querySelectorAll(".buddy-remove-btn").forEach((btn) => {
        btn.addEventListener("click", () => removeBuddy(btn.dataset.userId));
    });
}

function renderRequests(requests) {
    if (!requests.length) {
        requestsSection.style.display = "none";
        requestsList.innerHTML = "";
        return;
    }

    requestsSection.style.display = "block";
    requestsList.innerHTML = requests.map((req) => `
        <li class="buddy-item">
            <div class="buddy-info">
                <div>
                    <strong>${escapeHtml(req.name)}</strong>
                    <span class="buddy-meta">${escapeHtml(formatUserMeta(req))}</span>
                </div>
            </div>
            <div class="buddy-request-actions">
                <button class="buddy-accept-btn" data-request-id="${req.id}">Accept</button>
                <button class="buddy-decline-btn" data-request-id="${req.id}">Decline</button>
            </div>
        </li>
    `).join("");

    requestsList.querySelectorAll(".buddy-accept-btn").forEach((btn) => {
        btn.addEventListener("click", () => respondToRequest(btn.dataset.requestId, "accept"));
    });
    requestsList.querySelectorAll(".buddy-decline-btn").forEach((btn) => {
        btn.addEventListener("click", () => respondToRequest(btn.dataset.requestId, "decline"));
    });
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

async function loadMyProfile() {
    const cached = JSON.parse(localStorage.getItem("loggedInUser") || "null");
    if (cached?.username) {
        myUsername.textContent = `@${cached.username}`;
        myFriendCode.textContent = cached.friendCode || "—";
    }

    try {
        const response = await DoDoPresence.authFetch(apiUrl("/users/me"));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (response.ok) {
            myUsername.textContent = `@${data.username}`;
            myFriendCode.textContent = data.friendCode;
            if (cached) {
                localStorage.setItem("loggedInUser", JSON.stringify({
                    ...cached,
                    username: data.username,
                    friendCode: data.friendCode
                }));
            }
        }
    } catch (err) {
        console.error("Failed to load profile:", err);
    }
}

async function loadBuddies() {
    try {
        const response = await DoDoPresence.authFetch(apiUrl("/buddies"));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (response.ok) {
            currentBuddies = data;
            renderBuddies(data);
        }
    } catch (err) {
        console.error("Failed to load buddies:", err);
    }
}

async function loadRequests() {
    try {
        const response = await DoDoPresence.authFetch(apiUrl("/buddies/requests"));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (response.ok) {
            renderRequests(data);
        }
    } catch (err) {
        console.error("Failed to load requests:", err);
    }
}

function formatShortDate(isoDate) {
    if (!isoDate) return "";
    const [y, m, d] = isoDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMinutes(minutes) {
    const value = Number(minutes) || 0;
    if (value >= 60) {
        const hours = Math.floor(value / 60);
        const mins = value % 60;
        return mins ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${value}m`;
}

function renderLeaderboard(data) {
    if (!leaderboardList) return;

    if (leaderboardWeekLabel && data.weekStart && data.weekEnd) {
        leaderboardWeekLabel.textContent =
            `${formatShortDate(data.weekStart)} – ${formatShortDate(data.weekEnd)}`;
    }

    if (leaderboardHiddenNote) {
        leaderboardHiddenNote.style.display = data.showOnLeaderboard === false ? "block" : "none";
    }

    if (leaderboardChampions) {
        const most = data.champions?.mostFocused;
        const longest = data.champions?.longestStreak;
        const chips = [];

        if (most && (most.totalFocusMinutes || 0) > 0) {
            chips.push(`
                <div class="leaderboard-champ ${most.isMe ? "leaderboard-champ--me" : ""}">
                    <span class="leaderboard-champ-label"><i class="fa-solid fa-clock"></i> Most focused</span>
                    <strong>${escapeHtml(most.name)}${most.isMe ? " (you)" : ""}</strong>
                    <span class="buddy-meta">@${escapeHtml(most.username)} · ${formatMinutes(most.totalFocusMinutes)} all-time</span>
                </div>
            `);
        }
        if (longest && (longest.longestStreak || 0) > 0) {
            chips.push(`
                <div class="leaderboard-champ ${longest.isMe ? "leaderboard-champ--me" : ""}">
                    <span class="leaderboard-champ-label"><i class="fa-solid fa-fire"></i> Longest streak</span>
                    <strong>${escapeHtml(longest.name)}${longest.isMe ? " (you)" : ""}</strong>
                    <span class="buddy-meta">@${escapeHtml(longest.username)} · ${longest.longestStreak} day${longest.longestStreak === 1 ? "" : "s"}</span>
                </div>
            `);
        }
        leaderboardChampions.innerHTML = chips.join("");
    }

    const rankings = data.rankings || [];
    if (!rankings.length) {
        leaderboardList.innerHTML =
            '<li class="buddy-empty">Add buddies and complete pomodoros to fill the board.</li>';
        return;
    }

    leaderboardList.innerHTML = rankings.map((entry) => `
        <li class="leaderboard-row ${entry.isMe ? "leaderboard-row--me" : ""}">
            <span class="leaderboard-rank">#${entry.rank}</span>
            <div class="leaderboard-info">
                <strong>${escapeHtml(entry.name)}${entry.isMe ? " (you)" : ""}</strong>
                <span class="buddy-meta">@${escapeHtml(entry.username)}</span>
            </div>
            <div class="leaderboard-stats">
                <span class="leaderboard-stat" title="Focus minutes this week">
                    <i class="fa-solid fa-clock"></i> ${formatMinutes(entry.weeklyFocusMinutes)}
                </span>
                <span class="leaderboard-stat" title="Current streak">
                    <i class="fa-solid fa-fire"></i> ${entry.currentStreak}
                </span>
            </div>
        </li>
    `).join("");
}

async function loadLeaderboard() {
    if (!leaderboardList) return;
    try {
        const response = await DoDoPresence.authFetch(apiUrl("/leaderboard/buddies"));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (!response.ok) {
            leaderboardList.innerHTML =
                `<li class="buddy-empty">${escapeHtml(data.message || "Could not load leaderboard.")}</li>`;
            return;
        }
        renderLeaderboard(data);
    } catch (err) {
        console.error("Failed to load leaderboard:", err);
        leaderboardList.innerHTML =
            '<li class="buddy-empty">Could not load leaderboard. Check your connection.</li>';
    }
}

async function loadPrivacySettings() {
    try {
        const response = await DoDoPresence.authFetch(apiUrl("/presence/settings"));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (response.ok) {
            showPresenceToggle.checked = data.showPresence;
            showTaskNameToggle.checked = data.showTaskName;
            if (showOnLeaderboardToggle) {
                showOnLeaderboardToggle.checked = data.showOnLeaderboard !== false;
            }
        }
    } catch (err) {
        console.error("Failed to load privacy settings:", err);
    }
}

async function refreshAll() {
    await Promise.all([loadBuddies(), loadRequests(), loadLeaderboard()]);
}

// Allow the global notification widget to refresh this page after actions
window.loadBuddyData = refreshAll;

if (addBuddyForm) {
    addBuddyForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const identifier = buddyIdentifierInput.value.trim();
        if (!identifier) return;

        addBuddyBtn.disabled = true;
        addBuddyBtn.textContent = "Sending...";

        try {
            const response = await DoDoPresence.authFetch(apiUrl("/buddies/request"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier })
            });
            const data = await DoDoPresence.parseJsonResponse(response);

            if (!response.ok) {
                alert(data.message || "Could not send request");
                return;
            }

            buddyIdentifierInput.value = "";
            alert("Friend request sent!");
            await refreshAll();
        } catch (err) {
            console.error(err);
            alert("Could not reach the server. Check your connection and that the backend is deployed.");
        } finally {
            addBuddyBtn.disabled = false;
            addBuddyBtn.textContent = "Send Request";
        }
    });
}

async function respondToRequest(requestId, action) {
    try {
        const response = await DoDoPresence.authFetch(apiUrl(`/buddies/requests/${requestId}/${action}`), {
            method: "PUT"
        });
        if (response.ok) {
            await refreshAll();
            if (action === "accept" && typeof DoDoAchievements !== "undefined") {
                DoDoAchievements.check();
            }
        }
    } catch (err) {
        console.error(err);
    }
}

async function removeBuddy(userId) {
    if (!confirm("Remove this study buddy?")) return;

    try {
        const response = await DoDoPresence.authFetch(apiUrl(`/buddies/${userId}`), {
            method: "DELETE"
        });
        if (response.ok) {
            await refreshAll();
        }
    } catch (err) {
        console.error(err);
    }
}

if (savePrivacyBtn) {
    savePrivacyBtn.addEventListener("click", async () => {
        savePrivacyBtn.disabled = true;
        try {
            const response = await DoDoPresence.authFetch(apiUrl("/presence/settings"), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    showPresence: showPresenceToggle.checked,
                    showTaskName: showTaskNameToggle.checked,
                    showOnLeaderboard: showOnLeaderboardToggle
                        ? showOnLeaderboardToggle.checked
                        : true
                })
            });
            if (response.ok) {
                savePrivacyBtn.textContent = "Saved!";
                setTimeout(() => { savePrivacyBtn.textContent = "Save Privacy Settings"; }, 1500);
                await loadLeaderboard();
            }
        } catch (err) {
            console.error(err);
        } finally {
            savePrivacyBtn.disabled = false;
        }
    });
}

if (openLeaderboardBtn) {
    openLeaderboardBtn.addEventListener("click", openLeaderboardModal);
}
if (closeLeaderboardBtn) {
    closeLeaderboardBtn.addEventListener("click", closeLeaderboardModal);
}
if (leaderboardModal) {
    leaderboardModal.addEventListener("click", (event) => {
        if (event.target === leaderboardModal) closeLeaderboardModal();
    });
}
if (closeBuddyAchievementsBtn) {
    closeBuddyAchievementsBtn.addEventListener("click", closeBuddyAchievementsModal);
}
if (buddyAchievementsModal) {
    buddyAchievementsModal.addEventListener("click", (event) => {
        if (event.target === buddyAchievementsModal) closeBuddyAchievementsModal();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    if (!localStorage.getItem("authToken") || (typeof isGuestSession === "function" && isGuestSession())) {
        window.location.href = typeof isGuestSession === "function" && isGuestSession()
            ? "directing.html"
            : "login.html";
        return;
    }

    DoDoPresence.startHeartbeat();
    loadMyProfile();
    loadPrivacySettings();
    refreshAll();
    buddyPollTimer = setInterval(refreshAll, 20000);

    const hash = window.location.hash;
    if (hash === "#leaderboard" || hash === "#leaderboardSection") {
        openLeaderboardModal();
    }
});

window.addEventListener("beforeunload", () => {
    if (buddyPollTimer) clearInterval(buddyPollTimer);
});
