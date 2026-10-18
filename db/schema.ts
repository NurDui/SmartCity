import {index,integer,sqliteTable,text} from "drizzle-orm/sqlite-core";

// Quota grants contain no IP address, coordinates, geocoder query, provider key or response.
// No request-time DDL. Cleanup removes only entries older than the safety window.
export const yandexQuotaReservations=sqliteTable("yandex_quota_reservations",{
  id:text("id").primaryKey(),
  scope:text("scope").notNull(),
  service:text("service").notNull(),
  identityHash:text("identity_hash").notNull(),
  reservedAtMs:integer("reserved_at_ms").notNull(),
},table=>[
  index("yandex_quota_scope_time_idx").on(table.scope,table.reservedAtMs),
  index("yandex_quota_identity_time_idx").on(table.scope,table.identityHash,table.reservedAtMs),
]);
