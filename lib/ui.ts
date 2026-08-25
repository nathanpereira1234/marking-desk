import type { Verdict } from './types';

export const VERDICT: Record<
  Verdict,
  { glyph: string; label: string; text: string; bg: string; border: string }
> = {
  correct: {
    glyph: '✓',
    label: 'Correct',
    text: 'text-tick',
    bg: 'bg-tick/10',
    border: 'border-tick',
  },
  partial: {
    glyph: '±',
    label: 'Partly right',
    text: 'text-query',
    bg: 'bg-query/10',
    border: 'border-query',
  },
  incorrect: {
    glyph: '✕',
    label: 'Incorrect',
    text: 'text-pen',
    bg: 'bg-pen/10',
    border: 'border-pen',
  },
  unanswered: {
    glyph: '—',
    label: 'Not attempted',
    text: 'text-graphite',
    bg: 'bg-rule/50',
    border: 'border-rule',
  },
};

/** 0-1000 box to CSS percentages. */
export function boxStyle(box: [number, number, number, number], pad = 6) {
  const [ymin, xmin, ymax, xmax] = box;
  const top = Math.max(0, ymin - pad) / 10;
  const left = Math.max(0, xmin - pad) / 10;
  const bottom = Math.min(1000, ymax + pad) / 10;
  const right = Math.min(1000, xmax + pad) / 10;
  return {
    top: `${top}%`,
    left: `${left}%`,
    height: `${Math.max(0, bottom - top)}%`,
    width: `${Math.max(0, right - left)}%`,
  };
}
