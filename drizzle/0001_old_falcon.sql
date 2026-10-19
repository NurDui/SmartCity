CREATE TABLE `geocode_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `service_scope_time_idx` ON `service_reservations` (`scope`,`at`);