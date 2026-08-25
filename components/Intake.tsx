'use client';

import { useCallback, useRef, useState } from 'react';
import type { Progress, Stage } from '@/lib/types';

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';

const STAGES: { key: Stage; label: string }[] = [
  { key: 'rendering', label: 'Files' },
  { key: 'questions', label: 'Questions' },
  { key: 'answers', label: 'Answers' },
  { key: 'mapping', label: 'Mapping' },
];

function DropZone({
  title,
  hint,
  files,
  onFiles,
  disabled,
}: {
  title: string;
  hint: string;
  files: File[];
  onFiles: (f: File[]) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const accept = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const picked = Array.from(list).filter(
        (f) => f.type.startsWith('image/') || f.type === 'application/pdf'
      );
      if (picked.length) onFiles(picked);
    },
    [onFiles]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) accept(e.dataTransfer.files);
      }}
      className={`relative flex flex-col rounded-md border bg-card p-5 transition-colors ${
        over ? 'border-marker bg-markerSoft/40' : 'border-rule'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <p className="eyebrow">{title}</p>
      <p className="mt-2 text-[15px] leading-snug text-graphite">{hint}</p>

      {files.length > 0 && (
        <ul className="mt-4 space-y-1">
          {files.map((f) => (
            <li key={f.name} className="flex items-baseline gap-2 font-mono text-xs">
              <span className="text-marker">▸</span>
              <span className="truncate text-ink">{f.name}</span>
              <span className="ml-auto shrink-0 text-graphite">
                {(f.size / 1024 / 1024).toFixed(1)} MB
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="mt-5 self-start border-b border-ink pb-[2px] text-sm font-medium hover:border-marker hover:text-graphite disabled:cursor-not-allowed"
      >
        {files.length ? 'Choose different files' : 'Choose files'}
      </button>

      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => accept(e.target.files)}
      />
    </div>
  );
}

export default function Intake({
  progress,
  error,
  onStart,
}: {
  progress: Progress;
  error: string | null;
  onStart: (paper: File[], sheet: File[]) => void;
}) {
  const [paper, setPaper] = useState<File[]>([]);
  const [sheet, setSheet] = useState<File[]>([]);
  const busy = progress.stage !== 'idle' && progress.stage !== 'error';
  const ready = paper.length > 0 && sheet.length > 0;

  const activeIndex = STAGES.findIndex((s) => s.key === progress.stage);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <header className="fade-up">
        <p className="eyebrow">Marking desk</p>
        <h1 className="mt-3 font-serif text-[40px] leading-[1.1] tracking-[-0.01em] sm:text-[52px]">
          Put the paper and the
          <br />
          answer sheet side by side.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-graphite">
          Every question is pulled out in printed order, every block of handwriting is read
          and placed on the page. Click a question to see exactly where it was answered — or
          that it was not.
        </p>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <DropZone
          title="01 — Question paper"
          hint="PDF or images. Select several images together and they are read as one paper, in the order shown."
          files={paper}
          onFiles={setPaper}
          disabled={busy}
        />
        <DropZone
          title="02 — Answer sheet"
          hint="One student's handwritten sheet. PDF or images, multiple pages welcome."
          files={sheet}
          onFiles={setSheet}
          disabled={busy}
        />
      </div>

      {!busy && (
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <button
            type="button"
            disabled={!ready}
            onClick={() => onStart(paper, sheet)}
            className="rounded-sm bg-ink px-6 py-3 text-sm font-medium text-paper transition-colors hover:bg-graphite disabled:cursor-not-allowed disabled:bg-rule disabled:text-graphite"
          >
            Read both documents
          </button>
          {!ready && (
            <p className="text-sm text-graphite">Add a question paper and an answer sheet to begin.</p>
          )}
        </div>
      )}

      {busy && (
        <section className="mt-10" aria-live="polite">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-ink">{progress.message}</p>
            <p className="font-mono text-xs text-graphite">{progress.percent}%</p>
          </div>

          <div className="mt-3 h-[3px] w-full bg-rule">
            <div
              className="h-full bg-marker transition-[width] duration-500 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          <ol className="mt-3 grid grid-cols-4 gap-2">
            {STAGES.map((s, i) => (
              <li
                key={s.key}
                className={`font-mono text-[11px] uppercase tracking-[0.12em] ${
                  i < activeIndex
                    ? 'text-tick'
                    : i === activeIndex
                    ? 'text-ink'
                    : 'text-rule'
                }`}
              >
                {i < activeIndex ? '✓ ' : ''}
                {s.label}
              </li>
            ))}
          </ol>
        </section>
      )}

      {error && (
        <div className="mt-8 border-l-2 border-pen bg-card px-4 py-3">
          <p className="eyebrow text-pen">Could not finish</p>
          <p className="mt-1 text-sm text-ink">{error}</p>
        </div>
      )}

      <footer className="mt-16 border-t border-rule pt-4">
        <p className="font-mono text-[11px] text-graphite">
          Files are held in memory for this session only. Nothing is stored.
        </p>
      </footer>
    </main>
  );
}
