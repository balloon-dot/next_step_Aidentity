CREATE TABLE `profi_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`title` text NOT NULL,
	`profession` text DEFAULT '' NOT NULL,
	`synthetic` integer DEFAULT false NOT NULL,
	`profile_json` text NOT NULL,
	`metadata_json` text NOT NULL,
	`share_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `profi_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profi_profiles_share_id_unique` ON `profi_profiles` (`share_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profi_owner_candidate` ON `profi_profiles` (`owner_id`,`candidate_id`);--> statement-breakpoint
ALTER TABLE `profi_accounts` ADD `role` text DEFAULT 'user' NOT NULL;