-- Icône du point (id du catalogue web/src/waypoints/icons.ts). Les points existants deviennent « pin ».
alter table public.waypoints add column icon text not null default 'pin';
