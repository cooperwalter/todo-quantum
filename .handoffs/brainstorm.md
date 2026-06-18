---
stage: brainstorm
timestamp: 2026-06-12T20:13:38Z
sha: eedbf2c
decided: ["Direction: Ink Garden (washi/sumi/aizome indigo/hanko crimson) chosen by user 2026-06-12 via lens-design; DESIGN-SYSTEM.md + tokens.css already rewritten and approved","Bilingual masthead: kanji display date + English muted subtitle","Hanko seal is informative only (role=status, not interactive)","Seal fill state purely derived from store; un-fills immediately when today gains an open task","Pure visual re-skin: zero behavior/keybinding/parsing/storage changes"]
rejected: ["Amplifying Morning Edition (user pivoted to a full direction change)","Directions: Checklist Avionics, Poster Brut, Orbital Pop, Schematic, Daybreak Aero (user rejected in two rounds)","Interactive seal (jump to Done view) — rejected for a11y/keymap surface","Seal stays-filled-until-midnight — rejected to avoid persisted state"]
risks: ["Mincho/Gothic web fonts may regress Lighthouse perf gate (0.9) — fallback plan: font subsetting story","No italic exists in Shippori Mincho — all italic styles must be redesigned, not just re-fonted","Every visual baseline invalidated at once — re-bless must be one atomic story (US-208) after all re-skin stories","Kanji date must respect the frozen e2e clock or date-rollover flake returns"]
files: ["DESIGN-SYSTEM.md","src/styles/tokens.css","tasks/prd-ink-garden-reskin.md"]
remaining: []
---

Brainstorm ran via superpowers:brainstorming + lens-design (visual companion session .superpowers/brainstorm/94232-1781290731), not ql-brainstorm; this handoff supersedes the stale edit-token-parsing one.
