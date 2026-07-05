const allTimersDisplays = document.querySelectorAll('.timer-display');
const allButtons = document.querySelectorAll('button[id$="-session"]');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const alarmSound = document.getElementById('alarm-sound');
const stopAlarmBtn = document.getElementById('stop-alarm-btn');
const taskSelect = document.getElementById("activeTaskSelect");
const taskTimeDisplay = document.getElementById("taskTimeDisplay")
const timeSpentValue = document.getElementById("timeSpentValue");

const goBackBtn = document.getElementById("goBackBtn");

if (goBackBtn) {
    goBackBtn.addEventListener("click", () => {
        // This mimics the browser's "Back" button
        window.location.href = "directing.html"
    });
}

//Get the current user to find their specific tasks
let currentUser = null;
try {
    currentUser = JSON.parse(localStorage.getItem("loggedInUser"));
} catch (e) {
    console.error("Error parsing loggedInUser from localStorage:", e);
    localStorage.removeItem("loggedInUser");
}

// Wrapper around fetch that attaches the auth token and handles expired sessions
async function authFetch(url, options = {}) {
    const token = localStorage.getItem("authToken");
    const headers = { ...(options.headers || {}), "Authorization": `Bearer ${token}` };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        localStorage.removeItem("loggedInUser");
        localStorage.removeItem("authToken");
        window.location.href = "login.html";
    }
    return response;
}

let timerInterval = null;
let isRunning = false;
let endTime = null;

let currentTimerElement = document.getElementById('pomodoro-timer');
let timeLeft = parseInt(currentTimerElement.dataset.duration) * 60;

const POMODORO_MIN_MINUTES = 25;
const BREAK_MIN_MINUTES = 5;
const POMODORO_DURATION_KEY = 'pomodoroDurationMinutes';
const BREAK_DURATION_KEY = 'breakDurationMinutes';

const editDurationBtn = document.getElementById('editDurationBtn');
const durationModal = document.getElementById('durationModal');
const durationModalTitle = document.getElementById('durationModalTitle');
const durationModalInput = document.getElementById('durationModalInput');
const durationModalError = document.getElementById('durationModalError');
const closeDurationBtn = document.getElementById('closeDurationBtn');
const saveDurationBtn = document.getElementById('saveDurationBtn');

function getMinDurationForTimer(timerId) {
    return timerId === 'pomodoro-timer' ? POMODORO_MIN_MINUTES : BREAK_MIN_MINUTES;
}

function getStorageKeyForTimer(timerId) {
    return timerId === 'pomodoro-timer' ? POMODORO_DURATION_KEY : BREAK_DURATION_KEY;
}

function clampDuration(minutes, timerId) {
    const min = getMinDurationForTimer(timerId);
    const parsed = parseInt(minutes, 10);
    if (Number.isNaN(parsed)) return min;
    return Math.max(min, parsed);
}

function setTimerDuration(timerId, minutes) {
    const timerEl = document.getElementById(timerId);
    if (!timerEl) return;

    const validMinutes = clampDuration(minutes, timerId);
    timerEl.dataset.duration = validMinutes;
    localStorage.setItem(getStorageKeyForTimer(timerId), validMinutes);

    if (currentTimerElement.id === timerId && !isRunning) {
        timeLeft = validMinutes * 60;
        updateDisplay(timeLeft);
    }
}

function loadSavedDurations() {
    const savedPomodoro = localStorage.getItem(POMODORO_DURATION_KEY);
    const savedBreak = localStorage.getItem(BREAK_DURATION_KEY);

    setTimerDuration('pomodoro-timer', savedPomodoro ?? POMODORO_MIN_MINUTES);
    setTimerDuration('break-timer', savedBreak ?? BREAK_MIN_MINUTES);
}

function hideDurationModalError() {
    if (!durationModalError) return;
    durationModalError.style.display = 'none';
    durationModalError.textContent = '';
}

function showDurationModalError(message) {
    if (!durationModalError) return;
    durationModalError.textContent = message;
    durationModalError.style.display = 'block';
}

function openDurationModal() {
    if (!durationModal || !durationModalInput || isRunning) return;

    const isPomodoro = currentTimerElement.id === 'pomodoro-timer';
    const min = getMinDurationForTimer(currentTimerElement.id);
    const currentMinutes = parseInt(currentTimerElement.dataset.duration, 10);

    if (durationModalTitle) {
        durationModalTitle.textContent = isPomodoro ? 'Edit Pomodoro' : 'Edit Break';
    }

    durationModalInput.min = min;
    durationModalInput.value = currentMinutes;
    hideDurationModalError();
    durationModal.style.display = 'flex';
    durationModalInput.focus();
    durationModalInput.select();
}

function closeDurationModal() {
    if (!durationModal) return;
    durationModal.style.display = 'none';
    hideDurationModalError();
}

function saveDurationFromModal() {
    if (!durationModalInput || isRunning) return;

    const min = getMinDurationForTimer(currentTimerElement.id);
    const entered = parseInt(durationModalInput.value, 10);

    if (Number.isNaN(entered) || entered < min) {
        showDurationModalError(`Minimum ${min} minutes`);
        return;
    }

    setTimerDuration(currentTimerElement.id, entered);
    closeDurationModal();
}

function setEditDurationEnabled(enabled) {
    if (editDurationBtn) {
        editDurationBtn.disabled = !enabled;
    }
}

loadSavedDurations();

if (editDurationBtn) {
    editDurationBtn.addEventListener('click', openDurationModal);
}

if (closeDurationBtn) {
    closeDurationBtn.addEventListener('click', closeDurationModal);
}

if (saveDurationBtn) {
    saveDurationBtn.addEventListener('click', saveDurationFromModal);
}

if (durationModal) {
    durationModal.addEventListener('click', (e) => {
        if (e.target === durationModal) {
            closeDurationModal();
        }
    });
}

if (durationModalInput) {
    durationModalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveDurationFromModal();
        }
    });
}


//Load tasks into the dropdown
async function loadTasksIntoDropdown() {
    if (!currentUser) {
        return;
    }

    taskSelect.disabled = true;
    taskSelect.innerHTML = '<option value="">Loading tasks...</option>';

    try {
        const response = await authFetch(`http://localhost:3000/tasks`);
        const savedTasks = await response.json();

        // Clear existing options
        taskSelect.innerHTML = '<option value="">-- No Task Selected --</option>';

        savedTasks.forEach(task => {
            if (task.task_archived || task.task_completed) return;

            const option = document.createElement("option");
            option.value = task.id; // 👈 now using database ID instead of array index
            option.textContent = task.task_name; // 👈 updated field name
            option.dataset.timeSpent = task.time_spent; // 👈 updated field name

            taskSelect.appendChild(option);
        });

    } catch (err) {
        console.error("Failed to load tasks into dropdown:", err);
    } finally {
        // Always re-enable dropdown when done
        taskSelect.disabled = false;
    }
};

loadTasksIntoDropdown();

taskSelect.addEventListener("change", (e) => {
    const selectedOption = taskSelect.options[taskSelect.selectedIndex];

    if (taskSelect.value === "") {
        //If they select the default, hide the time
        taskTimeDisplay.style.display = "none";
    } else {
        //Show the time spent for the chosen task
        taskTimeDisplay.style.display = "block";

        //Grab the time data we attached to the option
        const minutesSpent = selectedOption.dataset.timeSpent || 0;
        timeSpentValue.textContent = minutesSpent;
    }
});

async function addTimeToSelectedTask() {
    const selectedTaskId = taskSelect.value;

    if (selectedTaskId === "") return;
    if (!currentUser) return;

    const minutesCompleted = parseInt(currentTimerElement.dataset.duration);

    // Get current time spent from the selected option
    const selectedOption = taskSelect.options[taskSelect.selectedIndex];
    const currentTimeSpent = parseInt(selectedOption.dataset.timeSpent) || 0;
    const newTimeSpent = currentTimeSpent + minutesCompleted;



    try {
        // Update time_spent in database
        await authFetch(`http://localhost:3000/tasks/${selectedTaskId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                task_name: selectedOption.textContent,
                task_completed: false,
                time_spent: newTimeSpent
            })
        });

        // Refresh dropdown
        await loadTasksIntoDropdown();

        // Keep the same task selected
        taskSelect.value = selectedTaskId;

        // Update the time display
        if (timeSpentValue) {
            timeSpentValue.textContent = newTimeSpent;
        }

    } catch (err) {
        console.error("Failed to update time:", err);
    }
}

/**
 * Updates the text content of the currently active timer display.
 * @param {number} timeInSeconds - The time to display.
 */
function updateDisplay(timeInSeconds) {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;

    // Add leading zeros (e.g., "5:9" becomes "05:09")
    const formattedTime =
        `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    currentTimerElement.textContent = formattedTime;

    // Tab Title Feature for #5 issue. 
    document.title = `(${formattedTime}) Do!Do!`;
}


/**
 * Stops any running timer and resets the display buttons' text.
 */
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    isRunning = false;
    startButton.disabled = false;
    startButton.textContent = "START";

    stopButton.disabled = true;
    stopButton.style.opacity = "0.5";
    stopButton.style.pointerEvents = "none";

    setEditDurationEnabled(true);
}


/**
 * Hides all timers and shows only the target element.
 * @param {string} targetElementId - The ID of the timer element to show.
 */
function showOnly(targetElementId) {
    // 1. Stop the current timer before switching
    stopTimer();

    // 2. Hide all timer elements
    allTimersDisplays.forEach(timer => {
        timer.style.display = "none";
    });

    // 3. Find and display the specific timer
    const targetTimer = document.getElementById(targetElementId);
    if (targetTimer) {
        targetTimer.style.display = "block";
        currentTimerElement = targetTimer; // Update the global target reference

        // 4. Reset timeLeft to the new timer's initial duration
        timeLeft = parseInt(currentTimerElement.dataset.duration) * 60;
        updateDisplay(timeLeft);
    }
}

// --- Countdown Logic (Starting) ---

/**
 * The core function executed every second.
 */
function countdown() {

    // 1. Calculate the REAL time left by comparing Now vs. Target
    const now = Date.now();
    const secondsLeft = Math.ceil((endTime - now) / 1000);

    // 2. Sync it with your global variable so the pause button still works
    timeLeft = secondsLeft;


    if (timeLeft <= 0) {

        // Update the task before stopping the timer but only if it is pomodoro timeri
        if (currentTimerElement.id === "pomodoro-timer") {

            addTimeToSelectedTask();
            recordStreakCompletion();

        }
        

        stopTimer(); // Clear interval and reset state
        updateDisplay(0);

        alarmSound.play();

        stopAlarmBtn.style.display = "block";

        startButton.style.display = "none";
        stopButton.style.display = "none";

        return;
    }

    // Decrease time and update display
    updateDisplay(timeLeft);
}

/**
 * Initializes and starts the countdown for the currently selected timer.
 */
function startCountdown() {
    if (isRunning) {
        return; // Already running
    }

    // --- NEW LOGIC START ---
    // Calculate exactly when the timer should end based on current timeLeft
    // Date.now() gives milliseconds, so we multiply timeLeft by 1000
    endTime = Date.now() + (timeLeft * 1000);
    // --- NEW LOGIC END ---

    // Set state and disable start button
    isRunning = true;
    startButton.disabled = true;
    startButton.textContent = "Running...";
    startButton.style.opacity = "0.5";
    startButton.style.pointerEvents = "none";

    stopButton.disabled = false;
    stopButton.style.opacity = "1";
    stopButton.style.pointerEvents = "auto";

    setEditDurationEnabled(false);

    // Start the interval
    timerInterval = setInterval(countdown, 1000);
}

function dismissAlarm() {
    // 1. Pause the audio
    alarmSound.pause();

    // 2. Rewind audio to the start (so it's ready for next time)
    alarmSound.currentTime = 0;

    // 3. Hide the Stop Alarm button
    stopAlarmBtn.style.display = "none";

    // 4. Show the Start button again
    startButton.style.display = "block";
    startButton.style.opacity = "1";
    startButton.style.pointerEvents = "auto";
    stopButton.style.display = "block";
    startButton.textContent = "START";

    // 5. Reset the timer value (rewind the clock)
    timeLeft = parseInt(currentTimerElement.dataset.duration) * 60;
    updateDisplay(timeLeft);
    setEditDurationEnabled(true);
}

// --- Event Handlers ---

// 1. Attach listener to all Display buttons (Switching logic)
allButtons.forEach(button => {
    button.addEventListener("click", (event) => {
        const targetId = event.currentTarget.dataset.targetId;
        showOnly(targetId);
    })
});

// 2. Attach listener to the Start button (Starting logic)
startButton.addEventListener('click', startCountdown);

updateDisplay(timeLeft);

stopButton.disabled = true;
stopButton.style.opacity = "0.5";
stopButton.style.pointerEvents = "none";

// Don't forget to listen for the click!
if (stopAlarmBtn) {
    stopAlarmBtn.addEventListener('click', dismissAlarm);
}

// 3. Attach listener to the Stop button
if (stopButton) {
    stopButton.addEventListener('click', () => {
        stopTimer();
        // Optional: Make it clear the timer is paused
        startButton.textContent = "RESUME";
        startButton.style.opacity = "1";
        startButton.style.pointerEvents = "auto";
    });
}

// Analytics *Start*
document.addEventListener("DOMContentLoaded", () => {
    const openAnalyticsBtn = document.getElementById("openAnalyticsBtn");
    const closeAnalyticsBtn = document.getElementById("closeAnalyticsBtn");
    const analyticsModal = document.getElementById("analyticsModal");

    // 🕵️ DEBUGGING: Let's ask the browser what it found
    console.log("Open Button:", openAnalyticsBtn);
    console.log("Close Button:", closeAnalyticsBtn);
    console.log("Modal:", analyticsModal);

    if (openAnalyticsBtn && closeAnalyticsBtn && analyticsModal) {
        // Open the modal
        openAnalyticsBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Good practice: stops any weird button defaults

            // Show modal immediately with loading state
            analyticsModal.style.display = "flex";

            // Disable button while loading
            openAnalyticsBtn.disabled = true;
            openAnalyticsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            generateAnalytics().finally(() => {
                // Re-enable button when done
                openAnalyticsBtn.disabled = false;
                openAnalyticsBtn.innerHTML = '<i class="fa-solid fa-chart-simple"></i>';

            })

            analyticsModal.style.display = 'flex';
        });

        closeAnalyticsBtn.addEventListener('click', () => {
            analyticsModal.style.display = 'none';
        });

        analyticsModal.addEventListener('click', (e) => {
            if (e.target === analyticsModal) {
                analyticsModal.style.display = 'none';
            }
        });
    } else {
        // If one of them is missing, it will shout at us in red!
        console.error("🚨 ERROR: One of the Analytics elements is missing from the DOM!");
    }
});


// Variable to remember the chart so we can erase it and redraw it cleanly
let focusChartInstance = null;

async function generateAnalytics() {
    if (!currentUser) return;

    const spinner = document.getElementById("analyticsLoadingSpinner");
    const canvas = document.getElementById("focusChart");

    // Show spinner hide chart
    spinner.style.display = "flex";
    canvas.style.display = "none";

    try {
        const response = await authFetch(`http://localhost:3000/analytics`);
        const { totalFocusMinutes, tasks: savedTasks } = await response.json();

        const taskNames = [];
        const taskTimes = [];

        let maxTaskName = "No tasks yet";
        let maxTaskTime = 0;

        savedTasks.forEach(task => {
            const time = parseInt(task.time_spent) || 0;

            if (time > 0) {
                taskNames.push(task.task_name);
                taskTimes.push(time);
            }

            if (time > maxTaskTime) {
                maxTaskTime = time;
                maxTaskName = task.task_name;
            }
        });

        // Top 5 logic
        const combined = taskNames.map((name, i) => ({ name, time: taskTimes[i] }));
        combined.sort((a, b) => b.time - a.time);
        const top5 = combined.slice(0, 5);
        const chartNames = top5.map(t => t.name);
        const chartTimes = top5.map(t => t.time);

        // Update KPI scoreboards
        const totalDisplay = document.getElementById("totalFocusTimeDisplay");
        if (totalDisplay) {
            totalDisplay.textContent = `${totalFocusMinutes} minute${totalFocusMinutes === 1 ? '' : 's'}`;
        }

        const mostTimeDisplay = document.getElementById("mostTimeSpentTask");
        const mostTimeDisplayTime = document.getElementById("mostTimeSpentTaskTime");
        if (mostTimeDisplay) {
            if (maxTaskTime > 0) {
                mostTimeDisplay.textContent = `Task Name: ${maxTaskName}`;
                mostTimeDisplayTime.textContent = `Task Duration: ${maxTaskTime} minutes`;
            } else {
                mostTimeDisplay.textContent = "No tasks yet";
            }
        }

        // Draw chart
        const canvas = document.getElementById("focusChart");
        if (!canvas) return;

        const ctx = canvas.getContext("2d");

        if (focusChartInstance) {
            focusChartInstance.destroy();
        }

        focusChartInstance = new Chart(ctx, {
            type: "bar",
            data: {
                labels: chartNames,
                datasets: [{
                    label: "Minutes Focused",
                    data: chartTimes,
                    backgroundColor: "rgb(222, 134, 124, 0.5)",
                    borderColor: "rgb(222, 134, 124, 1)",
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: "rgb(255, 255, 255, 0.1)" },
                        ticks: { color: "#e0e0e0", stepSize: 5 }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: "#e0e0e0",
                            maxRotation: 0,
                            minRotation: 0,
                            callback: function (value) {
                                const label = this.getLabelForValue(value);
                                return label.length > 12 ? label.substring(0, 12) + "..." : label;
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

    } catch (err) {
        console.error("Failed to generate analytics:", err);
    } finally {
        // Always hide spinner and show chart when it is done
        spinner.style.display = "none";
        canvas.style.display = "block";
    }
}


// Activated Timer
const pomodoroTimerBtn = document.getElementById("pomodoro-session");
const breakBtn = document.getElementById("break-session");

const activeTimerBtn = (clickedButton) => {

    // Remove activeFilter class from every button
    allButtons.forEach(btn => btn.classList.remove("activeFilter"));

    // Add activeFilter class only to recently clicked button
    clickedButton.classList.add("activeFilter");
}

if (pomodoroTimerBtn && breakBtn) {
    pomodoroTimerBtn.addEventListener("click", () => activeTimerBtn(pomodoroTimerBtn));
    breakBtn.addEventListener("click", () => activeTimerBtn(breakBtn));
}

// --- Streak Feature ---

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
    if (!currentUser) return null;

    try {
        const response = await authFetch("http://localhost:3000/streak");
        const data = await response.json();
        updateStreakDisplay(data.currentStreak);
        return data;
    } catch (err) {
        console.error("Failed to load streak:", err);
        return null;
    }
}

async function recordStreakCompletion() {
    if (!currentUser) return;

    const pomodoroTimer = document.getElementById("pomodoro-timer");
    const minutes = parseInt(pomodoroTimer?.dataset.duration) || 25;

    try {
        const response = await authFetch("http://localhost:3000/streak/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ minutes })
        });
        const data = await response.json();
        updateStreakDisplay(data.currentStreak);
    } catch (err) {
        console.error("Failed to record streak:", err);
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

document.addEventListener("DOMContentLoaded", () => {
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
});