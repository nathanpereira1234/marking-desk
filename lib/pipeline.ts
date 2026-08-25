'use client';

import { renderDocument, toPayload } from './render';
import type {
  AnswerSegment,
  GradedPaper,
  PageImage,
  Progress,
  Question,
} from './types';

const BATCH = 3; // pages per model call — keeps each request small and fast

export interface PipelineOutput {
  questionPages: PageImage[];
  answerPages: PageImage[];
  questions: Question[];
  segments: AnswerSegment[];
  graded: GradedPaper;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Request to ${url} failed.`);
  return data as T;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function runPipeline(
  questionFiles: File[],
  answerFiles: File[],
  report: (p: Progress) => void
): Promise<PipelineOutput> {
  // 1. rasterise both documents in the browser
  report({ stage: 'rendering', message: 'Opening the files', percent: 3 });
  const questionPages = await renderDocument(questionFiles, (m) =>
    report({ stage: 'rendering', message: m, percent: 6 })
  );
  const answerPages = await renderDocument(answerFiles, (m) =>
    report({ stage: 'rendering', message: m, percent: 12 })
  );

  if (!questionPages.length) throw new Error('The question paper had no readable pages.');
  if (!answerPages.length) throw new Error('The answer sheet had no readable pages.');

  // 2. questions, in printed order
  const qBatches = chunk(questionPages, BATCH);
  const questions: Question[] = [];
  for (let b = 0; b < qBatches.length; b++) {
    report({
      stage: 'questions',
      message: `Reading the question paper — pages ${qBatches[b][0].index + 1}–${
        qBatches[b][qBatches[b].length - 1].index + 1
      } of ${questionPages.length}`,
      percent: 15 + Math.round((30 * b) / qBatches.length),
    });
    const { questions: found } = await post<{ questions: Omit<Question, 'id' | 'order'>[] }>(
      '/api/extract-questions',
      {
        pages: toPayload(qBatches[b]),
        pageOffset: qBatches[b][0].index,
        totalPages: questionPages.length,
      }
    );
    for (const q of found) {
      questions.push({ ...q, id: `q${questions.length}`, order: questions.length });
    }
  }
  if (!questions.length) {
    throw new Error(
      'No questions were found. Check that the question paper is the right file and that the scan is legible.'
    );
  }

  // 3. handwriting, block by block, with page coordinates
  const aBatches = chunk(answerPages, BATCH);
  const segments: AnswerSegment[] = [];
  for (let b = 0; b < aBatches.length; b++) {
    report({
      stage: 'answers',
      message: `Reading the answer sheet — pages ${aBatches[b][0].index + 1}–${
        aBatches[b][aBatches[b].length - 1].index + 1
      } of ${answerPages.length}`,
      percent: 45 + Math.round((35 * b) / aBatches.length),
    });
    const { segments: found } = await post<{ segments: AnswerSegment[] }>(
      '/api/extract-answers',
      {
        pages: toPayload(aBatches[b]),
        pageOffset: aBatches[b][0].index,
        totalPages: answerPages.length,
        idPrefix: `s${b}_`,
      }
    );
    segments.push(...found);
  }

  // 4. match blocks to questions and mark them
  report({ stage: 'mapping', message: 'Matching answers to questions', percent: 84 });
  const graded = await post<GradedPaper>('/api/map-and-grade', { questions, segments });

  report({ stage: 'done', message: 'Ready', percent: 100 });
  return { questionPages, answerPages, questions, segments, graded };
}
