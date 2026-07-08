-- Run each statement separately in Railway MySQL console

ALTER TABLE users ADD COLUMN show_presence BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN show_task_name BOOLEAN DEFAULT FALSE;

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
