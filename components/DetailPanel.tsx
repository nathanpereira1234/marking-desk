'use client';

import type {
  AnswerSegment,
  GradedPaper,
  Question,
  QuestionResult,
} from '@/lib/types';
import { VERDICT } from '@/lib/ui';

function MarkStepper({
  awarded,
  max,
  edited,
  onChange,
}: {
  awarded: number;
  max: number;
  edited: boolean;
  onChange: (v: number) => void;
}) {
  const step = 0.5;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Take off half a mark"
        onClick={() => onChange(Math.max(0, awarded - step))}
        className="h-7 w-7 border border-rule font-mono text-sm hover:border-ink"
      >
        –
      </button>
      <span className="font-mono text-lg tabular-nums">
        {awarded}
        <span className="text-graphite">/{max}</span>
      </span>
      <button
        type="button"
        aria-label="Add half a mark"
        onClick={() => onChange(Math.min(max, awarded + step))}
        className="h-7 w-7 border border-rule font-mono text-sm hover:border-ink"
      >
        +
      </button>
      {edited && (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-marker">
          Changed by you
        </span>
      )}
    </div>
  );
}

export default function DetailPanel({
  question,
  result,
  segments,
  unmatchedSegment,
  unmatchedReason,
  graded,
  awardedOverride,
  onMark,
  modelName,
}: {
  question: Question | null;
  result: QuestionResult | null;
  segments: AnswerSegment[];
  unmatchedSegment: AnswerSegment | null;
  unmatchedReason: string | null;
  graded: GradedPaper;
  awardedOverride: number | null;
  onMark: (questionId: string, value: number) => void;
  modelName: string;
}) {
  if (unmatchedSegment) {
    return (
      <aside className="scroll-slim h-full overflow-y-auto border-l border-rule bg-card px-5 py-5">
        <p className="eyebrow text-query">Unmatched writing</p>
        <p className="mt-3 text-sm leading-relaxed text-ink">{unmatchedReason}</p>
        <p className="mt-5 eyebrow">What the student wrote</p>
        <p className="mt-2 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink">
          {unmatchedSegment.text}
        </p>
        <p className="mt-5 font-mono text-[11px] text-graphite">
          Page {unmatchedSegment.regions[0].page + 1}
          {unmatchedSegment.writtenLabel
            ? ` · numbered “${unmatchedSegment.writtenLabel}” by the student`
            : ' · no question number written'}
        </p>
      </aside>
    );
  }

  if (!question || !result) {
    const s = graded.summary;
    return (
      <aside className="scroll-slim h-full overflow-y-auto border-l border-rule bg-card px-5 py-5">
        <p className="eyebrow">How it went</p>
        <p className="mt-3 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink">
          {s.overallFeedback || 'No overall feedback was produced for this paper.'}
        </p>

        <dl className="mt-6 space-y-3 border-t border-rule pt-4">
          {[
            ['Answered', `${s.answered}`],
            ['Left out', `${s.unanswered}`],
            ['Answered out of order', `${s.outOfOrder}`],
            ['Writing matching nothing', `${graded.unmatched.length}`],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-graphite">{k}</dt>
              <dd className="font-mono text-[15px] tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 border-t border-rule pt-4 font-mono text-[11px] leading-relaxed text-graphite">
          Read by {modelName}. Marks are a first pass — open each question and adjust
          before you enter them anywhere.
        </p>
      </aside>
    );
  }

  const awarded = awardedOverride ?? result.awarded;
  const v = VERDICT[result.verdict];
  const answered = result.segmentIds.length > 0;

  return (
    <aside className="scroll-slim h-full overflow-y-auto border-l border-rule bg-card px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[15px] font-medium">{question.label}</p>
        <span
          className={`border px-2 py-[2px] font-mono text-[10px] uppercase tracking-[0.1em] ${v.text} ${v.border} ${v.bg}`}
        >
          {v.label}
        </span>
      </div>

      <p className="mt-3 text-[14px] leading-relaxed text-ink">{question.text}</p>
      {question.marks !== null && (
        <p className="mt-2 font-mono text-[11px] text-graphite">
          Printed on the paper as {question.marks} mark{question.marks === 1 ? '' : 's'}
        </p>
      )}

      <div className="mt-6 border-t border-rule pt-4">
        <p className="eyebrow">Marks</p>
        <div className="mt-2">
          <MarkStepper
            awarded={awarded}
            max={result.max}
            edited={awardedOverride !== null && awardedOverride !== result.awarded}
            onChange={(val) => onMark(question.id, val)}
          />
        </div>
      </div>

      <div className="mt-6 border-t border-rule pt-4">
        <p className="eyebrow">Feedback</p>
        <p className="mt-2 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink">
          {result.feedback}
        </p>
      </div>

      {answered && (
        <div className="mt-6 border-t border-rule pt-4">
          <p className="eyebrow">
            What the student wrote
            <span className="ml-2 normal-case tracking-normal text-graphite">
              {result.method === 'label'
                ? 'matched on the number they wrote'
                : 'matched on content'}
              {' · '}
              {Math.round(result.confidence * 100)}% sure
            </span>
          </p>
          {result.note && (
            <p className="mt-2 border-l-2 border-query pl-3 text-[13px] leading-relaxed text-query">
              {result.note}
            </p>
          )}
          {segments.map((s) => (
            <div key={s.id} className="mt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
                Page {s.regions[0].page + 1}
                {s.isContinuation ? ' · continued' : ''}
              </p>
              <p className="mt-1 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink">
                {s.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {!answered && (
        <p className="mt-6 border-t border-rule pt-4 text-[14px] leading-relaxed text-graphite">
          Nothing on the sheet answers this question. If you can see writing for it, open
          “Outline every block” above the sheet to check what was picked up.
        </p>
      )}
    </aside>
  );
}
