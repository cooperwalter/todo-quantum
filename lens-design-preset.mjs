#!/usr/bin/env node
// templates/lens-design-preset.mjs
// Stamps a committed, opinionated starting design system into the project — offline, no LLM.
// Writes src/styles/tokens.css (the canonical token names the framework enforces) and appends
// a resolved-tokens section to DESIGN-SYSTEM.md. Every fg/bg pair is WCAG-AA checked before write.
//
// Usage:  node templates/lens-design-preset.mjs <editorial|brutalist|calm> [--out src/styles/tokens.css]
//
// These are *starting points* with a real point of view — refine them, or use the interactive
// lens-design skill for a bespoke system. They exist so "build the design system" can happen
// during init without a network or a Claude session.
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PRESETS = {
  editorial: {
    direction: 'Refined editorial — warm paper, ink-dark text, one terracotta accent, a characterful serif display.',
    unforgettable: 'A high-contrast serif display headline over generous whitespace.',
    fonts: {
      import: "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');",
      display: "'Fraunces', Georgia, serif", body: "'IBM Plex Sans', system-ui, sans-serif", mono: "'IBM Plex Mono', ui-monospace, monospace",
    },
    radius: { sm: '4px', md: '8px', lg: '16px', pill: '999px' },
    light: { bg: '#FBF7F0', surface: '#FFFFFF', fg: '#1C1917', muted: '#57534E', accent: '#92400E', 'accent-fg': '#FFFFFF', border: '#E7E0D5', danger: '#B91C1C' },
    dark:  { bg: '#1C1917', surface: '#292524', fg: '#FAF7F0', muted: '#A8A29E', accent: '#FB923C', 'accent-fg': '#1C1917', border: '#44403C', danger: '#F87171' },
  },
  brutalist: {
    direction: 'Brutalist — pure black/white, hard edges (no radius), one electric accent, monospaced detail.',
    unforgettable: 'Heavy 1px black borders and an electric-orange accent used sparingly and loudly.',
    fonts: {
      import: "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap');",
      display: "'Space Grotesk', system-ui, sans-serif", body: "'Space Grotesk', system-ui, sans-serif", mono: "'Space Mono', ui-monospace, monospace",
    },
    radius: { sm: '0', md: '0', lg: '0', pill: '0' },
    light: { bg: '#FFFFFF', surface: '#FFFFFF', fg: '#000000', muted: '#404040', accent: '#FF3B00', 'accent-fg': '#000000', border: '#000000', danger: '#CC0000' },
    dark:  { bg: '#000000', surface: '#0A0A0A', fg: '#FFFFFF', muted: '#B0B0B0', accent: '#FF5C33', 'accent-fg': '#000000', border: '#FFFFFF', danger: '#FF6B6B' },
  },
  calm: {
    direction: 'Calm minimal — soft neutrals, one refined teal accent, generous spacing, restrained motion.',
    unforgettable: 'Quiet surfaces with a single confident teal and a lot of room to breathe.',
    fonts: {
      import: "@import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
      display: "'Public Sans', system-ui, sans-serif", body: "'Public Sans', system-ui, sans-serif", mono: "'IBM Plex Mono', ui-monospace, monospace",
    },
    radius: { sm: '6px', md: '10px', lg: '18px', pill: '999px' },
    light: { bg: '#FAFAFA', surface: '#FFFFFF', fg: '#18181B', muted: '#52525B', accent: '#0F766E', 'accent-fg': '#FFFFFF', border: '#E4E4E7', danger: '#DC2626' },
    dark:  { bg: '#18181B', surface: '#27272A', fg: '#FAFAFA', muted: '#A1A1AA', accent: '#2DD4BF', 'accent-fg': '#18181B', border: '#3F3F46', danger: '#F87171' },
  },
};

const SPACE = [4, 8, 12, 16, 24, 32, 48, 64, 96];
const MOTION = { fast: '120ms', base: '240ms', slow: '480ms' };

// --- WCAG contrast ----------------------------------------------------------
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = hex => { const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// --- args -------------------------------------------------------------------
const args = process.argv.slice(2);
const name = args.find(a => !a.startsWith('--'));
const out = (args[args.indexOf('--out') + 1] && args.includes('--out')) ? args[args.indexOf('--out') + 1] : 'src/styles/tokens.css';
const preset = PRESETS[name];
if (!preset) { console.error(`Unknown preset "${name}". Options: ${Object.keys(PRESETS).join(', ')}`); process.exit(1); }

// --- contrast gate (fail before writing a preset that can't pass the a11y gate) ---
let hardFail = false;
for (const mode of ['light', 'dark']) {
  const p = preset[mode];
  const checks = [['fg/bg', p.fg, p.bg], ['fg/surface', p.fg, p.surface], ['accent-fg/accent', p['accent-fg'], p.accent], ['danger/bg', p.danger, p.bg]];
  for (const [label, a, b] of checks) {
    const r = ratio(a, b);
    if (r < 4.5) { console.error(`  ✗ ${name}/${mode} ${label}: ${r.toFixed(2)}:1 (< 4.5 AA)`); hardFail = true; }
  }
  const m = ratio(p.muted, p.bg);
  if (m < 4.5) console.warn(`  ⚠ ${name}/${mode} muted/bg: ${m.toFixed(2)}:1 (ok for large/secondary text only)`);
}
if (hardFail) { console.error('Preset has AA failures — not writing.'); process.exit(2); }

// --- emit tokens.css --------------------------------------------------------
const vars = mode => {
  const c = preset[mode];
  return Object.entries(c).map(([k, v]) => `  --color-${k}: ${v};`).join('\n');
};
const css = `/* quantum-lens design tokens — preset: ${name}. Generated; refine freely. */
${preset.fonts.import}

:root {
  /* type */
  --type-display: ${preset.fonts.display};
  --type-body: ${preset.fonts.body};
  --type-mono: ${preset.fonts.mono};
  /* space */
${SPACE.map((v, i) => `  --space-${i + 1}: ${v}px;`).join('\n')}
  /* radius */
${Object.entries(preset.radius).map(([k, v]) => `  --radius-${k}: ${v};`).join('\n')}
  /* motion */
${Object.entries(MOTION).map(([k, v]) => `  --motion-${k}: ${v};`).join('\n')}
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  /* color (light) */
${vars('light')}
}

[data-theme="dark"] {
${vars('dark')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${vars('dark')}
  }
}

@media (prefers-reduced-motion: reduce) {
  :root { --motion-fast: 0ms; --motion-base: 0ms; --motion-slow: 0ms; }
}
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, css);

// --- append resolved tokens to DESIGN-SYSTEM.md -----------------------------
if (existsSync('DESIGN-SYSTEM.md')) {
  const tbl = mode => `| token | ${mode} |\n| --- | --- |\n` +
    Object.entries(preset[mode]).map(([k, v]) => `| \`--color-${k}\` | \`${v}\` |`).join('\n');
  appendFileSync('DESIGN-SYSTEM.md',
`\n\n---\n\n## Resolved tokens (preset: ${name})\n\n> Generated by lens-design-preset. These are committed starting values — refine them, but keep the token *names* (they're contracts the gate enforces). Imported in \`${out}\`.\n\n**Direction:** ${preset.direction}\n**The unforgettable thing:** ${preset.unforgettable}\n\n**Type:** display \`${preset.fonts.display}\` · body \`${preset.fonts.body}\` · mono \`${preset.fonts.mono}\`\n\n${tbl('light')}\n\n${tbl('dark')}\n`);
}

console.log(`design preset "${name}" → ${out}  (AA-checked ✓)`);
console.log('Import it once in your app entry CSS:  @import "./styles/tokens.css";  (or link it)');
