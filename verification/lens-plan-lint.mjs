#!/usr/bin/env node
// verification/lens-plan-lint.mjs
// Mechanically enforces planning best practices on quantum.json BEFORE the loop runs.
// The headline check: it simulates quantum-loop's execution waves and flags any two
// stories that land in the SAME wave but share files — because quantum-loop's
// file-conflict filter will silently serialize them, costing you the parallelism you
// thought you planned. Disjoint files are something you engineer in /ql-plan; this
// catches it when you didn't.
//
// Usage:  node verification/lens-plan-lint.mjs [path/to/quantum.json] [--strict]
// Exit:   0 ok · 1 warnings (with --strict) · 2 hard errors
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const path = args.find(a => !a.startsWith('--')) ?? './quantum.json';

let plan;
try { plan = JSON.parse(readFileSync(path, 'utf8')); }
catch (e) { console.error(`FATAL: cannot read/parse ${path}: ${e.message}`); process.exit(2); }

const stories = plan.stories ?? [];
const ids = new Set(stories.map(s => s.id));
const errors = [];
const warns = [];

// quantum-loop's real footprint lives at tasks[].filePaths (lib/dag-query.sh:138
// aggregates [.tasks[]?.filePaths[]?] for its conflict filter). There is no
// story-level files[] field in the emitted quantum.json. We aggregate task
// filePaths and fall back to a legacy story-level files[] for tolerance.
const UI_FILE = /\.(tsx|jsx|vue|svelte)$/i;
const taskCommands = t => [
  ...(Array.isArray(t.commands) ? t.commands : []),
  ...(t.verify ? [t.verify] : []),            // legacy single-command shape
].map(String);
const filesOf = s => {
  const fromTasks = (s.tasks ?? []).flatMap(t => (t.filePaths ?? []).map(String));
  const legacy = (s.files ?? []).map(String); // legacy story-level footprint
  return [...new Set([...fromTasks, ...legacy])];
};
const runsVisualGate = s =>
  (s.tasks ?? []).some(t => taskCommands(t).some(c => /run-visual-gate\.sh/.test(c)));
const isUiStory = s => filesOf(s).some(f => UI_FILE.test(f)) || runsVisualGate(s);
const hasVisualGate = runsVisualGate;

// --- DAG validity: dangling deps + cycles (hard errors) ----------------------
for (const s of stories) {
  for (const d of s.dependsOn ?? []) {
    if (!ids.has(d)) errors.push(`${s.id}: dependsOn references unknown story "${d}"`);
  }
}
{ // cycle detection (DFS, 3-color)
  const color = new Map();
  const byId = new Map(stories.map(s => [s.id, s]));
  const visit = (id, stack) => {
    color.set(id, 'gray');
    for (const d of byId.get(id)?.dependsOn ?? []) {
      if (!ids.has(d)) continue;
      if (color.get(d) === 'gray') { errors.push(`dependency cycle: ${[...stack, id, d].join(' → ')}`); return; }
      if (!color.get(d)) visit(d, [...stack, id]);
    }
    color.set(id, 'black');
  };
  for (const s of stories) if (!color.get(s.id)) visit(s.id, []);
}

// --- per-story / per-task best practices (warnings) --------------------------
for (const s of stories) {
  // Matches lib/quantum-validate.sh::validate_story_filepaths — a story whose
  // tasks declare no filePaths silently bypasses quantum-loop's conflict filter.
  if (!filesOf(s).length) warns.push(`${s.id}: no filePaths in any task — parallelism can't be reasoned about and quantum-loop's conflict filter will bypass this story. Declare the files each task creates/edits in tasks[].filePaths.`);
  if (isUiStory(s) && !hasVisualGate(s)) warns.push(`${s.id}: looks like a UI story but no task runs the visual gate (run-visual-gate.sh). The Pixel Law needs pixel evidence.`);
  for (const t of s.tasks ?? []) {
    const hasEvidence = taskCommands(t).some(c => c.trim()) || t.testFirst === true || t.wiring_verification;
    if (!hasEvidence) warns.push(`${s.id}/${t.id ?? '?'}: task has no commands, test, or wiring check — Iron Law requires fresh evidence.`);
  }
}

// --- wave simulation (models quantum-loop) + same-wave file conflicts --------
// Mirrors lib/dag-query.sh: a story is eligible when every dependsOn is passed.
// quantum-loop then runs filter_file_conflicts, which greedily serializes
// same-wave stories that share files. We instead place all dep-ready stories in
// one wave and WARN on shared files — so for a clean plan (the goal state) our
// waves match the real scheduler exactly, and for a dirty plan we name the
// conflict the scheduler would silently serialize.
const done = new Set();
let remaining = [...stories];
const waves = [];
let guard = 0;
while (remaining.length && guard++ < stories.length + 2) {
  const ready = remaining.filter(s => (s.dependsOn ?? []).every(d => done.has(d) || !ids.has(d)));
  if (!ready.length) break; // unreachable stories (cycle/dangling already reported)
  waves.push(ready);
  ready.forEach(s => done.add(s.id));
  remaining = remaining.filter(s => !done.has(s.id));
}

waves.forEach((wave, i) => {
  if (wave.length < 2) return;
  for (let a = 0; a < wave.length; a++) {
    for (let b = a + 1; b < wave.length; b++) {
      const shared = filesOf(wave[a]).filter(f => filesOf(wave[b]).includes(f));
      if (shared.length) {
        warns.push(
          `WAVE ${i + 1}: ${wave[a].id} and ${wave[b].id} share file(s) [${shared.join(', ')}] — ` +
          `quantum-loop's file-conflict filter will SERIALIZE them. Split the shared file, ` +
          `or move one to a later wave on purpose.`
        );
      }
    }
  }
});

// --- report ------------------------------------------------------------------
console.log('Planned execution waves:');
waves.forEach((w, i) => {
  const tag = w.length > 1 ? `(parallel ×${w.length})` : '(sequential)';
  console.log(`  Wave ${i + 1} ${tag}: ${w.map(s => s.id).join(', ')}`);
});
console.log('');

if (errors.length) { console.log('ERRORS:'); errors.forEach(e => console.log(`  ✗ ${e}`)); }
if (warns.length)  { console.log('WARNINGS:'); warns.forEach(w => console.log(`  ⚠ ${w}`)); }
if (!errors.length && !warns.length) console.log('plan-lint: clean ✓');

if (errors.length) process.exit(2);
if (warns.length && strict) process.exit(1);
process.exit(0);
