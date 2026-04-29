document.addEventListener("DOMContentLoaded", () => {
    const taskInput = document.getElementById("taskInput");
    const addTaskBtn = document.getElementById("addTaskBtn");
    const taskList = document.getElementById("taskList");
    const emptyImage = document.querySelector(".emptyImg");
    const todosContainer = document.querySelector(".todosContainer");

    // Checking which task is currently being edited: Issue #19
    let editingLi = null

    const goBackBtn = document.getElementById("goBackBtn");

    if (goBackBtn) {
        goBackBtn.addEventListener("click", () => {
            // This mimics the browser's "Back" button
            window.location.href = "directing.html"
        });
    }

    //Button variables for filtering the tasks
    const filterAllBtn = document.getElementById("filterAll");
    const filterActiveBtn = document.getElementById("filterActive");
    const filterCompletedBtn = document.getElementById("filterCompleted");

    // 1. Get the logged-in user from the session
    const currentUser = JSON.parse(localStorage.getItem("loggedInUser"));

    // 2. Security Check: If no user is found, kick them back to login
    if (!currentUser) {
        window.location.href = "login.html";
        return;
    }

    const toggleEmptyState = () => {
        // Get me the li elements that don't have "archived" class
        const visibleTasks = taskList.querySelectorAll("li:not(.archived)").length;

        // If the visibleTasks = 0 then display emptyImage
        emptyImage.style.display = visibleTasks === 0 ? "block" : "none";

        // If there is no task then do not display taskList so emptyImage can be centered
        taskList.style.display = visibleTasks === 0 ? "none" : "block";
    }

    const loadTaskFromDB = async () => {
        try {
            const response = await fetch(`http://localhost:3000/tasks/${currentUser.id}`);
            const tasks = await response.json();
            tasks.forEach(task => {
                addTask(task.id, task.task_name, task.task_completed, task.time_spent, task.task_archived);
            });
            toggleEmptyState();
        } catch (err) {
            console.error("Failed to load tasks: ", err);
        }
    }

    const addTask = async (id = null, text, completed = false, timeSpent = 0, archived = false) => {
        const taskText = text || taskInput.value.trim();
        if (!taskText) {
            return;
        }

        // If we are in edit mode, update the existiong code instead of creating a new one
        if (editingLi) {

            const newText = taskText;
            const taskId = editingLi.dataset.id;

            // Update the DOM
            editingLi.querySelector("span").textContent = newText;
            editingLi.style.display = "flex";

            // Update in database
            try {
                await fetch(`http://localhost:3000/tasks/${taskId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        task_name: newText,
                        task_completed: editingLi.querySelector(".checkbox").checked,
                        time_spent: parseInt(editingLi.dataset.timeSpent) || 0
                    })
                });
            } catch (err) {
                console.error("Failed to update task:", err);
            }

            // Clear edit state
            taskInput.value = "";
            editingLi = null;
            return;
        }

        const li = document.createElement("li");
        li.dataset.id = id; // Store database id
        li.dataset.timeSpent = timeSpent;


        if (archived) {
            li.classList.add("archived");
            li.style.display = "none";
        }

        li.innerHTML = `
            <input type="checkbox" class="checkbox" ${completed ? "checked" : " "}>
            <span>${taskText}</span>
            <div class="taskButtons">
                <button class="editBtn">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="deleteBtn">
                    <i class="fa-solid fa-trash"></i>
                </button>
                
            </div>
        `;

        const checkbox = li.querySelector(".checkbox");
        const editBtn = li.querySelector(".editBtn");
        const deleteBtn = li.querySelector(".deleteBtn");

        if (completed) {
            li.classList.add("completed");
            editBtn.disabled = true;
            editBtn.style.opacity = "0.5";
            editBtn.style.pointerEvents = "none";
        }

        checkbox.addEventListener("change", async () => {
            const isChecked = checkbox.checked;
            li.classList.toggle("completed", isChecked)
            editBtn.disabled = isChecked;
            editBtn.style.opacity = isChecked ? "0.5" : "1";
            editBtn.style.pointerEvents = isChecked ? "none" : "auto";

            // Update task in database
            try {
                await fetch(`http://localhost:3000/tasks/${li.dataset.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        task_name: li.querySelector("span").textContent,
                        task_completed: isChecked,
                        time_spent: parseInt(li.dataset.timeSpent) || 0
                    })
                });
            } catch (err) {
                console.error("Failed to update task:", err);
            }


        });

        editBtn.addEventListener("click", () => {
            if (!checkbox.checked) {

                // Remembers which li we are editing
                editingLi = li;

                taskInput.value = li.querySelector("span").textContent;

                li.style.display = "none";

                taskInput.focus();
            }
        });

        deleteBtn.addEventListener("click", async () => {
            try {
                await fetch(`http://localhost:3000/tasks/${li.dataset.id}/archive`, {
                    method: "PUT"
                });

                li.classList.add("archived");
                li.style.display = "none";
                toggleEmptyState();

            } catch (err) {
                console.error("Failed to archive task:", err);
            }
        });

        taskList.appendChild(li)
        taskInput.value = "";
        toggleEmptyState();

        if (id === null) {
            // POST new task to database
            try {
                const response = await fetch("http://localhost:3000/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: currentUser.id,
                        task_name: taskText
                    })
                });

                const data = await response.json();

                // Store the database ID on the li so we can reference it later
                li.dataset.id = data.id;

            } catch (err) {
                console.error("Failed to save task:", err);
            }
        }

        // Re-run active filter
        const activeFilterBtn = document.querySelector(".activeFilter");
        if (activeFilterBtn) {
            activeFilterBtn.click();
        }
    };

    addTaskBtn.addEventListener("click", (e) => {
        e.preventDefault();
        addTask();
    });

    taskInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addTask();
        }
    });

    loadTaskFromDB();

    //Filtering the tasks (All, Active and Completed)

    const filterTasks = (filterType, clickedButton) => {

        //Active filter highlighting
        //Grab all three buttons
        const allFilterButtons = document.querySelectorAll(".taskManagerButton");

        //Remove activeFilter class from every button
        allFilterButtons.forEach(btn => btn.classList.remove("activeFilter"));

        //Add activeFilter class only to recently clicked button
        clickedButton.classList.add("activeFilter");


        //Getting every tasks on the screen
        const allTasks = document.querySelectorAll(".todosContainer li");

        //Starting the loop
        allTasks.forEach(task => {

            if (task.classList.contains("archived")) {
                task.style.display = "none";
                return;

            }
            //Asking if the task is completed. Returns true or false
            const isCompleted = task.classList.contains("completed");

            //Loop Logic
            switch (filterType) {
                case "all":
                    task.style.display = "flex"; //Show every task
                    break;
                case "active":
                    if (isCompleted) {
                        task.style.display = "none"; //Hide completed tasks
                    } else {
                        task.style.display = "flex" //Show active tasks
                    }
                    break;
                case "completed":
                    if (isCompleted) {
                        task.style.display = "flex" //Show completed tasks
                    } else {
                        task.style.display = "none" //Hde active tasks
                    }
                    break;
            }
        });
    };

    if (filterAllBtn && filterActiveBtn && filterCompletedBtn) {
        filterAllBtn.addEventListener("click", () => filterTasks("all", filterAllBtn));
        filterActiveBtn.addEventListener("click", () => filterTasks("active", filterActiveBtn));
        filterCompletedBtn.addEventListener("click", () => filterTasks("completed", filterCompletedBtn));
    }


});

