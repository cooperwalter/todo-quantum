import { useEffect, useState } from 'react';
import { todayStr } from '../lib/dates';

function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(next.getTime() - now.getTime(), 0);
}

export function useToday(): string {
  const [today, setToday] = useState(() => todayStr(new Date()));

  useEffect(() => {
    const recompute = () => setToday(todayStr(new Date()));
    window.addEventListener('focus', recompute);

    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        recompute();
        arm();
      }, msUntilNextLocalMidnight(new Date()));
    };
    arm();

    return () => {
      window.removeEventListener('focus', recompute);
      clearTimeout(timer);
    };
  }, []);

  return today;
}
