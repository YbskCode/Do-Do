require("dotenv").config();
const mysql = require("mysql2/promise");

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true
    });

    await connection.query(`
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS show_presence BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS show_task_name BOOLEAN DEFAULT FALSE;
    `).catch(async () => {
        const [columns] = await connection.query("SHOW COLUMNS FROM users");
        const names = columns.map((col) => col.Field);
        if (!names.includes("show_presence")) {
            await connection.query("ALTER TABLE users ADD COLUMN show_presence BOOLEAN DEFAULT TRUE");
        }
        if (!names.includes("show_task_name")) {
            await connection.query("ALTER TABLE users ADD COLUMN show_task_name BOOLEAN DEFAULT FALSE");
        }
    });

    await connection.query(`
        CREATE TABLE IF NOT EXISTS friendships (
            id INT AUTO_INCREMENT PRIMARY KEY,
            requester_id INT NOT NULL,
            addressee_id INT NOT NULL,
            status ENUM('pending', 'accepted', 'declined') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_friendship (requester_id, addressee_id),
            FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_presence (
            user_id INT PRIMARY KEY,
            status ENUM('offline', 'online', 'focusing', 'on_break') DEFAULT 'offline',
            current_task_name VARCHAR(255) NULL,
            session_ends_at DATETIME NULL,
            last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    await connection.end();
    console.log("Study buddies tables ready.");
}

migrate().catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
});
