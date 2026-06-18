import { useLayoutEffect, useRef } from 'react';
import { TaskList } from '../components/TaskList';
import { useToday } from '../hooks/useToday';
import { todayItems } from '../lib/selectors';
import { useApp } from '../state/AppContext';

const ROW_STAGGER_MS = 40;
// DESIGN-SYSTEM §5: the ink rule draws first (--motion-slow), THEN rows fade up.
// The base delay is the token itself — a contract with the masthead rule, never a
// hardcoded ms — and the per-row stagger rides on top of it. The step count is
// capped so a long list does not delay the last paint by seconds (FR-48 budget).
const ROW_STAGGER_MAX_STEPS = 12;

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
      const steps = Math.min(index, ROW_STAGGER_MAX_STEPS);
      row.style.animationDelay = `calc(var(--motion-slow) + ${steps * ROW_STAGGER_MS}ms)`;
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
