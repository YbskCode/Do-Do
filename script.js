document.addEventListener("DOMContentLoaded", () => {
    const taskInput = document.getElementById("taskInput");
    const addTaskBtn = document.getElementById("addTaskBtn");
    const taskList = document.getElementById("taskList");
    const emptyImage = document.querySelector(".emptyImg");
    const todosContainer = document.querySelector(".todosContainer");

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

    // 3. Create a unique "Key" for this specific user
    // Example result: "tasks_yusuf@gmail.com"
    const userTasksKey = `tasks_${currentUser.email}`;

    const toggleEmptyState = () => {
        // Get me the li elements that don't have "archived" class
        const visibleTasks = taskList.querySelectorAll("li:not(.archived)").length;

        // If the visibleTasks = 0 then display emptyImage
        emptyImage.style.display = visibleTasks === 0 ? "block" : "none";
    }

    const loadTaskFromLocalStorage = () => {
        const savedTasks = JSON.parse(localStorage.getItem(userTasksKey)) || [];
        savedTasks.forEach(task => {
            addTask(task.text, task.completed, task.timeSpent, task.archived);
        });
        toggleEmptyState();
    }

    const saveTaskLocalStorage = () => {
        const tasks = Array.from(taskList.querySelectorAll("li")).map(li => ({
            text: li.querySelector("span").textContent,
            completed: li.querySelector(".checkbox").checked,
            archived: li.classList.contains("archived"),
            timeSpent: parseInt(li.dataset.timeSpent) || 0
        }))
        localStorage.setItem(userTasksKey, JSON.stringify(tasks));
    };

    const addTask = (text, completed = false, timeSpent = 0, archived = false) => {
        const taskText = text || taskInput.value.trim();
        if (!taskText) {
            return;
        }

        const li = document.createElement("li");

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

        checkbox.addEventListener("change", () => {
            const isChecked = checkbox.checked;
            li.classList.toggle("completed", isChecked)
            editBtn.disabled = isChecked;
            editBtn.style.opacity = isChecked ? "0.5" : "1";
            editBtn.style.pointerEvents = isChecked ? "none" : "auto";
            saveTaskLocalStorage();
        })

        editBtn.addEventListener("click", () => {
            if (!checkbox.checked) {
                taskInput.value = li.querySelector("span").textContent;
                li.remove();
                saveTaskLocalStorage();
            }
        })

        deleteBtn.addEventListener("click", () => {
            li.classList.add("archived");
            li.style.display = "none";
            toggleEmptyState();
            saveTaskLocalStorage();
        });

        taskList.appendChild(li)
        taskInput.value = "";
        toggleEmptyState();
        saveTaskLocalStorage();

        // Find whichever button currently has the purple highlight
        const activeFilterBtn = document.querySelector(".activeFilter");
        
        // If one exists, simulate a click on it to re-run the filter logic!
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

    loadTaskFromLocalStorage();

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

