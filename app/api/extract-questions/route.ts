import { NextResponse } from 'next/server';
import { generateJson } from '@/lib/gemini';
import type { Question } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM = `You are an exam-paper parser for a teacher's marking tool. You read scanned or
digital question papers and return the questions as structured data. You never invent
questions and you never merge two printed questions into one.`;

interface RawQuestion {
  label: string;
  number: string;
  subpart: string | null;
  section: string | null;
  text: string;
  marks: number | null;
  page: number;
}

export async function POST(req: Request) {
  try {
    const { pages, pageOffset = 0, totalPages } = await req.json();
    if (!Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ error: 'No pages supplied.' }, { status: 400 });
    }

    const prompt = `These are pages ${pageOffset + 1}-${pageOffset + pages.length} of a ${totalPages}-page question paper.
Each image is preceded by its PAGE index. Read them in order and list every question.

Rules:
1. One entry per answerable item, in printed order.
2. A labelled sub-part is its own entry. "11 (a)" and "11 (b)" are two entries, never one.
   The same applies to roman sub-parts (i), (ii) and to lettered options inside a
   sub-part when they are separately answerable.
3. "label" must reproduce the printed numbering exactly as a teacher would say it,
   including brackets and spacing: "11 (a)", "Q3", "5.2", "17".
   Do not renumber, do not pad, do not normalise.
4. "number" is the parent number only ("11"). "subpart" is the sub-part token ("a",
   "ii") or null when there is none.
5. "text" is the question as printed. When sub-parts share a common stem or a shared
   figure/passage, repeat enough of that stem in each sub-part that the question can be
   understood on its own, then the sub-part's own wording.
6. When a paper offers an internal choice ("OR"), both alternatives are answerable:
   emit both, labelling the alternative like "5 (b) [OR]".
7. "marks" is the printed mark value for that specific entry as a number, or null.
   If only the parent question shows marks and sub-parts do not, divide nothing — put
   the parent's marks on the parent-level entry only and null on the sub-parts.
8. "section" is the section heading in force ("Section A", "Part II") or null.
9. "page" is the PAGE index shown before the image the question starts on.
10. Ignore anything that is not a question: rubrics, "Answer all questions", time and
    total-marks banners, instructions, page numbers, blank ruled space.

Return a JSON array of objects with keys: label, number, subpart, section, text, marks, page.
Return [] if these pages contain no questions.`;

    const raw = await generateJson<RawQuestion[]>({
      system: SYSTEM,
      prompt,
      images: pages.map((p: any) => ({ base64: p.base64, mimeType: p.mimeType })),
      imageLabels: pages.map((p: any) => `PAGE ${p.index}`),
    });

    const questions: Omit<Question, 'order' | 'id'>[] = (raw || []).map((q) => ({
      label: String(q.label ?? '').trim(),
      number: String(q.number ?? '').trim(),
      subpart: q.subpart ? String(q.subpart).trim() : null,
      section: q.section ? String(q.section).trim() : null,
      text: String(q.text ?? '').trim(),
      marks: typeof q.marks === 'number' && isFinite(q.marks) ? q.marks : null,
      page: Number.isInteger(q.page) ? q.page : pageOffset,
    }));

    return NextResponse.json({ questions: questions.filter((q) => q.label && q.text) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Could not read the question paper.' },
      { status: 500 }
    );
  }
}
