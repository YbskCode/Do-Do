-- Run each statement separately in Railway MySQL console

ALTER TABLE users ADD COLUMN show_on_leaderboard BOOLEAN DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS focus_day_stats (
    user_id INT NOT NULL,
    activity_date DATE NOT NULL,
    minutes INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, activity_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
