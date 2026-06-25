-- Team member contact details: phone number and birth date (both optional).
ALTER TABLE users ADD COLUMN phone TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN birthdate TEXT;
