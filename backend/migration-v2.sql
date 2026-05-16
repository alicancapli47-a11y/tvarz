-- Add new columns to videos table
ALTER TABLE videos ADD COLUMN IF NOT EXISTS duration_seconds integer DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS channel text DEFAULT 'main';

-- Update existing videos with duration_seconds
UPDATE videos SET duration_seconds = 612, sort_order = 1 WHERE youtube_id = 'UwWA3UDIwi4';
UPDATE videos SET duration_seconds = 1247, sort_order = 2, channel = 'main' WHERE youtube_id = '6y7k_mbiEw0';
UPDATE videos SET duration_seconds = 1427, sort_order = 3, channel = 'main' WHERE youtube_id = 'bm-RLg1hPPo';
UPDATE videos SET duration_seconds = 892, sort_order = 4, channel = 'main' WHERE youtube_id = 'kp4gT908ILg';
UPDATE videos SET duration_seconds = 1834, sort_order = 5, channel = 'main' WHERE youtube_id = 'DxmKdOGdkkA';
UPDATE videos SET duration_seconds = 743, sort_order = 6, channel = 'main' WHERE youtube_id = 'uurljh2axsI';

-- Set all as main channel
UPDATE videos SET channel = 'main' WHERE channel IS NULL OR channel = '';

-- Index
CREATE INDEX IF NOT EXISTS idx_videos_sort ON videos(sort_order);
CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel);
CREATE INDEX IF NOT EXISTS idx_videos_active_channel ON videos(is_active, channel);
