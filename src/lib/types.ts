export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;
  byWeekday: number[] | null;
  byMonthDay: number | null;
}

export interface Task {
  id: string;
  title: string;
  status: 'open' | 'done';
  dueDate: string | null;
  dueTime: string | null;
  list: string | null;
  priority: 1 | 2 | 3 | null;
  recurrence: Recurrence | null;
  createdAt: string;
  completedAt: string | null;
  order: number;
}

export interface AppData {
  schemaVersion: 1;
  tasks: Task[];
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LoadResult = {
  ok: true;
  data: AppData;
  recovered: boolean;
};

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };
