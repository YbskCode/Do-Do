// --- CONFIGURATION ---
const CORRECT_REF_CODE = 'BadiTech';

// Get references to the elements using the IDs we added
const registerForm = document.getElementById('registerForm');
const emailInput = document.getElementById('regEmail');
const passwordInput = document.getElementById('regPassword');
const refCodeInput = document.getElementById('regRefCode');
const registerButton = document.getElementById('registerBtn');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const loginButton = document.getElementById('loginBtn');

//For directing.html
const todoBtn = document.querySelector('.directingButton:nth-of-type(1)'); // First button
const pomodoroBtn = document.querySelector('.directingButton:nth-of-type(2)'); // Second button

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
//For directing.html

// Only attach the registration handler if the button exists
if (registerButton) {
    registerButton.addEventListener('click', handleRegistration);
}

// Only attach the login handler if the button exists
if (loginButton) {
    loginButton.addEventListener('click', handleLogin);
}


function handleRegistration(event) {
    // Prevent the default form submission action
    event.preventDefault(); 

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const refCode = refCodeInput.value.trim();

    // 1. Validate inputs (basic check)
    if (email === '' || password === '' || refCode === '') {
        alert('Please fill in all fields.');
        return;
    }

    // 2. Check the Reference Code 
    if (refCode !== CORRECT_REF_CODE) {
        Swal.fire({
            icon: 'error',
            title: 'Access Denied',
            text: 'Invalid Reference Code. You cannot register without the correct code.',
        });
        refCodeInput.value = '';
        return;
    }

    // 3. Retrieve or Initialize User List
    // Get existing users (or an empty array if none exist)
    let users = JSON.parse(localStorage.getItem('users')) || [];


    // 4. Check for Existing User (prevent duplicate registration)
    const userExists = users.some(user => user.email === email);
    if (userExists) {
        Swal.fire({
            icon: 'info',
            title: 'Already Registered',
            text: 'This email is already registered. Please log in.',
        });
        return;
    }

    // 5. Create New User Object
    const newUser = {
        email: email,
        password: password
    };

    users.push(newUser);

    localStorage.setItem('users', JSON.stringify(users));

    // 6. Success!
    Swal.fire({
        icon: 'success',
        title: 'Registration Successful!',
        text: 'You can now proceed to log in.',
        showConfirmButton: false,
        timer: 2000
    }).then(() => {
        // Clear the form and redirect after the SweetAlert closes
        emailInput.value = '';
        passwordInput.value = '';
        refCodeInput.value = '';
        window.location.href = 'login.html';
    });
};

function handleLogin(event) {
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

    // 1. Retrieve all stored users from Local Storage
    // Parse the JSON string back into a JavaScript array.
    const users = JSON.parse(localStorage.getItem('users')) || [];

    // 2. Find the user with matching email and password
    const foundUser = users.find(user => 
        user.email === email && user.password === password
    );

    if (foundUser) {
        // 3. Successful Login: Store the logged-in status
        localStorage.setItem('loggedInUser', JSON.stringify({ email: foundUser.email }));

        // 4. Success Alert and Redirect
        Swal.fire({
            icon: 'success',
            title: 'Welcome Back!',
            text: 'Login successful! Redirecting...',
            showConfirmButton: false,
            timer: 1500
        }).then(() => {
            window.location.href = 'directing.html'; 
        });

    } else {
        // Unsuccessful Login
        Swal.fire({
            icon: 'error',
            title: 'Login Failed',
            text: 'Invalid email or password.',
        });
        loginPasswordInput.value = '';
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
    // 1. Remove the logged-in user data from local storage
    localStorage.removeItem('loggedInUser');
    
    // 2. Redirect the user back to the login page
    window.location.href = 'login.html';
}

// Only run the index.html logic if the required elements are present
if (userEmailDisplay && logoutBtn) {
    
    // 1. Check Auth & Get User Data
    const currentUser = checkAuthentication();

    // 2. If user is successfully authenticated, update the UI
    if (currentUser) {
        userEmailDisplay.textContent = `Logged in as: ${currentUser.email}`;
    }

    // 3. Attach Logout Event Listener
    logoutBtn.addEventListener('click', handleLogout);
}