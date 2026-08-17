# UmaToolbox

A small static site with two Umamusume Pretty Derby tools:

- **Race Planner** (`planner.html`) — a game-accurate 3-year career grid. Click any slot to assign a race,
  or hit Auto-Fill to run a dynamic-programming optimizer that maximizes total fans subject to your
  aptitude filters and a max-consecutive-races cap (it will deliberately skip races early if that produces
  a better long-run total). Pick a trainee to see an aptitude warning banner, and use Share to hand someone
  else a link that loads your exact agenda. Race cells look for an image at `images/races/{urlSlug}.png`
  and fall back to a styled placeholder automatically if none exists — see `images/races/README.md`.
- **Character & Support Database** (`database.html`) — searchable/sortable reference for trainee
  aptitudes/stats and support card bonuses.

It's plain HTML/CSS/JS — no build step, no framework, no backend. All data lives in `data/*.json` and is
loaded client-side with `fetch`. There is nothing here that writes anywhere, so it's safe to host publicly
as read-only.

## Updating the data

The JSON files are generated from two personal spreadsheets (not included in this repo) via
`scripts/extract_data.py`. That script deliberately drops the `In Game?/Want?/Have?/Use?` columns that
track personal collection status — only public reference data (stats, aptitudes, race calendar) is
published. To regenerate after editing the source spreadsheets:

```bash
python scripts/extract_data.py
```

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
