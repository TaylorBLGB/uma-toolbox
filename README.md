# UmaToolbox

A small static site with Umamusume Pretty Derby tools:

- **Race Planner** (`planner.html`) — a game-accurate 3-year career grid. Click any slot to assign a race,
  or hit Auto-Fill to run a dynamic-programming optimizer that maximizes total fans subject to your
  aptitude filters and a max-consecutive-races cap (it will deliberately skip races early if that produces
  a better long-run total). Search for a trainee by name (substring match) to auto-fill the aptitude grades
  from their real stats — unreleased characters are excluded from search unless you check "Include
  unreleased". A Fan Bonus % input shows Base Fans and Total Fans side by side. Copy Link hands someone
  else a URL that loads your exact agenda; Download Images renders your agenda as 3 portrait PNGs (one per
  career year, laid out as the same 4x6 tile grid as the page itself), fully client-side via `<canvas>` —
  no server involved, mirroring the screenshot style the community already uses to share agendas. Race
  cells look for an image at `images/races/{urlSlug}.png`, and the trainee search shows a portrait at
  `images/trainees/{slug}.png` — both fall back to a styled placeholder (or nothing, for portraits)
  automatically if the image doesn't exist. See `images/races/README.md` and `images/trainees/README.md`.

A character/support database browser previously lived at `database.html` — it's been pulled out for now
pending a decision on which columns it should show, but `data/umas.json` and `data/supports.json` still
exist (the planner's trainee search depends on the former) and a rebuilt version will return once that's
settled.

It's plain HTML/CSS/JS — no build step, no framework, no backend. All data lives in `data/*.json` and is
loaded client-side with `fetch`. There is nothing here that writes anywhere, so it's safe to host publicly
as read-only.

## Updating the data

There's deliberately no in-browser editing — visitors can use the tools but can't change the underlying
data. You have two ways to update it yourself:

**Option A: edit the spreadsheet, then regenerate.** This is the source of truth and the right path for
any real edit (new character, corrected aptitude, a whole batch of changes) since it keeps the
spreadsheet and site in sync for next time:

```bash
python scripts/extract_data.py "path/to/Datasheet.xlsx" "path/to/RL UMA.xlsx"
```

With no arguments it looks in this machine's Downloads folder for `Datasheet.xlsx` and `RL UMA (1).xlsx`.
The script drops the `Want?/Have?/Use?` columns that track your personal collection status — only public
reference data (stats, aptitudes, race calendar, and whether something's released yet) is published.

**Option B: hand-edit the JSON directly.** For a quick one-off tweak — flipping `"inGame": false` to
`true` the day a character releases, or adding their aptitude grades before you've updated the
spreadsheet — `data/umas.json`, `data/supports.json`, and `data/races.json` are plain, readable JSON.
Open one in any text editor, find the entry by name, edit the fields, save. Just remember it'll get
overwritten next time you run Option A from the spreadsheet, so fold the same change into the spreadsheet
eventually if you want it to stick.

Either way, changes only take effect once you redeploy (see below) — editing the local file doesn't touch
whatever's already live.

### Option C: admin database (Supabase) — edit from anywhere, no rebuild/redeploy

The two options above both need you at a machine with the spreadsheet, then a redeploy. This option moves
`umas`/`supports` into a real database you can edit from any browser, and the live site reads it directly —
no rebuild step. It's more setup than A/B, worth it specifically because you asked for "works no matter
where I am."

1. **Create the project.** Sign up at [supabase.com](https://supabase.com) (free tier is enough for this)
   and create a new project. This is an account-creation step only you can do.
2. **Create the tables.** In the project's SQL Editor, run [`db/schema.sql`](db/schema.sql) — it creates
   the `umas` and `supports` tables (one flat column per field, so every value is its own editable cell
   later) and locks the public API to read-only via Row Level Security. Your own access through the
   dashboard isn't affected by RLS.
3. **Load your current data.** Run `python scripts/generate_seed_sql.py` to (re)generate `db/seed.sql` from
   today's `data/umas.json`/`data/supports.json`, then run that file in the same SQL Editor. This is a
   one-time migration — once the data's in Supabase, you edit it there, not in the spreadsheet.
4. **Get your API credentials.** In Project Settings → API, copy the Project URL and the `anon` `public`
   key (not the `service_role` key — that one can bypass RLS and should never go in client-side code).
5. **Wire it up.** Open `js/supabase-config.js`, paste those two values in, and set `enabled: true`.
   Redeploy. The Race Planner now reads trainees from Supabase instead of the bundled JSON — verify by
   editing a row in Supabase's Table Editor and confirming it shows up on the live site without a rebuild.

**To edit data going forward:** open your project at [supabase.com](https://supabase.com) → Table Editor →
`umas` or `supports`. It's a full spreadsheet-like grid, gated by your Supabase login, from any device. No
custom admin page was built for this — the dashboard already does the job with zero extra code. (If you
later want an in-site editing page instead of visiting supabase.com, that's a separate follow-up — say so
and it can be built against the same tables.)

## Running locally

Any static file server works. A minimal HTTP/1.1 one is included (plain `python -m http.server` can
reset connections under concurrent fetches for some browsers):

```bash
python scripts/serve.py 8000
```

Then open `http://localhost:8000`.

## Deploying

Pick whichever's easiest — all are free and require no server to manage.

### Option A: Netlify (drag-and-drop, no git needed)

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag this whole `uma-tools-site` folder onto the page.
3. Netlify gives you a live URL immediately. You can rename the site or add a custom domain from the
   Netlify dashboard afterwards.

### Option B: GitHub Pages

1. Create a new repository on GitHub (public) and push this folder to it:
   ```bash
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. In the repo's Settings → Pages, set the source to "Deploy from a branch", branch `main`, folder `/root`.
3. GitHub gives you a URL like `https://<you>.github.io/<repo>/` within a minute or two.

### Option C: Cloudflare Pages

1. Push the folder to a GitHub repo (same as Option B, step 1).
2. In the Cloudflare dashboard, create a Pages project connected to that repo.
3. Leave the build command empty and set the output directory to `/` (root) — there's nothing to build.

## Notes

- Umamusume Pretty Derby and all character names are trademarks of Cygames, Inc. This is an unofficial,
  non-commercial fan reference — say so if you publish it.
- Data is compiled from personal notes; treat it as a starting point rather than ground truth.
