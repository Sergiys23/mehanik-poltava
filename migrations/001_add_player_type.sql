-- Run once if works.player_type does not exist.
ALTER TABLE works ADD COLUMN player_type TEXT NOT NULL DEFAULT 'youtube';
