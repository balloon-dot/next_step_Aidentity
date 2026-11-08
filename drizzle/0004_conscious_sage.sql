CREATE TABLE `profi_profession_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`profession_id` text NOT NULL,
	`source` text NOT NULL,
	`voter_key` text NOT NULL,
	`vote` integer NOT NULL,
	`percent` integer NOT NULL,
	`list_rank` integer NOT NULL,
	`rated` integer NOT NULL,
	`collection_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profi_feedback_vote` ON `profi_profession_feedback` (`voter_key`,`profession_id`,`source`);