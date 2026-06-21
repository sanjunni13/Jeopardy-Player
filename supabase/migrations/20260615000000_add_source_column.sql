-- Add source column to games table to track how the game was created
alter table "public"."games" add column "source" text;

-- Backfill existing generated games based on game_name pattern
update "public"."games" set source = 'archive' where game_name like 'generated_%' and source is null;
