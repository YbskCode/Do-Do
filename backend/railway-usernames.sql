-- Run each statement separately in Railway MySQL console

ALTER TABLE users ADD COLUMN username VARCHAR(20) NULL;
ALTER TABLE users ADD COLUMN friend_code CHAR(6) NULL;

-- After running backend/migrate-usernames.js against Railway credentials,
-- or manually assigning values to every user, enforce uniqueness:
-- CREATE UNIQUE INDEX idx_users_username ON users (username);
-- CREATE UNIQUE INDEX idx_users_friend_code ON users (friend_code);
-- ALTER TABLE users MODIFY username VARCHAR(20) NOT NULL;
-- ALTER TABLE users MODIFY friend_code CHAR(6) NOT NULL;
