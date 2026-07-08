// Get references to the elements using the IDs we added
const registerForm = document.getElementById('registerForm');
const emailInput = document.getElementById('regEmail');
const usernameInput = document.getElementById('regUsername');
const passwordInput = document.getElementById('regPassword');
const registerButton = document.getElementById('registerBtn');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const loginButton = document.getElementById('loginBtn');

//For directing.html
const todoBtn = document.querySelector('.directingButton:nth-of-type(1)'); // First button
const pomodoroBtn = document.querySelector('.directingButton:nth-of-type(2)'); // Second button
const buddiesBtn = document.querySelector('.directingButton:nth-of-type(3)'); // Third button

if (todoBtn) {
    todoBtn.addEventListener('click', () => {
        window.location.href = 'index.html'; // Or whatever your To-Do HTML file is named
    });
}

if (pomodoroBtn) {
    pomodoroBtn.addEventListener('click', () => {
        window.location.href = 'pomodoro.html'; // Or whatever your Pomodoro HTML file is named
    });
}

if (buddiesBtn) {
    buddiesBtn.addEventListener('click', () => {
        window.location.href = 'buddies.html';
    });
}
//For directing.html

// Only attach the registration handler if the button exists
if (registerButton) {
    registerButton.addEventListener('click', handleRegistration);
}

// Only attach the login handler if the button exists
if (loginButton) {
    loginButton.addEventListener('click', handleLogin);
}


async function handleRegistration(event) {
    // Prevent the default form submission action
    event.preventDefault(); 

    const name = document.getElementById("regName").value.trim();
    const username = usernameInput ? usernameInput.value.trim() : "";
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    // 1. Validate inputs (basic check)
    if (email === '' || password === '' || name === '' || username === '') {
        alert('Please fill in all fields.');
        return;
    }

    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
        alert('Username must be 3-20 characters and use letters, numbers, or underscores only.');
        return;
    }

    registerButton.disabled = true;
    registerButton.textContent = "Registering...";

    // 3. Send to backend
    try{
        const response = await fetch(apiUrl("/register"), {
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, username, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            Swal.fire({
                icon: "error", 
                title: "Registration Failed",
                text: data.message
            });
            return;
        }

        Swal.fire({
            icon: "success",
            title: "Registration Successful!",
            html: `You can now log in.<br><br>Your username: <strong>@${data.username}</strong><br>Your friend code: <strong>#${data.friendCode}</strong>`,
            showConfirmButton: false,
            timer: 4000
        }).then(() => {
            if (usernameInput) usernameInput.value = "";
            emailInput.value = "";
            passwordInput.value = "";
            window.location.href = "login.html";
        });
    } catch (err) {
        console.error(err);
        alert("Something went wrong! Could not reach the server.");
    } finally {
        // Always re-enable button whether success or error
        registerButton.disabled = false;
        registerButton.textContent = "Register";
    }
};

async function handleLogin(event) {
    event.preventDefault(); // Stop default form submission

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();

    if (email === '' || password === '') {
        Swal.fire({
            icon: 'warning',
            title: 'Missing Fields',
            text: 'Please enter both email and password.',
        });
        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";

    try {
        const response = await fetch(apiUrl("/login"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            Swal.fire({
                icon: "error",
                title: "Login Failed",
                text: data.message
            });
            loginPasswordInput.value = "";
            return;
        }

        // Store the auth token used to authorize API requests
        localStorage.setItem("authToken", data.token);

        // Store logged in user in localStorage (just for session)
        localStorage.setItem("loggedInUser", JSON.stringify({
            id: data.user.id,
            name: data.user.name,
            username: data.user.username,
            friendCode: data.user.friendCode
        }));

        Swal.fire({
            icon: "success",
            title: "Welcome Back!",
            text: "Login successful! Redirecting...",
            showConfirmButton: false,
            timer: 1500
        }).then(() => {
            window.location.href = "directing.html";
        });

    } catch (err) {
        console.error(err);
        alert("Something went wrong! Could not reach the server.");
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = "Login";
    }
};

// For logout

// Get references to elements specific to index.html
const userEmailDisplay = document.getElementById('userEmailDisplay');
const logoutBtn = document.getElementById('logoutBtn');


/**
 * Checks if a user is logged in. If not, redirects to login.html.
 * @returns {object|null} The logged-in user object or null.
 */
function checkAuthentication() {
    const loggedInUserString = localStorage.getItem('loggedInUser');

    if (!loggedInUserString) {
        // If no user is logged in, redirect to the login page
        window.location.href = 'login.html';
        return null;
    }

    try {
        return JSON.parse(loggedInUserString);
    } catch (e) {
        console.error('Error parsing loggedInUser from localStorage:', e);
        localStorage.removeItem('loggedInUser'); // Clear invalid data
        window.location.href = 'login.html';
        return null;
    }
}

/**
 * Handles the logout process: clears session data and redirects.
 */
function handleLogout() {
    // 1. Remove the logged-in user data and auth token from local storage
    localStorage.removeItem('loggedInUser');
    localStorage.removeItem('authToken');
    
    // 2. Redirect the user back to the login page
    window.location.href = 'login.html';
}

// Only run the index.html logic if the required elements are present
if (userEmailDisplay && logoutBtn) {
    
    // 1. Check Auth & Get User Data
    const currentUser = checkAuthentication();

    // 2. If user is successfully authenticated, update the UI
    if (currentUser) {
        const label = currentUser.username
            ? `@${currentUser.username}`
            : currentUser.name;
        userEmailDisplay.textContent = `Logged in as: ${label}`;
    }

    // 3. Attach Logout Event Listener
    logoutBtn.addEventListener('click', handleLogout);
}