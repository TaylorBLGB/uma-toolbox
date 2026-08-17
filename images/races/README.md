# Race nameplate images

**If Supabase is enabled** (`js/supabase-config.js`), images come from the `race-images` Storage
bucket instead of this folder — upload/replace `{url_slug}.png` there via the Supabase dashboard
(Storage → race-images) and it's picked up automatically, no redeploy needed. This folder is the
fallback used when Supabase is off.

Drop race banner images here named after each race's URL slug, e.g. `osaka-hai.png`,
`tenno-sho-spring.png`. The planner grid looks for `images/races/{urlSlug}.png` for every
selected race automatically — no code changes needed, just add the file and reload.

Either way, if an image is missing, the cell falls back to a plain CSS-styled nameplate (colored
by grade, with the race name as text), so the site works fine with none, some, or all images
present.

Find each race's `url_slug` in the `races` table (Supabase) or `data/races.json`.
