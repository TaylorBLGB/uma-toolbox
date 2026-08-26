# UmaToolbox

A small static site with Umamusume Pretty Derby tools:

- **Race Planner** (`planner.html`) — a game-accurate 3-year career grid. Click any slot to assign a race,
  or hit Auto-Fill to run one of two optimizer modes (dropdown next to the button):
  - **Guaranteed Fans** (default) — maximizes total fans assuming every selected race is won, subject to
    your aptitude filters and a max-consecutive-races cap (it will deliberately skip races early if that
    produces a better long-run total, and breaks same-fan ties by aptitude).
  - **EV Mode (WIP)** — maximizes *realistic* expected fans using measured win-chance data: win% is
    `110 - 10×(sum of the two relevant aptitude grade indices)`, reduced further the longer the current
    race streak runs, and a loss lands on a specific placement (looked up by that same aptitude score and
    streak length) rather than a spread of outcomes, converted to fans via a fixed percent-of-base ladder
    (2nd=40%, 3rd=25%, ... down to 1% by mid-field). A strong aptitude pair (e.g. double-A) computes to a
    raw 110%, over the 100% a real probability can be - that headroom is kept and only clamped away *after*
    the streak penalty's subtracted, not before, so it can fully absorb a small penalty (e.g. a double-A's
    3rd race in a row stays a true 100% win rather than getting knocked down to 90% by a penalty the raw
    110% had room for). All three tables are in `js/planner.js`'s "Expected
    Value optimizer" section, verified cell-by-cell against the source charts - including confirming, for a
    real case that looked suspicious at a glance (a G1 recommended despite a poor aptitude), that its 70%
    win chance genuinely out-values every 100%-safe alternative in that slot by the numbers, not a bug.
    Unlike Guaranteed Fans mode, this one ignores both the aptitude panel's B-or-better filter (a big
    enough prize can be worth a real risk at a low grade) and the max-consecutive-races cap, which is
    hidden while this mode is active (declining win chance per extra race already makes long streaks
    self-limiting, so it's left free to find its own ideal streak length — including choosing to skip a
    race purely to reset the streak for a better one later). The aptitude panel's exact grades still drive
    the win-chance math either way. Base Fans and Total Fans (both of which assume every race is won) are
    replaced by a single "Theoretical Max Fans" while this mode is active, so you have one apples-to-apples
    ceiling to compare the always-visible, win-adjusted "Expected Fans" badge against.

    The 3 post-career finale races aren't guaranteed either, and aren't a fixed race - they run at
    whichever distType/surface was most common across your whole selected career (ties go to the shorter
    distance, then to turf over dirt), tallied for distance and surface independently rather than as exact
    combinations. A "Predicted finale races" panel shows the derived type and its expected fans live, so
    you can check it against real runs. The optimizer factors this in too: since exactly co-optimizing
    every regular pick against the aggregate finale outcome would require the DP to track running counts
    of every distType/surface combination touched so far (a state space explosion), it instead runs the
    search 15 times - once unsteered, once nudged toward each distType, once nudged toward each surface,
    and once for every distType×surface pair combined - and keeps whichever run has the highest true,
    unbiased total EV. That's guaranteed to never do worse than the plain unsteered result (which is always
    one of the 15 candidates), but isn't guaranteed to find the absolute mathematical optimum. In testing
    this held up correctly and safely across several constructed scenarios, though most of them didn't find
    room to improve on the baseline - a race's individual EV and its contribution to a good finale type both
    come from the same aptitude grades, so they're usually already pulling in the same direction rather than
    in tension.

    A "Which aptitude is worth raising?" button (EV mode only) answers a different question: given your
    current grades, which single aptitude is actually most worth improving? For every dimension not already
    at A it re-runs the full optimizer twice — once with that dimension bumped one grade stage, once maxed
    to A — and reports the real change in total expected fans each time (not just that one race's win
    chance, the whole re-optimized agenda), sorted by biggest single-stage gain. This is what catches cases
    like a 1-stage Mile bump out-earning a 4-stage Long climb, without having to manually test every
    combination by hand. Since a full run is ~200 DP passes, it's a button rather than something that reruns
    on every keystroke - but once you've run it, it silently keeps itself in sync afterwards (see below).

  Search for a trainee by name (substring match) to auto-fill the aptitude grades from their real stats —
  unreleased characters are excluded from search unless you check "Include unreleased". Aptitude only
  pulls through for a given character if that character's row in Supabase actually has aptitude grades
  filled in; plenty of unreleased characters don't yet (it's a data gap, not a bug), so a blank pull-through
  means go add that character's grades in the `umas` table. A Fan Bonus % input (defaults to 120%, the
  in-game max, but stays editable) shows Base Fans and Total Fans side by side (Guaranteed Fans mode). Race
  cells look for an image keyed to the race (Supabase Storage or `images/races/{urlSlug}.png`, see below)
  and show the race's name as a hover tooltip either way, so it's still readable on a small screen or
  narrow window even when the image itself doesn't spell it out. The trainee search shows a portrait at
  `images/trainees/{slug}.png` — both fall back to a styled placeholder (or nothing, for portraits)
  automatically if the image doesn't exist. Changing any aptitude grade (via the steppers or by picking a
  trainee) automatically re-runs Auto-Fill and, in EV mode, the upgrade analysis below, after a short pause
  (debounced ~400ms so rapid clicks don't feel janky) — there's no separate button to remember to press. A
  link-share and a 3-image agenda export (client-side `<canvas>`, no server) exist in the code but are
  currently unhooked from the toolbar — see the `init()` wiring near the bottom of `js/planner.js` to
  re-enable.

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
   the `umas`, `supports` and `races` tables (one flat column per field, so every value is its own editable
   cell later), public `race-images` and `trainee-images` Storage buckets, and locks the public API to
   read-only via Row Level Security. Your own access through the dashboard isn't affected by RLS.
3. **Load your current data.** Run `python scripts/generate_seed_sql.py` to (re)generate `db/seed.sql` from
   today's `data/*.json`, then run that file in the same SQL Editor. This is a one-time migration — once
   the data's in Supabase, you edit it there, not in the spreadsheet.
4. **Get your API credentials.** In Project Settings → API, copy the Project URL and the `anon` `public`
   key (not the `service_role` key — that one can bypass RLS and should never go in client-side code).
5. **Wire it up.** Open `js/supabase-config.js`, paste those two values in, and set `enabled: true`.
   Redeploy. The Race Planner now reads from Supabase instead of the bundled JSON — verify by editing a
   row in Supabase's Table Editor and confirming it shows up on the live site without a rebuild.

If `races` doesn't exist yet when this deploys (e.g. you're adding it after already setting up
`umas`/`supports`), the planner falls back to bundled `races.json` automatically rather than breaking —
run step 2/3 for `races` whenever you're ready and it starts using Supabase on the next page load, no code
change needed.

**To edit data going forward:** open your project at [supabase.com](https://supabase.com) → Table Editor →
`umas`, `supports`, or `races`. It's a full spreadsheet-like grid, gated by your Supabase login, from any
device. No custom admin page was built for this — the dashboard already does the job with zero extra code.
(If you later want an in-site editing page instead of visiting supabase.com, that's a separate follow-up —
say so and it can be built against the same tables.)

**Adding a race that isn't live yet** (e.g. one you can see in game data but hasn't launched, like Prix
Foy): add the row in the `races` table with `in_game` set to `false` — it's excluded from the planner grid
entirely until you flip it to `true`. Same idea as `umas`/`supports`' `in_game` flag and the "Include
unreleased" checkbox, just without a toggle to preview it early (not needed since visitors can't see it at
all either way).

**Race images:** upload/replace a file named `{url_slug}.png` in the `race-images` bucket (Storage →
race-images in the dashboard) — find a race's `url_slug` in the `races` table. Picked up automatically,
no redeploy. Missing image = plain colored nameplate with the race name, so this is entirely optional.

**Trainee portraits:** same idea, `trainee-images` bucket, but filenames are the trainee's name slugified
(lowercase, spaces/punctuation → hyphens, e.g. `Oguri Cap` → `oguri-cap.png`) since umas has no stored
slug column to read from directly. If you're not sure you've got a name's slug right, open the browser's
Network tab while searching for that trainee — the failed image request shows the exact filename the site
tried to load. Also optional; missing portrait just doesn't show one.

**Finding mismatched filenames without clicking through every race/trainee:** some races and characters
have a real-world/GameTora name that differs from the `url_slug` (or `slugify(name)`) the site expects -
e.g. "Milers Cup" in-game is `yomiuri-milers-cup` as a slug, and "Kyodo News Hai" used to be called
"Tokinominoru Kinen" (the slug still uses the old name). Run:

```bash
python scripts/check_images.py
```

It lists every `races`/`umas` row with no matching file in its bucket, every uploaded file with no matching
row, and — for the common case where a file's just named slightly differently (a typo, a hyphen in a
different spot, an alternate romanization) — suggests which orphaned file is probably the right one, so you
usually just need to rename the file rather than track down or re-upload anything. Needs the `storage.objects`
list policy from `db/schema.sql` (added after `race-images`/`trainee-images` were first set up — re-run the
bottom of that file in the SQL Editor if the script errors with a permissions message).

## Running locally

Any static file server works. A minimal HTTP/1.1 one is included (plain `python -m http.server` can
reset connections under concurrent fetches for some browsers) and always sends `Cache-Control: no-store`,
so editing a file and reloading always shows the change — without it, browsers can heuristically cache
`.js`/`.css` files and keep serving an old version indefinitely since there's no `Cache-Control` header to
say otherwise:

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
