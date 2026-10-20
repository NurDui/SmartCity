CREATE TABLE `provider_budget_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`units` integer NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `provider_budget_scope_time_idx` ON `provider_budget_reservations` (`scope`,`at`);