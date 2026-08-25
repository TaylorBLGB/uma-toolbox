"""Cross-checks Supabase Storage images against the races/umas tables so
mismatched filenames (e.g. a race called "Milers Cup" in-game but stored as
"Yomiuri Milers Cup" by GameTora/the url_slug) surface without having to
click through every race or trainee on the site.

Usage:
    python scripts/check_images.py

Reads the same public anon key already embedded in js/supabase-config.js -
no credentials needed beyond what's already shipped to every visitor.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "js" / "supabase-config.js"


def load_config():
    text = CONFIG_PATH.read_text(encoding="utf-8")
    url = re.search(r'url:\s*"([^"]+)"', text).group(1)
    anon_key = re.search(r'anonKey:\s*"([^"]+)"', text).group(1)
    return url, anon_key


def api_get(base_url, anon_key, path):
    req = urllib.request.Request(
        f"{base_url}{path}",
        headers={"apikey": anon_key, "Authorization": f"Bearer {anon_key}"},
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())


def api_post(base_url, anon_key, path, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}{path}",
        data=data,
        method="POST",
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())


def slugify(name):
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))


def list_bucket_slugs(base_url, anon_key, bucket):
    objects = api_post(base_url, anon_key, f"/storage/v1/object/list/{bucket}",
                        {"prefix": "", "limit": 10000, "offset": 0, "sortBy": {"column": "name", "order": "asc"}})
    return {Path(o["name"]).stem.lower() for o in objects if o["name"].lower().endswith(".png")}


def levenshtein(a, b):
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
        prev = cur
    return prev[-1]


def strip_hyphens(s):
    return s.replace("-", "")


def fuzzy_match(missing, orphaned):
    """For each missing slug, suggest an orphaned image that's probably the
    same race under a different name - three passes, most confident first:
      1. one string contains the other (e.g. "milers-cup" in
         "yomiuri-milers-cup")
      2. equal once hyphens are stripped (a word-boundary shift, e.g.
         "kyoto-uma-musume-stakes" vs "kyoto-umamusume-stakes")
      3. a small edit distance (<=2), catching one-letter-off spellings/typos
         like "nakayama-kimpai" vs "nakayami-kimpai" or two valid
         romanizations of the same word ("kinmokusei" vs "kimmokusei")
    Only the first pass that finds anything for a given slug is kept, so a
    strong match doesn't get diluted by a weaker one."""
    suggestions = {}
    for slug in missing:
        substring_hits = [img for img in orphaned if slug in img or img in slug]
        if substring_hits:
            suggestions[slug] = substring_hits
            continue

        stripped_slug = strip_hyphens(slug)
        hyphen_hits = [img for img in orphaned if strip_hyphens(img) == stripped_slug]
        if hyphen_hits:
            suggestions[slug] = hyphen_hits
            continue

        close_hits = [img for img in orphaned if levenshtein(slug, img) <= 2]
        if close_hits:
            suggestions[slug] = close_hits
    return suggestions


DUPLICATE_SUFFIX = re.compile(r"\s*\(\d+\)$")


def report(label, entity_label, missing, orphaned, id_by_slug, all_slugs):
    print(f"\n=== {label} ===")
    if not missing and not orphaned:
        print(f"All {entity_label} slugs have a matching image, and no orphaned images. Nothing to fix.")
        return

    suggestions = fuzzy_match(missing, orphaned)

    if missing:
        print(f"\n{entity_label} with NO image in the bucket ({len(missing)}):")
        for slug in sorted(missing):
            names = ", ".join(id_by_slug.get(slug, [slug]))
            hint = suggestions.get(slug)
            if hint:
                print(f"  - {names}  [slug: {slug}]  <-- possible rename match: {', '.join(hint)}.png")
            else:
                print(f"  - {names}  [slug: {slug}]")

    suggested_images = {img for imgs in suggestions.values() for img in imgs}
    remaining_orphans = orphaned - suggested_images

    # A "name (1).png" style orphan usually isn't a rename candidate at all -
    # it's a duplicate upload that got auto-renamed to avoid overwriting the
    # correctly-named file that's already in place. Flag those separately so
    # they don't get mixed in with genuine orphans still needing a decision.
    duplicates = {img for img in remaining_orphans if DUPLICATE_SUFFIX.search(img) and
                  strip_hyphens(DUPLICATE_SUFFIX.sub("", img)) in {strip_hyphens(s) for s in all_slugs}}
    unexplained_orphans = remaining_orphans - duplicates

    if duplicates:
        print(f"\nLikely duplicate uploads, safe to delete ({len(duplicates)}):")
        for image in sorted(duplicates):
            print(f"  - {image}.png")

    if unexplained_orphans:
        print(f"\nImages in the bucket with NO matching {entity_label} slug ({len(unexplained_orphans)}):")
        for image in sorted(unexplained_orphans):
            print(f"  - {image}.png")


def main():
    base_url, anon_key = load_config()

    print("Fetching races...")
    races = api_get(base_url, anon_key, "/rest/v1/races?select=name,url_slug,in_game")
    race_bucket_slugs = list_bucket_slugs(base_url, anon_key, "race-images")

    race_slugs = set()
    names_by_slug = {}
    for r in races:
        slug = (r.get("url_slug") or "").lower()
        if not slug:
            continue
        race_slugs.add(slug)
        names_by_slug.setdefault(slug, []).append(r["name"] + ("" if r["in_game"] else " (unreleased)"))

    missing_race_images = race_slugs - race_bucket_slugs
    orphaned_race_images = race_bucket_slugs - race_slugs
    report("Races (race-images bucket)", "race", missing_race_images, orphaned_race_images, names_by_slug, race_slugs)

    print("\nFetching umas...")
    umas = api_get(base_url, anon_key, "/rest/v1/umas?select=name,in_game")
    uma_bucket_slugs = list_bucket_slugs(base_url, anon_key, "trainee-images")

    uma_slugs = set()
    names_by_uma_slug = {}
    for u in umas:
        slug = slugify(u["name"])
        uma_slugs.add(slug)
        names_by_uma_slug.setdefault(slug, []).append(u["name"] + ("" if u["in_game"] else " (unreleased)"))

    missing_uma_images = uma_slugs - uma_bucket_slugs
    orphaned_uma_images = uma_bucket_slugs - uma_slugs
    report("Trainees (trainee-images bucket)", "trainee", missing_uma_images, orphaned_uma_images, names_by_uma_slug, uma_slugs)


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as e:
        print(f"Request failed: {e.code} {e.reason}\n{e.read().decode('utf-8', 'ignore')}", file=sys.stderr)
        sys.exit(1)
