---
stage: spec
timestamp: 2026-06-12T20:24:59Z
sha: eedbf2c
decided: ["11 stories: US-200 gate-prep (dark axis + fonts.ready), US-209 kanji-date lib, US-201 canvas/masthead/tabs/empty-states, US-202 hanko seal, US-203 command bar, US-204 static rows+section labels, US-210 row states+motion, US-205 brushstroke (incl. DoneView inline rows), US-206 toast/banner/errorboundary, US-207 cheatsheet, US-208 cleanup+re-bless","Dark-theme gate axis added via US-200 (review blocker): visual+a11y specs run breakpoints x themes, driven by lens.config.json visual.themes","Priority glyphs: 一 crimson (p1 only), 二/三 muted — DESIGN-SYSTEM §6 updated to match FR-5","Stagger handshake is a token contract (delay var(--motion-slow)), not a code dependency","Test ownership clause in FR-8: stories own their components' test files, selector-only e2e edits, behavioral assertions frozen","US-208 inspection notes artifact: verification/baseline-inspection-2026-06.md, one line per blessed PNG","DoneView renders rows inline (not TaskRow) — US-205 mounts BrushStroke in both paths; refactor is non-goal #7"]
rejected: ["Keeping 8 stories — review flagged US-201/US-204 oversized; split into US-209/US-201 and US-204/US-210","Rewriting ACs to light-only instead of adding the dark gate axis — both-themes verification is worth the US-200 story","All-crimson priority glyphs — violates §3 saturation discipline"]
risks: ["Lighthouse perf with 3 Google font families (non-goal #6 documents the revisit trigger)","Baseline re-bless is all-or-nothing and now doubled by the theme axis; US-208 stays atomic and last","US-200 interim baselines are throwaway; gate is expected RED between US-200 and US-208 — execution must not treat that as story failure outside US-208","DoneView/TaskRow duplication means the brushstroke is implemented twice; drift risk documented as non-goal #7"]
files: ["tasks/prd-ink-garden-reskin.md"]
remaining: []
---

Rev 2 after advisory prd-review (1 blocker, 7 major, 7 minor — all 15 resolved in-place). Pinned e2e clock date 2026-06-12 is a Friday; kanji formatter must respect it.
