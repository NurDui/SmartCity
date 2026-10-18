CREATE TABLE `yandex_quota_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`service` text NOT NULL,
	`identity_hash` text NOT NULL,
	`reserved_at_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `yandex_quota_scope_time_idx` ON `yandex_quota_reservations` (`scope`,`reserved_at_ms`);--> statement-breakpoint
CREATE INDEX `yandex_quota_identity_time_idx` ON `yandex_quota_reservations` (`scope`,`identity_hash`,`reserved_at_ms`);