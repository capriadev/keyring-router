CREATE TABLE `install_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `credentials` ADD `secret_ciphertext` text;--> statement-breakpoint
ALTER TABLE `credentials` ADD `secret_iv` text;--> statement-breakpoint
ALTER TABLE `credentials` ADD `secret_tag` text;--> statement-breakpoint
ALTER TABLE `credentials` ADD `secret_version` integer;--> statement-breakpoint
ALTER TABLE `credentials` ADD `secret_hint` text;