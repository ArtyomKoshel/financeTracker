-- Add is_one_time column to recurring_payments
ALTER TABLE recurring_payments ADD COLUMN is_one_time BOOLEAN DEFAULT 0;
