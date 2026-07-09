-- Add shared pause/freeze support to an EXISTING study_sessions table.
-- Run these in the Railway MySQL console if study_sessions already exists
-- without is_paused / remaining_seconds.

ALTER TABLE study_sessions ADD COLUMN is_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE study_sessions ADD COLUMN remaining_seconds INT NULL;
