-- If you already ran railway-achievements.sql, run this to add Month Master only.

INSERT INTO achievements (achievement_key, title, description, icon, category, sort_order) VALUES
('month_master', 'Month Master', 'Reach a 30-day consecutive focus streak.', 'fa-calendar-check', 'streak', 115)
ON DUPLICATE KEY UPDATE
    title = VALUES(title),
    description = VALUES(description),
    icon = VALUES(icon),
    category = VALUES(category),
    sort_order = VALUES(sort_order);
