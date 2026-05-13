-- Add due_date column for one-time payments
ALTER TABLE recurring_payments ADD COLUMN due_date TEXT;
