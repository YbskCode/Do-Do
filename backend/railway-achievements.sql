-- Run each statement separately in Railway MySQL console

ALTER TABLE users ADD COLUMN shared_focus_minutes INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    achievement_key VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(120) NOT NULL,
    description VARCHAR(255) NOT NULL,
    icon VARCHAR(64) NOT NULL DEFAULT 'fa-medal',
    category VARCHAR(32) NOT NULL DEFAULT 'general',
    sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
    user_id INT NOT NULL,
    achievement_id INT NOT NULL,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, achievement_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
);

INSERT INTO achievements (achievement_key, title, description, icon, category, sort_order) VALUES
('first_focus', 'First Focus', 'Complete your first pomodoro session.', 'fa-play', 'focus', 10),
('pomodoro_lover', 'Pomodoro Lover', 'Spend 200 minutes focusing.', 'fa-heart', 'focus', 20),
('pomodoro_expert', 'Pomodoro Expert', 'Spend 1,000 minutes focusing.', 'fa-star', 'focus', 30),
('sensei_of_pomodoro', 'Sensei of Pomodoro', 'Spend 5,000 minutes focusing.', 'fa-crown', 'focus', 40),
('buddy_up', 'Buddy Up', 'Add your first study buddy.', 'fa-user-plus', 'social', 50),
('very_friendly', 'Very Friendly', 'Add 20 study buddies.', 'fa-users', 'social', 60),
('lets_study_friend', 'Let''s Study Friend', 'Spend 200 minutes studying with buddies.', 'fa-handshake', 'social', 70),
('lets_study_gang', 'Let''s Study Gang', 'Spend 1,000 minutes studying with buddies.', 'fa-people-group', 'social', 80),
('lets_study_bro', 'Let''s Study Bro', 'Spend 5,000 minutes studying with buddies.', 'fa-trophy', 'social', 90),
('streak_starter', 'Streak Starter', 'Reach a 3-day focus streak.', 'fa-fire', 'streak', 100),
('week_warrior', 'Week Warrior', 'Reach a 7-day focus streak.', 'fa-fire-flame-curved', 'streak', 110),
('month_master', 'Month Master', 'Reach a 30-day consecutive focus streak.', 'fa-calendar-check', 'streak', 115),
('checklist_champ', 'Checklist Champ', 'Complete 10 tasks.', 'fa-list-check', 'tasks', 120)
ON DUPLICATE KEY UPDATE
    title = VALUES(title),
    description = VALUES(description),
    icon = VALUES(icon),
    category = VALUES(category),
    sort_order = VALUES(sort_order);
