import {index,integer,sqliteTable,text} from "drizzle-orm/sqlite-core";

// Only service timestamps and public geocoder results. No IP or route coordinates.
export const serviceReservations=sqliteTable("service_reservations",{
 id:text("id").primaryKey(),scope:text("scope").notNull(),at:integer("at").notNull(),
},table=>[index("service_scope_time_idx").on(table.scope,table.at)]);
export const geocodeCache=sqliteTable("geocode_cache",{
 key:text("key").primaryKey(),value:text("value").notNull(),expires:integer("expires").notNull(),
});

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
