# Trainee portrait images

**If Supabase is enabled** (`js/supabase-config.js`), portraits come from the `trainee-images` Storage
bucket instead of this folder — upload a file there (Supabase dashboard → Storage → trainee-images) and
it's picked up automatically, no redeploy needed. This folder is the fallback used when Supabase is off.

Either way, name the file after the trainee's name, slugified: lowercase, spaces and punctuation turned
into hyphens. E.g. `Air Groove` -> `air-groove.png`. There's no stored slug column for umas (unlike
races' `url_slug`), so either work it out by hand using that rule, or open the browser's Network tab
while searching for that trainee and look for the failed `trainee-images`/`images/trainees` request — it
shows the exact filename the site tried to load.

They're used next to the trainee search box on the Race Planner and in its suggestion dropdown. If an
image is missing it's simply hidden — no placeholder, no broken image icon — so the site works fine with
none, some, or all portraits present.

One image per trainee name (not per costume) — costume variants share the same aptitude and the same
portrait slot.
