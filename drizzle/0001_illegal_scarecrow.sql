CREATE TABLE `profi_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`login` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profi_accounts_login_unique` ON `profi_accounts` (`login`);--> statement-breakpoint
CREATE TABLE `profi_auth_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profi_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `profi_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
