require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err);
        return;
    }
    console.log("Connected to Do-Do database!");
});

// REGISTER
app.post("/register", (req, res) => {
    const { name, email, password } = req.body;

    // Check if user already exists
    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: "Database error"}, err);
            return;
        }

        if (results.length > 0) {
            res.status(400).json({ message: "Email already registered" });
            return;
        }

        // Insert new user
        db.query("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", 
            [name, email, password], 
            (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error"}, err);
                return;
            }
            res.status(201).json({ message: "Registration successful!"});
        });
    });
});

// LOGIN
app.post("/login", (req,res) => {
    const { email, password } = req.body;

    // Find user by email and password
    db.query("SELECT * FROM users WHERE email = ? AND password = ?", 
        [email, password], 
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" }, err)
                return;
            }

            if (results.length === 0) {
                res.status(401).json({ message: "Invalid email or password" });
                return;
            }

            // User found, login successful
            const user = results[0];
            res.status(200).json({ 
                message: "Login Successful!", 
                user: {
                    id:user.id,
                    name: user.name,
                    email: user.email
                }
            });
        });
});

// Get all tasks for a user
app.get("/tasks/:user_id", (req,res) => {
    const { user_id } = req.params;
    db.query("SELECT * FROM tasks WHERE user_id = ? AND task_archived = false", 
        [user_id],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            res.status(200).json(results);
        }
    )
})

// Get ALL tasks for analytics (including archived)
app.get("/tasks/:user_id/all", (req, res) => {
    const { user_id } = req.params;
    db.query("SELECT * FROM tasks WHERE user_id = ?", 
        [user_id],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            res.status(200).json(results);
        }
    );
});

// Post a new task
app.post("/tasks", (req,res) => {
    const { user_id, task_name } = req.body;

    db.query("INSERT INTO tasks (user_id, task_name) VALUES (?, ?)", 
        [user_id, task_name],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }

            res.status(201).json({ message: "Task created!", id: results.insertId });
        }
    )
})

// Update a task (complete / edit)
app.put("/tasks/:id", (req, res) => {
    const { id } = req.params;
    const { task_name, task_completed, time_spent } = req.body;

    db.query("UPDATE tasks SET task_name = ?, task_completed = ?, time_spent = ? WHERE id = ?", 
        [task_name, task_completed, time_spent, id],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            res.status(200).json({ message: "Task Updated!" });
        });
});

// Archive a task
app.put("/tasks/:id/archive", (req, res) => {
    const { id } = req.params;

    db.query("UPDATE tasks SET task_archived = true WHERE id = ?", 
        [id],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            res.status(200).json({ message: "Task archived" });
        });
});

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});