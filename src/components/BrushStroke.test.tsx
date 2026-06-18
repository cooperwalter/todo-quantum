// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BrushStroke } from './BrushStroke';

afterEach(cleanup);

function svg(): SVGSVGElement {
  return document.querySelector('svg.brush-stroke') as unknown as SVGSVGElement;
}

describe('BrushStroke', () => {
  it('renders an aria-hidden SVG so it is invisible to assistive tech', () => {
    render(<BrushStroke />);
    expect(svg().getAttribute('aria-hidden')).toBe('true');
  });

  it('draws an organic curved stroke, not a straight line', () => {
    render(<BrushStroke />);
    const d = svg().querySelector('path')?.getAttribute('d') ?? '';
    expect(d).toMatch(/[CQ]/); // contains cubic/quadratic Bézier curve commands
  });

  it('stretches to the title width (preserveAspectRatio none)', () => {
    render(<BrushStroke />);
    expect(svg().getAttribute('preserveAspectRatio')).toBe('none');
  });

  it('renders the settled variant by default', () => {
    render(<BrushStroke />);
    expect(svg().getAttribute('class')).toContain('brush-stroke--settled');
    expect(svg().getAttribute('class')).not.toContain('brush-stroke--drawing');
  });

  it('renders the drawing variant when drawing', () => {
    render(<BrushStroke drawing />);
    expect(svg().getAttribute('class')).toContain('brush-stroke--drawing');
    expect(svg().getAttribute('class')).not.toContain('brush-stroke--settled');
  });
});
