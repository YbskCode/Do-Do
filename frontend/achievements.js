/**
 * Achievements card + modal (directing.html) and unlock toasts elsewhere.
 * Exposes window.DoDoAchievements.check() for pomodoro / buddies / tasks.
 */
(() => {
    const guestMode = typeof isGuestSession === "function" && isGuestSession();

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text == null ? "" : text;
        return div.innerHTML;
    }

    function showUnlockToasts(newlyUnlocked) {
        if (!Array.isArray(newlyUnlocked) || newlyUnlocked.length === 0) return;

        newlyUnlocked.forEach((item, index) => {
            setTimeout(() => {
                const message = `Achievement unlocked: ${item.title}`;
                if (typeof DoDoNotify !== "undefined" && typeof DoDoNotify.showToast === "function") {
                    DoDoNotify.showToast(message, "fa-medal");
                } else {
                    console.log(message);
                }
            }, index * 600);
        });
    }

    async function checkAchievements() {
        if (guestMode || !localStorage.getItem("authToken")) return [];
        if (typeof DoDoPresence === "undefined") return [];

        try {
            const response = await DoDoPresence.authFetch(apiUrl("/achievements/check"), {
                method: "POST"
            });
            const data = await DoDoPresence.parseJsonResponse(response);
            if (!response.ok) return [];

            const newlyUnlocked = data.newlyUnlocked || [];
            showUnlockToasts(newlyUnlocked);

            const countEl = document.getElementById("achievementsUnlockedCount");
            const totalEl = document.getElementById("achievementsTotalCount");
            if (countEl && typeof data.unlockedCount === "number") {
                countEl.textContent = data.unlockedCount;
            }
            if (totalEl && typeof data.totalCount === "number") {
                totalEl.textContent = data.totalCount;
            }

            return newlyUnlocked;
        } catch (err) {
            console.error("Failed to check achievements:", err);
            return [];
        }
    }

    function categoryLabel(category) {
        const map = {
            focus: "Focus",
            social: "Social",
            streak: "Streak",
            tasks: "Tasks"
        };
        return map[category] || "General";
    }

    function renderAchievementsList(achievements, listEl) {
        const list = listEl || document.getElementById("achievementsList");
        if (!list) return;

        if (!achievements.length) {
            list.innerHTML = '<p class="buddy-empty">No achievements yet.</p>';
            return;
        }

        list.innerHTML = achievements.map((item) => {
            const pct = item.progress?.target
                ? Math.round((item.progress.current / item.progress.target) * 100)
                : (item.unlocked ? 100 : 0);
            const progressText = item.unlocked
                ? "Unlocked"
                : `${item.progress.current} / ${item.progress.target}`;

            return `
                <article class="achievement-item ${item.unlocked ? "achievement-item--unlocked" : "achievement-item--locked"}">
                    <div class="achievement-icon" aria-hidden="true">
                        <i class="fa-solid ${escapeHtml(item.icon || "fa-medal")}"></i>
                    </div>
                    <div class="achievement-body">
                        <div class="achievement-title-row">
                            <strong>${escapeHtml(item.title)}</strong>
                            <span class="achievement-category">${escapeHtml(categoryLabel(item.category))}</span>
                        </div>
                        <p class="achievement-desc">${escapeHtml(item.description)}</p>
                        <div class="achievement-progress" aria-label="Progress ${progressText}">
                            <div class="achievement-progress-bar">
                                <span style="width: ${pct}%"></span>
                            </div>
                            <span class="achievement-progress-label">${escapeHtml(progressText)}</span>
                        </div>
                    </div>
                </article>
            `;
        }).join("");
    }

    async function fetchUserAchievements(userId) {
        if (!localStorage.getItem("authToken") || typeof DoDoPresence === "undefined") {
            throw new Error("Not authenticated");
        }
        const response = await DoDoPresence.authFetch(apiUrl(`/achievements/user/${userId}`));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (!response.ok) {
            throw new Error(data.message || "Failed to load achievements");
        }
        return data;
    }

    async function loadAchievementsModal() {
        const spinner = document.getElementById("achievementsLoadingSpinner");
        const body = document.getElementById("achievementsModalBody");
        const guestPrompt = document.getElementById("achievementsGuestPrompt");

        if (guestMode) {
            if (spinner) spinner.style.display = "none";
            if (body) body.style.display = "none";
            if (guestPrompt) guestPrompt.style.display = "flex";
            return;
        }

        if (guestPrompt) guestPrompt.style.display = "none";
        if (spinner) spinner.style.display = "flex";
        if (body) body.style.display = "none";

        try {
            const response = await DoDoPresence.authFetch(apiUrl("/achievements"));
            const data = await DoDoPresence.parseJsonResponse(response);
            if (!response.ok) {
                throw new Error(data.message || "Failed to load achievements");
            }

            const countEl = document.getElementById("achievementsUnlockedCount");
            const totalEl = document.getElementById("achievementsTotalCount");
            const modalCount = document.getElementById("modalAchievementsCount");
            if (countEl) countEl.textContent = data.unlockedCount || 0;
            if (totalEl) totalEl.textContent = data.totalCount || 0;
            if (modalCount) {
                modalCount.textContent = `${data.unlockedCount || 0} / ${data.totalCount || 0} unlocked`;
            }

            renderAchievementsList(data.achievements || []);
            showUnlockToasts(data.newlyUnlocked || []);

            if (spinner) spinner.style.display = "none";
            if (body) body.style.display = "block";
        } catch (err) {
            console.error(err);
            if (spinner) {
                spinner.innerHTML = `
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>Could not load achievements.</p>
                `;
            }
        }
    }

    async function loadSummary() {
        const countEl = document.getElementById("achievementsUnlockedCount");
        const totalEl = document.getElementById("achievementsTotalCount");
        if (!countEl || !totalEl) return;

        if (guestMode || !localStorage.getItem("authToken")) {
            countEl.textContent = "0";
            totalEl.textContent = "—";
            return;
        }

        try {
            const response = await DoDoPresence.authFetch(apiUrl("/achievements"));
            const data = await DoDoPresence.parseJsonResponse(response);
            if (!response.ok) return;
            countEl.textContent = data.unlockedCount || 0;
            totalEl.textContent = data.totalCount || 0;
            showUnlockToasts(data.newlyUnlocked || []);
        } catch (err) {
            console.error("Failed to load achievement summary:", err);
        }
    }

    function wireModal() {
        const openBtn = document.getElementById("openAchievementsBtn");
        const modal = document.getElementById("achievementsModal");
        const closeBtn = document.getElementById("closeAchievementsBtn");
        const loginBtn = document.getElementById("achievementsLoginBtn");

        if (!openBtn || !modal) return;

        function openModal() {
            modal.style.display = "flex";
            loadAchievementsModal();
        }

        function closeModal() {
            modal.style.display = "none";
        }

        openBtn.addEventListener("click", openModal);
        if (closeBtn) closeBtn.addEventListener("click", closeModal);
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModal();
        });
        if (loginBtn) {
            loginBtn.addEventListener("click", () => {
                window.location.href = "login.html";
            });
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        wireModal();
        loadSummary();
    });

    window.DoDoAchievements = {
        check: checkAchievements,
        loadSummary,
        renderList: renderAchievementsList,
        fetchUserAchievements
    };
})();
