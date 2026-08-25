'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Intake from '@/components/Intake';
import QuestionList from '@/components/QuestionList';
import SheetViewer from '@/components/SheetViewer';
import DetailPanel from '@/components/DetailPanel';
import { runPipeline, type PipelineOutput } from '@/lib/pipeline';
import type { Progress } from '@/lib/types';

const MODEL_LABEL = 'Gemini 2.5 Flash';

export default function Page() {
  const [progress, setProgress] = useState<Progress>({
    stage: 'idle',
    message: '',
    percent: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<PipelineOutput | null>(null);

  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [showAllBlocks, setShowAllBlocks] = useState(false);
  const [pane, setPane] = useState<'questions' | 'sheet'>('questions');

  const start = useCallback(async (paper: File[], sheet: File[]) => {
    setError(null);
    try {
      const result = await runPipeline(paper, sheet, setProgress);
      setOut(result);
      const firstAnswered = result.graded.results.find((r) => r.segmentIds.length > 0);
      setSelectedQuestion(firstAnswered?.questionId ?? null);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong while reading the documents.');
      setProgress({ stage: 'error', message: '', percent: 0 });
    }
  }, []);

  const reset = () => {
    setOut(null);
    setError(null);
    setOverrides({});
    setSelectedQuestion(null);
    setSelectedSegment(null);
    setProgress({ stage: 'idle', message: '', percent: 0 });
  };

  const resultsMap = useMemo(
    () => new Map((out?.graded.results || []).map((r) => [r.questionId, r])),
    [out]
  );
  const segmentsMap = useMemo(
    () => new Map((out?.segments || []).map((s) => [s.id, s])),
    [out]
  );
  const questionsMap = useMemo(
    () => new Map((out?.questions || []).map((q) => [q.id, q])),
    [out]
  );

  const activeQuestion = selectedQuestion ? questionsMap.get(selectedQuestion) ?? null : null;
  const activeResult = selectedQuestion ? resultsMap.get(selectedQuestion) ?? null : null;
  const activeSegments = useMemo(
    () =>
      (activeResult?.segmentIds || [])
        .map((id) => segmentsMap.get(id))
        .filter(Boolean) as NonNullable<ReturnType<typeof segmentsMap.get>>[],
    [activeResult, segmentsMap]
  );

  const unmatchedSegment = selectedSegment ? segmentsMap.get(selectedSegment) ?? null : null;
  const unmatchedReason =
    (out?.graded.unmatched.find((u) => u.segmentId === selectedSegment)?.reason) ?? null;

  const activeRegions = useMemo(() => {
    if (unmatchedSegment) return unmatchedSegment.regions;
    return activeSegments.flatMap((s) => s.regions);
  }, [activeSegments, unmatchedSegment]);

  const total = useMemo(() => {
    if (!out) return { awarded: 0, max: 0 };
    let awarded = 0;
    let max = 0;
    for (const r of out.graded.results) {
      awarded += overrides[r.questionId] ?? r.awarded;
      max += r.max;
    }
    return { awarded, max };
  }, [out, overrides]);

  // arrow keys walk the question list — marking is a keyboard job
  useEffect(() => {
    if (!out) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && ['INPUT', 'TEXTAREA'].includes(el.tagName)) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const ids = out.questions.map((q) => q.id);
      const i = selectedQuestion ? ids.indexOf(selectedQuestion) : -1;
      const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
      if (next >= 0 && next < ids.length) {
        setSelectedSegment(null);
        setSelectedQuestion(ids[next]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [out, selectedQuestion]);

  if (!out) {
    return <Intake progress={progress} error={error} onStart={start} />;
  }

  const s = out.graded.summary;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule bg-card px-4 py-3">
        <div>
          <p className="eyebrow">Marking desk</p>
          <p className="font-serif text-[22px] leading-none tabular-nums">
            {total.awarded}
            <span className="text-graphite">/{total.max}</span>
          </p>
        </div>

        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px]">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-graphite">Answered</dt>
            <dd className="font-mono tabular-nums">{s.answered}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-graphite">Left out</dt>
            <dd className={`font-mono tabular-nums ${s.unanswered ? 'text-pen' : ''}`}>
              {s.unanswered}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-graphite">Out of order</dt>
            <dd className="font-mono tabular-nums">{s.outOfOrder}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-graphite">Unmatched</dt>
            <dd
              className={`font-mono tabular-nums ${
                out.graded.unmatched.length ? 'text-query' : ''
              }`}
            >
              {out.graded.unmatched.length}
            </dd>
          </div>
        </dl>

        <div className="ml-auto flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setSelectedQuestion(null);
              setSelectedSegment(null);
            }}
            className="border-b border-transparent pb-[2px] text-sm text-graphite hover:border-ink hover:text-ink"
          >
            Paper summary
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-sm border border-rule px-3 py-1.5 text-sm hover:border-ink"
          >
            New paper
          </button>
        </div>
      </header>

      {/* pane switch, small screens only */}
      <div className="flex shrink-0 gap-1 border-b border-rule bg-paper px-3 py-2 lg:hidden">
        {(['questions', 'sheet'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPane(p)}
            className={`rounded-sm px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] ${
              pane === p ? 'bg-ink text-paper' : 'text-graphite'
            }`}
          >
            {p === 'questions' ? 'Questions' : 'Answer sheet'}
          </button>
        ))}
      </div>

      <main className="flex min-h-0 flex-1 lg:grid lg:grid-cols-[360px_minmax(0,1fr)_340px]">
        <div className={`${pane === 'questions' ? 'flex' : 'hidden'} min-h-0 flex-1 lg:flex lg:flex-none`}>
          <div className="min-h-0 w-full">
            <QuestionList
              questions={out.questions}
              results={resultsMap}
              unmatched={out.graded.unmatched}
              segments={segmentsMap}
              selectedQuestion={selectedQuestion}
              selectedSegment={selectedSegment}
              onSelectQuestion={(id) => {
                setSelectedSegment(null);
                setSelectedQuestion(id);
                setPane('sheet');
              }}
              onSelectSegment={(id) => {
                setSelectedQuestion(null);
                setSelectedSegment(id);
                setPane('sheet');
              }}
            />
          </div>
        </div>

        <div className={`${pane === 'sheet' ? 'flex' : 'hidden'} min-h-0 flex-1 lg:flex`}>
          <SheetViewer
            pages={out.answerPages}
            segments={out.segments}
            activeRegions={activeRegions}
            activeLabel={
              unmatchedSegment
                ? 'unmatched writing'
                : activeQuestion
                ? activeQuestion.label
                : null
            }
            showAllBlocks={showAllBlocks}
            onToggleShowAll={() => setShowAllBlocks((v) => !v)}
          />
        </div>

        <div className="hidden min-h-0 lg:block">
          <DetailPanel
            question={activeQuestion}
            result={activeResult}
            segments={activeSegments}
            unmatchedSegment={unmatchedSegment}
            unmatchedReason={unmatchedReason}
            graded={out.graded}
            awardedOverride={
              selectedQuestion !== null && selectedQuestion in overrides
                ? overrides[selectedQuestion]
                : null
            }
            onMark={(qid, value) => setOverrides((o) => ({ ...o, [qid]: value }))}
            modelName={MODEL_LABEL}
          />
        </div>
      </main>

      {/* on small screens the detail sits under the sheet */}
      <div className={`${pane === 'sheet' ? 'block' : 'hidden'} max-h-[45vh] shrink-0 lg:hidden`}>
        <DetailPanel
          question={activeQuestion}
          result={activeResult}
          segments={activeSegments}
          unmatchedSegment={unmatchedSegment}
          unmatchedReason={unmatchedReason}
          graded={out.graded}
          awardedOverride={
            selectedQuestion !== null && selectedQuestion in overrides
              ? overrides[selectedQuestion]
              : null
          }
          onMark={(qid, value) => setOverrides((o) => ({ ...o, [qid]: value }))}
          modelName={MODEL_LABEL}
        />
      </div>
    </div>
  );
}
