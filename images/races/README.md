# Race nameplate images

Drop race banner images here named after each race's URL slug, e.g. `osaka-hai.png`,
`tenno-sho-spring.png`. The planner grid looks for `images/races/{urlSlug}.png` for every
selected race automatically — no code changes needed, just add the file and reload.

If an image is missing, the cell falls back to a plain CSS-styled nameplate (colored by grade,
with the race name as text), so the site works fine with none, some, or all images present.

Find each race's `urlSlug` in `data/races.json`.
