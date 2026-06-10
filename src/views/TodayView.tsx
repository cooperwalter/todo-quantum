import { useLayoutEffect, useRef } from 'react';
import { TaskList } from '../components/TaskList';
import { useToday } from '../hooks/useToday';
import { todayItems } from '../lib/selectors';
import { useApp } from '../state/AppContext';

const ROW_STAGGER_MS = 40;
const ROW_REVEAL_BASE_DELAY_MS = 120;
// DESIGN-SYSTEM §5: the whole reveal fits within --motion-slow (480ms). With
// long lists an uncapped stagger delays the largest paint by seconds and
// blows the FR-48 performance budget under load.
const ROW_REVEAL_MAX_DELAY_MS = 480;

export function TodayView() {
  const { state, selectedTaskId, setSelectedTaskId } = useApp();
  const today = useToday();
  const regionRef = useRef<HTMLDivElement | null>(null);
  const revealPlayed = useRef(false);

  useLayoutEffect(() => {
    if (revealPlayed.current) return;
    revealPlayed.current = true;
    const rows = regionRef.current?.querySelectorAll<HTMLElement>('.task-row') ?? [];
    rows.forEach((row, index) => {
      row.classList.add('task-row--reveal');
      row.style.animationDelay = `${Math.min(ROW_REVEAL_BASE_DELAY_MS + index * ROW_STAGGER_MS, ROW_REVEAL_MAX_DELAY_MS)}ms`;
    });
    return () => {
      revealPlayed.current = false;
    };
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
