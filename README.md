**Do-Do**

**About the Project**
Do-Do is an application that helps its users to focus on one task and solve them. It combines concepts like "To-Do listing" and "Pomodoro studying style". Users can create a task and start working on it without tracking any data like they do in every other To-Do app. But users also can create a task and track it's data while they are working on it. A task's data is used in analytic modal. Users can see their most time-spent tasks in analytic modal. 

In short, This app allows you to use To-Do and Pomodoro together and with the tracked data you can analyze your own performance.

<hr>

**🛠Tech Stack**
- HTML5
- CSS3
- Vanilla JavaScript (ES6+)

<hr>

**🚀Setup**
This project has a frontend (browser) and a backend (Node.js + MySQL) for accounts and task data.

1. Clone the repository -> https://github.com/YusufOkmen/Do-Do
2. Set up the database
   - Create a MySQL database for the app
   - Create the `users` and `tasks` tables
3. Configure and start the backend
   - In the `backend` folder, run `npm install`
   - Create a `.env` file with: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`
   - Start the server with `npm start` (runs on http://localhost:3000)
4. Open the frontend
   - Open `frontend/login.html` in your browser (e.g. with VS Code Live Server)

<hr>

**🤝Contributing**
Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create your feature branch
3. Commit your changes using <sup>Conventional Commits</sup>
4. Push to your branch
5. Open a PR (Pull Request)
