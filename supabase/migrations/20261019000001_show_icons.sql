-- Migration 15. The icons toggle (Phase 1, D-189, Q-107): owners write
-- restaurants.show_icons, migration one's column, false by default, through
-- one grant on the column. Column grants add up, so migration two's eleven
-- columns stay as they are and the restaurants boundary script reads the
-- twelve. No view change: published_restaurants has carried show_icons since
-- migration one. No function. Nothing else (D-85).
grant update (show_icons) on public.restaurants to authenticated;
