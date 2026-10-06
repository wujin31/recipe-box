# Roadmap: the cookbook redesign

Work happens on the `design/cookbook` branch. `main` (the live app) is untouched until the merge,
and the branch never writes to the real recipes: previews use a read-only copy. Each phase ends
with unit tests, browser tests and screenshots; phases 1 and 3 also get a QA pass.

Decisions: dish-type chapters (Breakfast & Brunch, Mains, Soups & Stews, Rice & Noodles,
Salads & Sides, Desserts & Baking, Sauces & Basics, plus Unsorted); home = continue cooking +
chapter shelves + chapter list; tiles show the dish's own-script title on its chapter color;
tab bar Cookbook · Search · + · Timers · Tools.

## Phase 0: Foundation
- [x] Browser tests in the repo (`tests/e2e/`), seeded from fixtures, run in CI
- [x] Split `app.js` into one module per screen plus shared UI helpers
- [x] Data v2: one `chapter` per recipe; chapter list in `recipes/cookbook.json`; derived
      cuisine, equipment, total time and timer count; index carries them
- [x] Type sizes in rem so iOS text size settings apply

## Phase 1: Cookbook design (review point)
- [x] Tab bar: Cookbook · Search · + · Timers · Tools
- [x] Home: continue cooking, chapter shelves, chapter list, Unsorted badge
- [x] Chapter page: 2-column grid, filters (cuisine, favorites, under 45 min)
- [x] Recipe page header: chapter · cuisine · equipment, servings, time, timers, cooked count
- [x] Search tab grouped by chapter, matches highlighted
- [x] Add: chapter picker with a guess; cuisine/equipment tags added; re-import offers to
      update the existing recipe (keeps log, favorite, tweaks)
- [x] Sort screen for unsorted recipes
- [x] Undo delete
- [x] "My tweaks" per recipe, separate from Claude's notes
- [x] Preview link + QA pass

## Phase 2: Cooking
- [x] Gather step: all ingredients as a checklist before step 1
- [x] Scale by what you have ("I have 600 g")
- [x] Timer labels from the step ("Soak rice · 30 min"); tap a timer to jump to its step
- [x] Timers tab: standalone timers, presets, running recipe timers

## Phase 3: Kitchen tools (review point)
- [x] Tool framework (`js/tools/`), tools can read the current recipe
- [x] Tools tab with pinning; 🧰 drawer on recipes and in cooking mode
- [x] Pasta water & salt (salt densities checked against sources)
- [x] Salt % (brines, dry brines, ferments)
- [x] Cups ↔ grams (per ingredient), °F/°C, gas marks
- [x] Preview link + QA pass

## Phase 4: With the merge
- [x] "Update available — Reload" instead of needing two reloads
- [x] Whole cookbook available offline (prefetched in the background)
- [x] Merge: existing recipes start in Unsorted; sort screen on first open
- [x] Pages → `main` (the old branch is yours to delete on GitHub; this session can't delete branches)

## Shopping list
- [x] Names to shop by (no prep notes or asides; native names kept), merged across recipes and units
- [x] Aisles (Produce, Meat & Seafood, Dairy & Eggs, Asian pantry, Pantry & Spices, Frozen, Bakery), movable
- [x] Add from a recipe (staples and what you've checked off left unticked) or from cooking mode's gather step
- [x] The list: tick off, Got it, clear ticked, your own items, share as text, 🛒 count; on this device
- [x] Preview link + QA pass, then merge

## Later rounds
- Cook-log photos (compressed; latest can become the tile)
- Version history with restore
- Printable recipe page
- First-run setup guide for the token
- More tools: eggs, meat temps, substitutions, pan size, bread math, coffee & tea
