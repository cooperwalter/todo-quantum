import { useLayoutEffect, useRef } from 'react';
import { TaskList } from '../components/TaskList';
import { useToday } from '../hooks/useToday';
import { todayItems } from '../lib/selectors';
import { useApp } from '../state/AppContext';

const ROW_STAGGER_MS = 40;
const ROW_REVEAL_BASE_DELAY_MS = 120;

let revealPlayed = false;

export function TodayView() {
  const { state, selectedTaskId, setSelectedTaskId } = useApp();
  const today = useToday();
  const regionRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (revealPlayed) return;
    revealPlayed = true;
    const rows = regionRef.current?.querySelectorAll<HTMLElement>('.task-row') ?? [];
    rows.forEach((row, index) => {
      row.classList.add('task-row--reveal');
      row.style.animationDelay = `${ROW_REVEAL_BASE_DELAY_MS + index * ROW_STAGGER_MS}ms`;
    });
  }, []);

  const sections = todayItems(state.data, today);
  return (
    <div ref={regionRef} className="today-view">
      <TaskList
        selectedId={selectedTaskId}
        onSelect={setSelectedTaskId}
        sections={[
          { label: 'Rollover', tasks: sections.rollover, rollover: true },
          { label: 'Due today', tasks: sections.dueToday },
          { label: 'Anytime', tasks: sections.anytime },
        ]}
      />
    </div>
  );
}
