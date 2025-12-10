-- Add file_groups column to preflights table for grouped file summaries
ALTER TABLE preflights ADD COLUMN IF NOT EXISTS file_groups TEXT[];
