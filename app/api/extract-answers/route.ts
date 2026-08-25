import { NextResponse } from 'next/server';
import { generateJson } from '@/lib/gemini';
import type { AnswerSegment, Box } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM = `You read scanned handwritten student answer sheets. You transcribe what is on the
page and you report where it is, using normalised coordinates. You transcribe what the student
actually wrote, including mistakes — you never correct, complete or improve the answer.`;

interface RawSegment {
  writtenLabel: string | null;
  text: string;
  isContinuation: boolean;
  regions: { page: number; box: number[] }[];
}

function clampBox(box: number[]): Box | null {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const v = box.map((n) => Math.max(0, Math.min(1000, Number(n))));
  if (v.some((n) => !isFinite(n))) return null;
  let [ymin, xmin, ymax, xmax] = v;
  if (ymax < ymin) [ymin, ymax] = [ymax, ymin];
  if (xmax < xmin) [xmin, xmax] = [xmax, xmin];
  // a region smaller than this is almost certainly a mis-detection
  if (ymax - ymin < 4 || xmax - xmin < 4) return null;
  return [ymin, xmin, ymax, xmax];
}

export async function POST(req: Request) {
  try {
    const { pages, pageOffset = 0, totalPages, idPrefix = 's' } = await req.json();
    if (!Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ error: 'No pages supplied.' }, { status: 400 });
    }

    const prompt = `These are pages ${pageOffset + 1}-${pageOffset + pages.length} of a ${totalPages}-page
handwritten answer sheet. Each image is preceded by its PAGE index.

Split the handwriting into answer blocks and return one entry per block.

A block starts where the student begins answering a new question — usually marked by a
number they have written in the margin or at the start of the line ("11 a)", "Q.3", "5(ii)").
A block ends where the next such marker starts, or where the writing for that answer stops.

For each block:
- "writtenLabel": the question number the student wrote, copied exactly as written
  ("11 a)", "Q3", "5(ii)"). Use null when the block carries no number at all.
- "text": a faithful transcription of the handwriting in that block. Keep the student's
  own spelling, working and errors. Use \\n for line breaks. For diagrams, formulae or
  tables, transcribe what you can and describe the rest in square brackets,
  e.g. "[diagram: labelled ray passing through a convex lens]". Mark genuinely illegible
  words as "[illegible]".
- "isContinuation": true when the block carries no new number and clearly continues the
  writing from the previous block or the previous page (for example the top of a page
  that picks up mid-sentence, or a block headed "contd.").
- "regions": where the block sits. One region per contiguous run of lines. If the block
  is interrupted — it flows into a second column, or resumes further down the page — give
  several regions. Each region is { "page": <PAGE index>, "box": [ymin, xmin, ymax, xmax] }.

Coordinates: integers from 0 to 1000, relative to the page image the region is on.
0,0 is the top-left corner. ymin/ymax are vertical, xmin/xmax are horizontal.
Box the handwriting tightly but include the student's own question number and any working,
diagram or rough figure that belongs to that answer. Do not box the whole page.
Ignore printed page furniture: roll number boxes, page numbers, invigilator signatures,
ruled margin lines and blank space.

Return a JSON array of objects with keys: writtenLabel, text, isContinuation, regions.
Return [] if these pages carry no student writing.`;

    const raw = await generateJson<RawSegment[]>({
      system: SYSTEM,
      prompt,
      images: pages.map((p: any) => ({ base64: p.base64, mimeType: p.mimeType })),
      imageLabels: pages.map((p: any) => `PAGE ${p.index}`),
    });

    const validPages = new Set<number>(pages.map((p: any) => p.index));
    const segments: AnswerSegment[] = [];

    (raw || []).forEach((s, i) => {
      const regions = (s.regions || [])
        .map((r) => {
          const box = clampBox(r.box as number[]);
          const page = Number(r.page);
          if (!box || !validPages.has(page)) return null;
          return { page, box };
        })
        .filter(Boolean) as AnswerSegment['regions'];

      const text = String(s.text ?? '').trim();
      if (!regions.length || !text) return;

      segments.push({
        id: `${idPrefix}${i}`,
        writtenLabel: s.writtenLabel ? String(s.writtenLabel).trim() : null,
        text,
        isContinuation: Boolean(s.isContinuation),
        regions: regions.sort((a, b) => a.page - b.page || a.box[0] - b.box[0]),
      });
    });

    segments.sort(
      (a, b) =>
        a.regions[0].page - b.regions[0].page || a.regions[0].box[0] - b.regions[0].box[0]
    );

    return NextResponse.json({ segments });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Could not read the answer sheet.' },
      { status: 500 }
    );
  }
}
