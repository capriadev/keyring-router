CREATE TABLE `routing_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_model_id` text NOT NULL,
	`mode` text NOT NULL,
	`cascade` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routing_profiles_model_unique` ON `routing_profiles` (`provider_model_id`);