import './BrushStroke.css';

// A tapered sumi stroke: an organic filled path (thin at the ends, swelling in
// the middle), stretched across the title width via preserveAspectRatio="none".
// Not a rect, not a straight line — the brush leaves an inked edge.
const STROKE_PATH =
  'M0,6 C16,4.5 34,3.5 52,3.4 C72,3.3 88,3.9 100,4.7 C99,5.1 99,5.5 100,5.9 ' +
  'C88,6.9 72,7.6 52,7.6 C34,7.6 16,7 0,6 Z';

export interface BrushStrokeProps {
  /** Play the left→right draw-in (open→done transition); otherwise render settled. */
  drawing?: boolean;
  /** Fired when the draw-in animation finishes, so the row can settle to muted. */
  onDrawn?: () => void;
}

export function BrushStroke({ drawing = false, onDrawn }: BrushStrokeProps) {
  return (
    <svg
      className={`brush-stroke ${drawing ? 'brush-stroke--drawing' : 'brush-stroke--settled'}`}
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      aria-hidden="true"
      onAnimationEnd={drawing ? onDrawn : undefined}
    >
      <path d={STROKE_PATH} />
    </svg>
  );
}
