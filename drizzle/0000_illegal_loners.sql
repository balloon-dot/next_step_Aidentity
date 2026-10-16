CREATE TABLE `profi_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`baseline_hash` text NOT NULL,
	`baseline_json` text NOT NULL,
	`catalog_version` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profi_owner_baseline` ON `profi_collections` (`owner_id`,`baseline_hash`);--> statement-breakpoint
CREATE TABLE `profi_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`name_key` text NOT NULL,
	`device_key` text NOT NULL,
	`data_json` text NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `profi_collections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profi_collection_name` ON `profi_reviews` (`collection_id`,`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `profi_collection_device` ON `profi_reviews` (`collection_id`,`device_key`);