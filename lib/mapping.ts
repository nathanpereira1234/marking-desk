import type { AnswerSegment, Question, QuestionResult } from './types';

/**
 * "Q.11 (a)" , "11a)" , "11 - A" and "11(A)" are the same question to a teacher.
 * Reduce every written form to a comparable key.
 */
export function normaliseLabel(label: string | null | undefined): string {
  if (!label) return '';
  return label
    .toLowerCase()
    .replace(/\b(?:q(?:uestion)?|ans(?:wer)?|no|sl)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Position of a segment on the sheet, used for reading order and out-of-order checks. */
export function segmentPosition(seg: AnswerSegment): number {
  const first = seg.regions[0];
  return first ? first.page * 1000 + first.box[0] : Number.MAX_SAFE_INTEGER;
}

export interface LabelHint {
  questionId: string;
  segmentId: string;
}

/** Unambiguous label matches, handed to the model as a starting point. */
export function labelHints(questions: Question[], segments: AnswerSegment[]): LabelHint[] {
  const byKey = new Map<string, Question[]>();
  for (const q of questions) {
    const key = normaliseLabel(q.label);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) || []), q]);
  }

  const hints: LabelHint[] = [];
  const used = new Set<string>();
  for (const seg of segments) {
    const key = normaliseLabel(seg.writtenLabel);
    if (!key) continue;
    const candidates = byKey.get(key);
    if (candidates && candidates.length === 1 && !used.has(candidates[0].id)) {
      used.add(candidates[0].id);
      hints.push({ questionId: candidates[0].id, segmentId: seg.id });
    }
  }
  return hints;
}

/**
 * How many answers were written away from their place in the paper's order.
 * Counted by walking the matched questions in printed order and flagging every
 * one whose answer sits earlier on the sheet than the answer before it.
 */
export function countOutOfOrder(
  questions: Question[],
  segments: AnswerSegment[],
  results: QuestionResult[]
): number {
  const segById = new Map(segments.map((s) => [s.id, s]));
  const qOrder = new Map(questions.map((q) => [q.id, q.order]));

  const placed = results
    .filter((r) => r.segmentIds.length > 0)
    .map((r) => ({
      order: qOrder.get(r.questionId) ?? 0,
      pos: Math.min(
        ...r.segmentIds.map((id) => {
          const s = segById.get(id);
          return s ? segmentPosition(s) : Number.MAX_SAFE_INTEGER;
        })
      ),
    }))
    .sort((a, b) => a.order - b.order);

  let count = 0;
  let high = -1;
  for (const p of placed) {
    if (p.pos < high) count++;
    else high = p.pos;
  }
  return count;
}
