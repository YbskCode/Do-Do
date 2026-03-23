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
const currentUser = JSON.parse(localStorage.getItem("loggedInUser"));
const userTasksKey = currentUser ? `tasks_${currentUser.email}` : "null";

let timerInterval = null;
let isRunning = false;
let endTime = null;

let currentTimerElement = document.getElementById('pomodoro-timer');
let timeLeft = parseInt(currentTimerElement.dataset.duration) * 60;


//Load tasks into the dropdown
function loadTasksIntoDropdown() {
    if (!userTasksKey) {
        return;
    }

    const savedTasks = JSON.parse(localStorage.getItem(userTasksKey)) || [];

    //Clear existing options (except the default one)
    taskSelect.innerHTML = '<option value="">-- No Task Selected --</option>';

    //Loop through tasks and only add the ones that are not completed
    savedTasks.forEach((task, index) => {

        if (task.archived) {
            return;
        }

        if (!task.completed) {
            const option = document.createElement("option");
            option.value = index; //We use the array index to identify the task later
            option.textContent = task.text;

            //If the task doesn't have a timeSpent property yet, give it one
            if (task.timeSpent === undefined) {
                task.timeSpent = 0;
            }

            //Store the time spent right on the option element for easy access
            option.dataset.timeSpent = task.timeSpent;

            taskSelect.appendChild(option);
        }
    });
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

function addTimeToSelectedTask() {
    // Check if the user actually selected a task from the dropdown
    const selectedIndex = taskSelect.value;

    if (selectedIndex === "") {
        return;
    }

    // Open the database (LocalStorage) to get the user's tasks
    if (!currentUser) {
        return;
    }

    let savedTasks = JSON.parse(localStorage.getItem(userTasksKey)) || [];

    // Figure out how many minutes to add 
    // Grab the duration of the timer just finished
    const minutesCompleted = parseInt(currentTimerElement.dataset.duration);

    // Go to the exact same task using the index, and add the minutes
    // Include safety check just in case
    if (savedTasks[selectedIndex].timeSpent === undefined) {
        savedTasks[selectedIndex].timeSpent = 0;
    }
    savedTasks[selectedIndex].timeSpent += minutesCompleted;

    // Save the updated list back into LocalStorage
    localStorage.setItem(userTasksKey, JSON.stringify(savedTasks));

    // Refresh the dropdown UI so the new time shows up instantly
    loadTasksIntoDropdown();

    // Make sure the dropdown stays on the task they were just working on
    taskSelect.value = selectedIndex;

    // Update the text display below the dropdown
    if (timeSpentValue) {
        timeSpentValue.textContent = savedTasks[selectedIndex].timeSpent;
    }
};

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

        // Update the task before stopping the timer
        addTimeToSelectedTask();

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
    //
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

            generateAnalytics();

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

function generateAnalytics() {
    // fetch the logged-in user's tasks from LocalStorage
    const currentUser = JSON.parse(localStorage.getItem("loggedInUser"));
    if (!currentUser) {
        return;
    };

    const userTasksKey = `tasks_${currentUser.email}`;
    const savedTasks = JSON.parse(localStorage.getItem(userTasksKey)) || [];

    // Prepare data arrays
    let totalMinutes = 0;
    const taskNames = [];
    const taskTimes = [];

    // Variables to track the champion task
    let maxTaskName = "No tasks yet";
    let maxTaskTime = 0;

    savedTasks.forEach(task => {
        const time = parseInt(task.timeSpent) || 0;
        totalMinutes += time;

        // We only want to graph tasks that actually have time spent on them
        if (time > 0) {
            taskNames.push(task.text);
            taskTimes.push(time);
        }

        // Trach the most time spent task
        if (time > maxTaskTime) {
            maxTaskTime = time;
            maxTaskName = task.text;
        }
    });

    // Combine into pairs, sort by time descending, take top 5
    const combined = taskNames.map((name, i) => ({ name, time: taskTimes[i] }));

    combined.sort((a, b) => b.time - a.time);

    const top5 = combined.slice(0, 5);

    // Unpack back into seperate array for chart.js
    const chartNames = top5.map(t => t.name);
    const chartTimes = top5.map(t => t.time);

    // Update the KPI Scoreboard 
    const totalDisplay = document.getElementById("totalFocusTimeDisplay");
    if (totalDisplay) {
        totalDisplay.textContent = `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
    }

    // Update the Most Time Spent KPI Scoreboard
    const mostTimeDisplay = document.getElementById("mostTimeSpentTask");
    const mostTimeDisplayTime = document.getElementById("mostTimeSpentTaskTime");
    if (mostTimeDisplay) {
        if (maxTaskTime > 0) {
            mostTimeDisplay.textContent = `Task Name: ${maxTaskName}`;
            mostTimeDisplayTime.textContent = `Task Duration: ${maxTaskTime} minutes`
        } else {
            mostTimeDisplay.textContent = "0 minutes";
        }
    }

    // Draw the chart.js graph
    const canvas = document.getElementById("focusChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // If a chart already exists, destroy it before drawing a new one
    if (focusChartInstance) {
        focusChartInstance.destroy();
    }

    // Paint the new chart
    focusChartInstance = new Chart(ctx, {
        type: "bar", // A clean, vertical bar chart
        data: {
            labels: chartNames, // The X-axis
            datasets: [{
                label: "Minutes Focused",
                data: chartTimes, // The Y-axis
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
                    ticks: { color: "#e0e0e0",
                        maxRotation: 0, // Forces the text to sit perfectly flat, no diagonal tilt!
                        minRotation: 0,
                        callback: function(value) {
                            const label = this.getLabelForValue(value);
                            // If the name is longer than 12 characters, cut it and add "..."
                            return label.length > 12 ? label.substring(0,12) + "..." : label;
                        }

                     }
                }
            },
            plugins: {
                legend: {display: false } // Hide the top legend for a cleaner UI
            }
        }
    });
}

// Activated Timer
const pomodoroBtn = document.getElementById("pomodoro-session");
const shortBreakBtn = document.getElementById("short-break-session");
const longBreakBtn = document.getElementById("long-break-session");

const activeTimerBtn = (clickedButton) => {

    // Remove activeFilter class from every button
    allButtons.forEach(btn => btn.classList.remove("activeFilter"));

    // Add activeFilter class only to recently clicked button
    clickedButton.classList.add("activeFilter");
}

if (pomodoroBtn && shortBreakBtn && longBreakBtn) {
    pomodoroBtn.addEventListener("click", () => activeTimerBtn(pomodoroBtn));
    shortBreakBtn.addEventListener("click", () => activeTimerBtn(shortBreakBtn));
    longBreakBtn.addEventListener("click", () => activeTimerBtn(longBreakBtn));
}