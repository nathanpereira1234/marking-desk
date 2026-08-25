'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { AnswerRegion, AnswerSegment, PageImage } from '@/lib/types';
import { boxStyle } from '@/lib/ui';

/**
 * The rail on the left is the one place the whole sheet is visible at once:
 * one bar per page, one tick per block of writing. Ticks for the selected
 * answer light up, so an answer that runs from page 2 onto page 3 shows itself.
 */
function PageTrack({
  pages,
  segments,
  activePages,
  activeRegions,
  onGoTo,
}: {
  pages: PageImage[];
  segments: AnswerSegment[];
  activePages: Set<number>;
  activeRegions: AnswerRegion[];
  onGoTo: (page: number) => void;
}) {
  const ticksByPage = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const s of segments) {
      for (const r of s.regions) {
        map.set(r.page, [...(map.get(r.page) || []), r.box[0]]);
      }
    }
    return map;
  }, [segments]);

  const activeByPage = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const r of activeRegions) {
      map.set(r.page, [...(map.get(r.page) || []), r.box[0]]);
    }
    return map;
  }, [activeRegions]);

  return (
    <nav
      aria-label="Pages"
      className="scroll-slim hidden w-16 shrink-0 overflow-y-auto border-r border-rule bg-paper px-3 py-4 md:block"
    >
      <ul className="space-y-3">
        {pages.map((p) => {
          const on = activePages.has(p.index);
          return (
            <li key={p.index}>
              <button
                type="button"
                onClick={() => onGoTo(p.index)}
                className="group block w-full text-left"
                title={`Go to page ${p.index + 1}`}
              >
                <span
                  className={`font-mono text-[10px] ${on ? 'text-ink' : 'text-graphite'}`}
                >
                  {String(p.index + 1).padStart(2, '0')}
                </span>
                <span
                  className={`relative mt-1 block h-12 w-full border transition-colors ${
                    on ? 'border-marker bg-markerSoft' : 'border-rule bg-card group-hover:border-graphite'
                  }`}
                >
                  {(ticksByPage.get(p.index) || []).map((y, i) => (
                    <span
                      key={`t${i}`}
                      className="absolute left-[15%] h-[2px] w-[70%] bg-rule"
                      style={{ top: `${y / 10}%` }}
                    />
                  ))}
                  {(activeByPage.get(p.index) || []).map((y, i) => (
                    <span
                      key={`a${i}`}
                      className="absolute left-[15%] h-[2px] w-[70%] bg-marker"
                      style={{ top: `${y / 10}%` }}
                    />
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function SheetViewer({
  pages,
  segments,
  activeRegions,
  activeLabel,
  showAllBlocks,
  onToggleShowAll,
}: {
  pages: PageImage[];
  segments: AnswerSegment[];
  activeRegions: AnswerRegion[];
  activeLabel: string | null;
  showAllBlocks: boolean;
  onToggleShowAll: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const activePages = useMemo(
    () => new Set(activeRegions.map((r) => r.page)),
    [activeRegions]
  );

  const pageRange = useMemo(() => {
    const nums = Array.from(activePages)
      .sort((a, b) => a - b)
      .map((p) => String(p + 1));
    if (nums.length < 2) return nums[0] ?? '';
    return `${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`;
  }, [activePages]);

  const goTo = (page: number, box?: [number, number, number, number]) => {
    const el = pageRefs.current.get(page);
    const box0 = scroller.current;
    if (!el || !box0) return;
    const offset = box ? (box[0] / 1000) * el.clientHeight : 0;
    box0.scrollTo({ top: el.offsetTop + offset - 72, behavior: 'smooth' });
  };

  useEffect(() => {
    const first = activeRegions[0];
    if (first) goTo(first.page, first.box);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRegions]);

  const otherRegions = useMemo(() => {
    if (!showAllBlocks) return [];
    const activeKeys = new Set(activeRegions.map((r) => `${r.page}:${r.box.join()}`));
    return segments
      .flatMap((s) => s.regions)
      .filter((r) => !activeKeys.has(`${r.page}:${r.box.join()}`));
  }, [segments, activeRegions, showAllBlocks]);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-paper">
      <div className="flex shrink-0 items-center gap-4 border-b border-rule bg-card px-4 py-2">
        <p className="eyebrow">Answer sheet</p>
        <p className="min-w-0 flex-1 truncate text-[13px] text-ink">
          {activeLabel ? (
            <>
              Showing{' '}
              <span className="font-mono font-medium">{activeLabel}</span>
              {activePages.size > 1 && (
                <span className="text-graphite"> · runs across pages {pageRange}</span>
              )}
            </>
          ) : (
            <span className="text-graphite">Pick a question to light up its answer.</span>
          )}
        </p>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-graphite">
          <input
            type="checkbox"
            checked={showAllBlocks}
            onChange={onToggleShowAll}
            className="h-3 w-3 accent-[#191B1F]"
          />
          Outline every block
        </label>
      </div>

      <div className="flex min-h-0 flex-1">
        <PageTrack
          pages={pages}
          segments={segments}
          activePages={activePages}
          activeRegions={activeRegions}
          onGoTo={(p) => goTo(p)}
        />

        <div ref={scroller} className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-3xl space-y-8">
            {pages.map((p) => (
              <figure key={p.index}>
                <figcaption className="mb-2 flex items-baseline gap-3">
                  <span className="font-mono text-[11px] text-graphite">
                    Page {p.index + 1} of {pages.length}
                  </span>
                  {activePages.has(p.index) && (
                    <span className="font-mono text-[11px] text-marker">answer here</span>
                  )}
                </figcaption>
                <div
                  ref={(el) => {
                    if (el) pageRefs.current.set(p.index, el);
                  }}
                  className="relative overflow-hidden rounded-sm bg-card shadow-sheet ring-1 ring-rule"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.dataUrl}
                    alt={`Answer sheet page ${p.index + 1}`}
                    className="block w-full select-none"
                    draggable={false}
                  />

                  {otherRegions
                    .filter((r) => r.page === p.index)
                    .map((r, i) => (
                      <span
                        key={`o${i}`}
                        className="pointer-events-none absolute rounded-[2px] border border-dashed border-graphite/40"
                        style={boxStyle(r.box)}
                      />
                    ))}

                  {activeRegions
                    .filter((r) => r.page === p.index)
                    .map((r, i) => (
                      <span
                        key={`a${i}`}
                        className="sweep pointer-events-none absolute rounded-[2px] border-2 border-marker bg-marker/25 mix-blend-multiply"
                        style={boxStyle(r.box)}
                      />
                    ))}
                </div>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
