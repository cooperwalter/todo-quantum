import { nextOccurrence } from './recurrence';
import type { AppData, Task } from './types';

export interface StoreState {
  data: AppData;
  undoStack: MutatingAction[];
  redoStack: MutatingAction[];
}

export type MutatingAction =
  | { type: 'add'; task: Omit<Task, 'order'> }
  | { type: 'complete'; id: string; completedAt: string; today: string; newId: string }
  | { type: 'uncomplete'; id: string }
  | { type: 'edit'; id: string; changes: Partial<Omit<Task, 'id'>> }
  | { type: 'delete'; id: string }
  | { type: 'snooze'; id: string; dueDate: string }
  | { type: 'restore'; task: Task; index: number }
  | { type: 'markDone'; id: string; completedAt: string | null }
  | { type: 'revertComplete'; id: string; spawnedId: string | null; completedAt: string; today: string };

export type Action =
  | MutatingAction
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'externalReload'; data: AppData };

const UNDO_CAP = 50;

export function initialStoreState(data: AppData): StoreState {
  return { data, undoStack: [], redoStack: [] };
}

function nextOrder(data: AppData): number {
  return data.tasks.reduce((max, t) => Math.max(max, t.order), 0) + 1;
}

function replaceTask(data: AppData, id: string, update: (task: Task) => Task): AppData {
  return { ...data, tasks: data.tasks.map((t) => (t.id === id ? update(t) : t)) };
}

interface ApplyResult {
  data: AppData;
  inverse: MutatingAction;
}

function apply(data: AppData, action: MutatingAction): ApplyResult | null {
  switch (action.type) {
    case 'add': {
      const task: Task = { ...action.task, order: nextOrder(data) };
      return {
        data: { ...data, tasks: [...data.tasks, task] },
        inverse: { type: 'delete', id: task.id },
      };
    }
    case 'restore': {
      const tasks = [...data.tasks];
      tasks.splice(action.index, 0, action.task);
      return {
        data: { ...data, tasks },
        inverse: { type: 'delete', id: action.task.id },
      };
    }
    case 'delete': {
      const index = data.tasks.findIndex((t) => t.id === action.id);
      if (index === -1) return null;
      const task = data.tasks[index];
      return {
        data: { ...data, tasks: data.tasks.filter((t) => t.id !== action.id) },
        inverse: { type: 'restore', task, index },
      };
    }
    case 'complete': {
      const task = data.tasks.find((t) => t.id === action.id);
      if (task === undefined || task.status === 'done') return null;
      let completed = replaceTask(data, action.id, (t) => ({
        ...t,
        status: 'done' as const,
        completedAt: action.completedAt,
      }));
      let spawnedId: string | null = null;
      if (task.recurrence !== null) {
        const anchor = task.dueDate ?? action.today;
        const spawn: Task = {
          id: action.newId,
          title: task.title,
          status: 'open',
          dueDate: nextOccurrence(task.recurrence, anchor, action.today),
          dueTime: task.dueTime,
          list: task.list,
          priority: task.priority,
          recurrence: task.recurrence,
          createdAt: action.completedAt,
          completedAt: null,
          order: nextOrder(completed),
        };
        completed = { ...completed, tasks: [...completed.tasks, spawn] };
        spawnedId = spawn.id;
      }
      return {
        data: completed,
        inverse: {
          type: 'revertComplete',
          id: action.id,
          spawnedId,
          completedAt: action.completedAt,
          today: action.today,
        },
      };
    }
    case 'revertComplete': {
      const task = data.tasks.find((t) => t.id === action.id);
      if (task === undefined) return null;
      const withoutSpawn =
        action.spawnedId === null
          ? data
          : { ...data, tasks: data.tasks.filter((t) => t.id !== action.spawnedId) };
      const reopened = replaceTask(withoutSpawn, action.id, (t) => ({
        ...t,
        status: 'open' as const,
        completedAt: null,
      }));
      return {
        data: reopened,
        inverse: {
          type: 'complete',
          id: action.id,
          completedAt: action.completedAt,
          today: action.today,
          newId: action.spawnedId ?? action.id,
        },
      };
    }
    case 'uncomplete': {
      const task = data.tasks.find((t) => t.id === action.id);
      if (task === undefined || task.status === 'open') return null;
      const reopened = replaceTask(data, action.id, (t) => ({
        ...t,
        status: 'open' as const,
        completedAt: null,
      }));
      return {
        data: reopened,
        inverse: { type: 'markDone', id: action.id, completedAt: task.completedAt },
      };
    }
    case 'markDone': {
      const task = data.tasks.find((t) => t.id === action.id);
      if (task === undefined) return null;
      const done = replaceTask(data, action.id, (t) => ({
        ...t,
        status: 'done' as const,
        completedAt: action.completedAt,
      }));
      return { data: done, inverse: { type: 'uncomplete', id: action.id } };
    }
    case 'edit': {
      const task = data.tasks.find((t) => t.id === action.id);
      if (task === undefined) return null;
      const prevChanges: Partial<Omit<Task, 'id'>> = {};
      for (const key of Object.keys(action.changes) as (keyof Omit<Task, 'id'>)[]) {
        (prevChanges as Record<string, unknown>)[key] = task[key];
      }
      const edited = replaceTask(data, action.id, (t) => ({ ...t, ...action.changes }));
      return { data: edited, inverse: { type: 'edit', id: action.id, changes: prevChanges } };
    }
    case 'snooze': {
      const task = data.tasks.find((t) => t.id === action.id);
      if (task === undefined) return null;
      const prev = task.dueDate;
      const snoozed = replaceTask(data, action.id, (t) => ({ ...t, dueDate: action.dueDate }));
      return {
        data: snoozed,
        inverse: { type: 'edit', id: action.id, changes: { dueDate: prev } },
      };
    }
  }
}

function pushCapped(stack: MutatingAction[], action: MutatingAction): MutatingAction[] {
  const next = [...stack, action];
  return next.length > UNDO_CAP ? next.slice(next.length - UNDO_CAP) : next;
}

export function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'undo': {
      const inverse = state.undoStack[state.undoStack.length - 1];
      if (inverse === undefined) return state;
      const result = apply(state.data, inverse);
      if (result === null) return state;
      return {
        data: result.data,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, result.inverse],
      };
    }
    case 'redo': {
      const forward = state.redoStack[state.redoStack.length - 1];
      if (forward === undefined) return state;
      const result = apply(state.data, forward);
      if (result === null) return state;
      return {
        data: result.data,
        undoStack: pushCapped(state.undoStack, result.inverse),
        redoStack: state.redoStack.slice(0, -1),
      };
    }
    case 'externalReload': {
      return { data: action.data, undoStack: [], redoStack: [] };
    }
    default: {
      const result = apply(state.data, action);
      if (result === null) return state;
      return {
        data: result.data,
        undoStack: pushCapped(state.undoStack, result.inverse),
        redoStack: [],
      };
    }
  }
}
