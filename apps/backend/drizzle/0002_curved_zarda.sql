CREATE TABLE `credential_lockouts` (
	`credential_id` text PRIMARY KEY NOT NULL,
	`consecutive_failures` integer NOT NULL,
	`locked_until` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`credential_id`) REFERENCES `credentials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quota_usage` (
	`credential_id` text PRIMARY KEY NOT NULL,
	`remaining_requests` integer,
	`remaining_tokens` integer,
	`reset_at` integer,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`credential_id`) REFERENCES `credentials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `routing_state` (
	`credential_id` text PRIMARY KEY NOT NULL,
	`last_outcome` text NOT NULL,
	`last_reason` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`credential_id`) REFERENCES `credentials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routing_state_outcome_idx` ON `routing_state` (`last_outcome`);