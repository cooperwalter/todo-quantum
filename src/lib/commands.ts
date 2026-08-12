import type { Action } from './store';

export type CommandViewId = 'today' | 'upcoming' | 'all' | 'done';

export interface CommandContext {
  setView: (view: CommandViewId) => void;
  dispatch: (action: Action) => void;
  openCheatsheet: () => void;
  switchUser: () => void;
}

export interface Command {
  id: string;
  label: string;
  run: (ctx: CommandContext) => void;
}

const VIEW_IDS: CommandViewId[] = ['today', 'upcoming', 'all', 'done'];

export const COMMANDS: Command[] = [
  ...VIEW_IDS.map((view) => ({
    id: view,
    label: view,
    run: (ctx: CommandContext) => ctx.setView(view),
  })),
  { id: 'undo', label: 'undo', run: (ctx) => ctx.dispatch({ type: 'undo' }) },
  { id: 'redo', label: 'redo', run: (ctx) => ctx.dispatch({ type: 'redo' }) },
  { id: 'help', label: 'help', run: (ctx) => ctx.openCheatsheet() },
  { id: 'user', label: 'user', run: (ctx) => ctx.switchUser() },
];

export function fuzzySubsequence(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let ti = 0;
  for (const ch of q) {
    ti = t.indexOf(ch, ti);
    if (ti === -1) return false;
    ti += 1;
  }
  return true;
}

export function fuzzyMatch(query: string, commands: Command[]): Command[] {
  return commands.filter((c) => fuzzySubsequence(query, c.label));
}
