/**
 * Daily streak counter + details modal (used on directing.html).
 * Pomodoro completions still record streaks via pomodoroScripts.js.
 */
(() => {
    const guestMode = typeof isGuestSession === "function" && isGuestSession();

    function formatLocalDate(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function updateStreakDisplay(currentStreak) {
        const display = document.getElementById("currentStreakDisplay");
        if (display) {
            display.textContent = currentStreak;
        }
    }

    async function loadStreak() {
        if (guestMode || !localStorage.getItem("authToken")) return null;
        if (typeof DoDoPresence === "undefined") return null;

        try {
            const response = await DoDoPresence.authFetch(apiUrl("/streak"));
            const data = await DoDoPresence.parseJsonResponse(response);
            if (!response.ok) return null;
            updateStreakDisplay(data.currentStreak);
            return data;
        } catch (err) {
            console.error("Failed to load streak:", err);
            return null;
        }
    }

    function formatDisplayDate(date) {
        return date.toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
        });
    }

    function buildCalendarWeeks(today, weeksToShow) {
        const rangeStart = new Date(today);
        rangeStart.setDate(rangeStart.getDate() - (weeksToShow * 7 - 1));

        const gridStart = new Date(rangeStart);
        while (gridStart.getDay() !== 0) {
            gridStart.setDate(gridStart.getDate() - 1);
        }

        const gridEnd = new Date(today);
        while (gridEnd.getDay() !== 6) {
            gridEnd.setDate(gridEnd.getDate() + 1);
        }

        const weeks = [];
        const cursor = new Date(gridStart);

        while (cursor <= gridEnd) {
            const week = [];
            for (let i = 0; i < 7; i++) {
                week.push(new Date(cursor));
                cursor.setDate(cursor.getDate() + 1);
            }
            weeks.push(week);
        }

        return { weeks, rangeStart, today };
    }

    function renderMonthLabels(weeks, monthContainer, today, rangeStart) {
        monthContainer.innerHTML = "";

        const labeledMonths = new Set();
        let lastLabelWeekIndex = -Infinity;
        let isFirstInRangeWeek = true;
        const MIN_WEEKS_BETWEEN_LABELS = 3;

        weeks.forEach((week, weekIndex) => {
            const cell = document.createElement("div");
            cell.className = "heatmapMonthCell";

            const inRangeDays = week.filter(
                (date) => date <= today && date >= rangeStart
            );

            if (inRangeDays.length === 0) {
                monthContainer.appendChild(cell);
                return;
            }

            const monthStartDay = week.find(
                (date) =>
                    date.getDate() === 1 &&
                    date <= today &&
                    date >= rangeStart
            );

            let labelDate = null;

            if (monthStartDay) {
                labelDate = monthStartDay;
            } else if (isFirstInRangeWeek) {
                labelDate = inRangeDays[0];
            }

            isFirstInRangeWeek = false;

            if (labelDate) {
                const monthKey = `${labelDate.getFullYear()}-${labelDate.getMonth()}`;
                const weeksSinceLastLabel = weekIndex - lastLabelWeekIndex;
                const hasEnoughSpace =
                    monthStartDay || weeksSinceLastLabel >= MIN_WEEKS_BETWEEN_LABELS;

                if (!labeledMonths.has(monthKey) && hasEnoughSpace) {
                    labeledMonths.add(monthKey);
                    lastLabelWeekIndex = weekIndex;

                    cell.classList.add("hasLabel");
                    const label = document.createElement("span");
                    label.textContent = labelDate.toLocaleString(undefined, {
                        month: "short"
                    });
                    cell.appendChild(label);
                }
            }

            monthContainer.appendChild(cell);
        });
    }

    function positionHeatmapInfoCard(card, cell) {
        const rect = cell.getBoundingClientRect();
        card.style.left = `${rect.left + rect.width / 2}px`;
        card.style.top = `${rect.top - 10}px`;
        card.style.transform = "translate(-50%, -100%)";
    }

    function attachHeatmapInfoCard(cell, date, hasActivity) {
        const card = document.getElementById("heatmapInfoCard");
        if (!card) return;

        cell.addEventListener("mouseenter", () => {
            card.innerHTML = `
                <strong>${formatDisplayDate(date)}</strong>
                <span>${hasActivity ? "Pomodoro completed" : "No activity"}</span>
            `;
            card.style.display = "block";
            positionHeatmapInfoCard(card, cell);
        });

        cell.addEventListener("mousemove", () => {
            positionHeatmapInfoCard(card, cell);
        });

        cell.addEventListener("mouseleave", () => {
            card.style.display = "none";
        });
    }

    function hideHeatmapInfoCard() {
        const card = document.getElementById("heatmapInfoCard");
        if (card) {
            card.style.display = "none";
        }
    }

    function renderHeatmap(activityDates) {
        const heatmap = document.getElementById("streakHeatmap");
        const monthLabels = document.getElementById("heatmapMonthLabels");
        if (!heatmap || !monthLabels) return;

        hideHeatmapInfoCard();

        const activitySet = new Set(activityDates || []);
        const weeksToShow = 26;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { weeks, rangeStart } = buildCalendarWeeks(today, weeksToShow);
        rangeStart.setHours(0, 0, 0, 0);
        renderMonthLabels(weeks, monthLabels, today, rangeStart);

        heatmap.innerHTML = "";

        weeks.forEach((week) => {
            const weekCol = document.createElement("div");
            weekCol.className = "heatmapWeek";

            week.forEach((date) => {
                const cell = document.createElement("span");
                cell.className = "heatmapCell";

                const inRange = date >= rangeStart && date <= today;
                if (!inRange) {
                    cell.classList.add("outOfRange");
                } else {
                    cell.classList.add("inRange");
                    const dateStr = formatLocalDate(date);
                    const hasActivity = activitySet.has(dateStr);

                    if (hasActivity) {
                        cell.classList.add("active");
                    }

                    attachHeatmapInfoCard(cell, date, hasActivity);
                }

                weekCol.appendChild(cell);
            });

            heatmap.appendChild(weekCol);
        });
    }

    async function openStreakModal() {
        const modal = document.getElementById("streakModal");
        const spinner = document.getElementById("streakLoadingSpinner");
        const body = document.getElementById("streakModalBody");

        if (!modal || !spinner || !body) return;

        modal.style.display = "flex";
        spinner.style.display = "flex";
        body.style.display = "none";

        const data = await loadStreak();

        spinner.style.display = "none";
        body.style.display = "block";

        if (!data) return;

        const currentDisplay = document.getElementById("modalCurrentStreak");
        const longestDisplay = document.getElementById("modalLongestStreak");

        if (currentDisplay) {
            currentDisplay.textContent = `${data.currentStreak} day${data.currentStreak === 1 ? "" : "s"}`;
        }
        if (longestDisplay) {
            longestDisplay.textContent = `${data.longestStreak} day${data.longestStreak === 1 ? "" : "s"}`;
        }

        renderHeatmap(data.activityDates);
    }

    function initStreakUi() {
        const streakContainer = document.querySelector(".streakContainer");
        if (!streakContainer) return;

        if (guestMode || !localStorage.getItem("authToken")) {
            streakContainer.style.display = "none";
            return;
        }

        streakContainer.style.display = "";
        loadStreak();

        const openStreakBtn = document.getElementById("openStreakDetailsBtn");
        const closeStreakBtn = document.getElementById("closeStreakBtn");
        const streakModal = document.getElementById("streakModal");

        if (openStreakBtn && closeStreakBtn && streakModal) {
            openStreakBtn.addEventListener("click", (e) => {
                e.preventDefault();
                openStreakModal();
            });

            closeStreakBtn.addEventListener("click", () => {
                hideHeatmapInfoCard();
                streakModal.style.display = "none";
            });

            streakModal.addEventListener("click", (e) => {
                if (e.target === streakModal) {
                    hideHeatmapInfoCard();
                    streakModal.style.display = "none";
                }
            });

            const heatmapScroll = document.querySelector(".heatmapCalendarInner");
            if (heatmapScroll) {
                heatmapScroll.addEventListener("scroll", hideHeatmapInfoCard);
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initStreakUi);
    } else {
        initStreakUi();
    }
})();
