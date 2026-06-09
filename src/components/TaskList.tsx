import { useState } from 'react';
import './TaskList.css';
import { TaskRow } from './TaskRow';
import type { Task } from '../lib/types';

export interface TaskListSection {
  label: string;
  tasks: Task[];
  rollover?: boolean;
}

export interface TaskListProps {
  sections: TaskListSection[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

export function TaskList({ sections, selectedId, onSelect }: TaskListProps) {
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const controlled = selectedId !== undefined;
  const selected = controlled ? selectedId : internalSelected;

  const visibleSections = sections.filter((s) => s.tasks.length > 0);
  if (visibleSections.length === 0) {
    return <p className="empty-state">Nothing on deck — type to capture.</p>;
  }

  function handleSelect(id: string) {
    if (!controlled) setInternalSelected(id);
    onSelect?.(id);
  }

  const allTasks = visibleSections.flatMap((s) => s.tasks);
  const firstId = allTasks[0]?.id ?? null;
  const hasSelection = selected !== null && allTasks.some((t) => t.id === selected);

  return (
    <div className="task-list">
      {visibleSections.map((section) => (
        <section key={section.label}>
          <h2 className="task-section-label">{section.label}</h2>
          <ul className="task-section">
            {section.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                rollover={section.rollover ?? false}
                selected={task.id === selected}
                tabIndex={
                  task.id === selected || (!hasSelection && task.id === firstId) ? 0 : -1
                }
                onSelect={handleSelect}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
