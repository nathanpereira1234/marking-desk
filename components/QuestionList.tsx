'use client';

import { useMemo, useState } from 'react';
import type { Question, QuestionResult, UnmatchedAnswer, AnswerSegment } from '@/lib/types';
import { VERDICT } from '@/lib/ui';

type Filter = 'all' | 'unanswered' | 'check';

export default function QuestionList({
  questions,
  results,
  unmatched,
  segments,
  selectedQuestion,
  selectedSegment,
  onSelectQuestion,
  onSelectSegment,
}: {
  questions: Question[];
  results: Map<string, QuestionResult>;
  unmatched: UnmatchedAnswer[];
  segments: Map<string, AnswerSegment>;
  selectedQuestion: string | null;
  selectedSegment: string | null;
  onSelectQuestion: (id: string) => void;
  onSelectSegment: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(() => {
    return questions.filter((q) => {
      const r = results.get(q.id);
      if (!r) return false;
      if (filter === 'unanswered') return r.verdict === 'unanswered';
      if (filter === 'check') return r.segmentIds.length > 0 && r.confidence < 0.8;
      return true;
    });
  }, [questions, results, filter]);

  const counts = useMemo(() => {
    let unanswered = 0;
    let check = 0;
    results.forEach((r) => {
      if (r.verdict === 'unanswered') unanswered++;
      else if (r.confidence < 0.8) check++;
    });
    return { unanswered, check };
  }, [results]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: `All ${questions.length}` },
    { key: 'unanswered', label: `Skipped ${counts.unanswered}` },
    { key: 'check', label: `Worth checking ${counts.check}` },
  ];

  let lastSection: string | null = null;

  return (
    <div className="flex h-full flex-col border-r border-rule bg-card">
      <div className="flex shrink-0 gap-1 border-b border-rule px-3 py-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-sm px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
              filter === f.key
                ? 'bg-ink text-paper'
                : 'text-graphite hover:bg-markerSoft hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ol className="scroll-slim min-h-0 flex-1 overflow-y-auto">
        {visible.map((q) => {
          const r = results.get(q.id)!;
          const v = VERDICT[r.verdict];
          const active = selectedQuestion === q.id;
          const header = q.section && q.section !== lastSection ? q.section : null;
          if (q.section) lastSection = q.section;

          return (
            <li key={q.id}>
              {header && filter === 'all' && (
                <p className="eyebrow sticky top-0 z-10 border-b border-rule bg-paper px-4 py-2">
                  {header}
                </p>
              )}
              <button
                type="button"
                onClick={() => onSelectQuestion(q.id)}
                aria-current={active}
                className={`flex w-full gap-3 border-b border-l-2 border-b-rule px-4 py-3 text-left transition-colors ${
                  active
                    ? 'border-l-marker bg-markerSoft'
                    : 'border-l-transparent hover:bg-paper'
                }`}
              >
                <span className="mt-[1px] w-14 shrink-0 font-mono text-[13px] font-medium text-ink">
                  {q.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-[13px] leading-snug text-graphite">
                    {q.text}
                  </span>
                  {r.segmentIds.length > 0 && r.confidence < 0.8 && (
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-query">
                      Check this match
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`font-mono text-[13px] leading-none ${v.text}`}>
                    {v.glyph}
                  </span>
                  <span className="font-mono text-[11px] text-graphite">
                    {r.verdict === 'unanswered' ? `0/${r.max}` : `${r.awarded}/${r.max}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}

        {visible.length === 0 && (
          <p className="px-4 py-6 text-sm text-graphite">
            {filter === 'unanswered'
              ? 'Every question on this paper was attempted.'
              : 'Every match came back confident.'}
          </p>
        )}

        {unmatched.length > 0 && filter === 'all' && (
          <li className="border-t-2 border-rule">
            <p className="eyebrow px-4 py-2 text-query">
              Writing that matches no question · {unmatched.length}
            </p>
            {unmatched.map((u) => {
              const seg = segments.get(u.segmentId);
              if (!seg) return null;
              const active = selectedSegment === u.segmentId;
              return (
                <button
                  key={u.segmentId}
                  type="button"
                  onClick={() => onSelectSegment(u.segmentId)}
                  className={`flex w-full flex-col gap-1 border-b border-l-2 border-b-rule px-4 py-3 text-left transition-colors ${
                    active
                      ? 'border-l-query bg-query/10'
                      : 'border-l-transparent hover:bg-paper'
                  }`}
                >
                  <span className="font-mono text-[11px] text-graphite">
                    Page {seg.regions[0].page + 1}
                    {seg.writtenLabel ? ` · student wrote “${seg.writtenLabel}”` : ''}
                  </span>
                  <span className="line-clamp-2 text-[13px] leading-snug text-ink">
                    {seg.text}
                  </span>
                  <span className="text-[12px] leading-snug text-query">{u.reason}</span>
                </button>
              );
            })}
          </li>
        )}
      </ol>
    </div>
  );
}
