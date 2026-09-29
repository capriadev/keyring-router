CREATE TABLE `catalog_models` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL,
	`provider_model_id` text NOT NULL,
	`display_name` text NOT NULL,
	`size_bytes` integer,
	`family` text,
	`provider_modified_at` text,
	`discovered_at` integer NOT NULL,
	FOREIGN KEY (`credential_id`) REFERENCES `credentials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_models_credential_model_unique` ON `catalog_models` (`credential_id`,`provider_model_id`);--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`namespace` text NOT NULL,
	`provider_id` text NOT NULL,
	`base_url` text NOT NULL,
	`auth_kind` text NOT NULL,
	`last_validated_at` integer,
	`last_refresh_at` integer,
	`last_refresh_error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credentials_namespace_unique` ON `credentials` (`namespace`);--> statement-breakpoint
CREATE TABLE `policies` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text,
	`pattern` text NOT NULL,
	`effect` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`credential_id`) REFERENCES `credentials`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `policies_credential_id_idx` ON `policies` (`credential_id`);