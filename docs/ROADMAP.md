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
- [ ] Preview link + QA pass

## Phase 2: Cooking
- [ ] Gather step: all ingredients as a checklist before step 1
- [ ] Scale by what you have ("I have 600 g")
- [ ] Timer labels from the step ("Soak rice · 30 min"); tap a timer to jump to its step
- [ ] Timers tab: standalone timers, presets, running recipe timers

## Phase 3: Kitchen tools (review point)
- [ ] Tool framework (`js/tools/`), tools can read the current recipe
- [ ] Tools tab with pinning; 🧰 drawer on recipes and in cooking mode
- [ ] Pasta water & salt (salt densities checked against sources)
- [ ] Salt % (brines, dry brines, ferments)
- [ ] Cups ↔ grams (per ingredient), °F/°C, gas marks
- [ ] Preview link + QA pass

## Phase 4: With the merge
- [ ] "Update available — Reload" instead of needing two reloads
- [ ] Whole cookbook available offline (prefetched from Pages)
- [ ] Merge: existing recipes start in Unsorted; sort screen on first open
- [ ] Pages → `main`; delete the old branch

## Later rounds
- Shopping list (combined, grouped, shareable to Reminders)
- Cook-log photos (compressed; latest can become the tile)
- Version history with restore
- Printable recipe page
- First-run setup guide for the token
- More tools: eggs, meat temps, substitutions, pan size, bread math, coffee & tea
