import { NextResponse } from 'next/server';
import { generateJson } from '@/lib/gemini';
import { countOutOfOrder, labelHints, segmentPosition } from '@/lib/mapping';
import type {
  AnswerSegment,
  GradedPaper,
  Question,
  QuestionResult,
  UnmatchedAnswer,
  Verdict,
} from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM = `You are an experienced teacher marking one student's paper. You work from a list
of questions and a list of transcribed handwritten answer blocks. Two jobs: decide which blocks
answer which question, then mark them. You are fair, specific and brief. You never assume an
answer exists because a question does.`;

const DEFAULT_MAX = 5;

interface RawResult {
  questionId: string;
  segmentIds: string[];
  method: string;
  confidence: number;
  verdict: string;
  awarded: number;
  max: number;
  feedback: string;
  note: string | null;
}

interface RawResponse {
  results: RawResult[];
  unmatched: { segmentId: string; reason: string }[];
  overallFeedback: string;
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + ' […]' : s);

export async function POST(req: Request) {
  try {
    const { questions, segments } = (await req.json()) as {
      questions: Question[];
      segments: AnswerSegment[];
    };

    if (!Array.isArray(questions) || !Array.isArray(segments)) {
      return NextResponse.json({ error: 'Missing questions or answers.' }, { status: 400 });
    }

    if (questions.length === 0) {
      return NextResponse.json({ error: 'No questions were found in the paper.' }, { status: 422 });
    }

    const hints = labelHints(questions, segments);

    const questionBlock = questions
      .map((q) =>
        [
          `id: ${q.id}`,
          `label: ${q.label}`,
          q.section ? `section: ${q.section}` : null,
          `marks: ${q.marks ?? 'not printed'}`,
          `text: ${truncate(q.text, 700)}`,
        ]
          .filter(Boolean)
          .join('\n')
      )
      .join('\n---\n');

    const orderedSegments = [...segments].sort(
      (a, b) => segmentPosition(a) - segmentPosition(b)
    );

    const answerBlock = orderedSegments
      .map((s) =>
        [
          `id: ${s.id}`,
          `sheet position: page ${s.regions[0].page}, ${
            s.isContinuation ? 'continues previous writing' : 'new block'
          }`,
          `number written by student: ${s.writtenLabel ?? 'none'}`,
          `transcription: ${truncate(s.text, 2000)}`,
        ].join('\n')
      )
      .join('\n---\n');

    const hintBlock = hints.length
      ? hints.map((h) => `${h.segmentId} -> ${h.questionId}`).join('\n')
      : '(none)';

    const prompt = `QUESTIONS (printed order)
${questionBlock}

ANSWER BLOCKS (reading order on the sheet)
${answerBlock}

EXACT LABEL MATCHES already found by string comparison — trust these unless the content
plainly contradicts them:
${hintBlock}

Step 1 — map.
For every question, list the answer block ids that answer it, in reading order.
- The student may answer in any order. Position on the sheet means nothing; the number
  they wrote and what the answer is about mean everything.
- An answer may run over several blocks and several pages. Give every block id, including
  unnumbered continuation blocks that carry on the same answer.
- A block belongs to at most one question.
- When no block answers a question, return an empty segmentIds array. Never stretch a
  loosely related answer to cover a question the student skipped.
- Blocks that answer nothing on this paper — rough work, an index, a question copied out
  but not attempted, a stray note — go in "unmatched" with a one-line reason.
- "method": "label" when the student's own numbering settled it, "content" when you
  matched on subject matter, "none" when unanswered.
- "confidence": 0 to 1.
- "note": one short line explaining the link when confidence is below 0.8 or when the
  student's number disagreed with the content. Otherwise null.

Step 2 — mark.
- "max": the question's printed marks. When none is printed, use ${DEFAULT_MAX}.
- "awarded": marks given, between 0 and max. Half marks allowed. Unanswered scores 0.
- "verdict": "correct", "partial", "incorrect", or "unanswered".
- "feedback": one or two sentences addressed to the teacher. Say what the student got
  right and what is missing or wrong. Quote the student's own wording where it helps.
  For unanswered questions, feedback is exactly "Not attempted."
- Mark the answer as transcribed. Do not reward what the student might have meant.
  If the transcription is too unclear to mark, say so in the feedback and award
  conservatively.

Also write "overallFeedback": three or four sentences for the teacher on how this student
did — the pattern across the paper, the strongest and weakest areas, and anything worth
checking by hand.

Return one JSON object:
{ "results": [ { "questionId", "segmentIds", "method", "confidence", "verdict", "awarded", "max", "feedback", "note" } ],
  "unmatched": [ { "segmentId", "reason" } ],
  "overallFeedback": "..." }

"results" must contain exactly one entry for every question id above.`;

    const raw = await generateJson<RawResponse>({ system: SYSTEM, prompt, temperature: 0.1 });

    // ---- reconcile the model's answer against what actually exists ----
    const segIds = new Set(segments.map((s) => s.id));
    const byQuestion = new Map<string, RawResult>();
    for (const r of raw?.results || []) {
      if (r?.questionId) byQuestion.set(String(r.questionId), r);
    }

    const claimed = new Set<string>();
    const results: QuestionResult[] = questions.map((q) => {
      const r = byQuestion.get(q.id);
      const ids = (r?.segmentIds || [])
        .map(String)
        .filter((id) => segIds.has(id) && !claimed.has(id)); // one block, one question
      ids.forEach((id) => claimed.add(id));

      const max =
        q.marks ?? (typeof r?.max === 'number' && r.max > 0 ? r.max : DEFAULT_MAX);
      const answered = ids.length > 0;
      const verdict: Verdict = !answered
        ? 'unanswered'
        : (['correct', 'partial', 'incorrect'] as const).includes(r?.verdict as any)
        ? (r!.verdict as Verdict)
        : 'partial';
      const awarded = answered
        ? Math.max(0, Math.min(max, Number(r?.awarded) || 0))
        : 0;

      return {
        questionId: q.id,
        segmentIds: ids,
        method: answered
          ? r?.method === 'label' || r?.method === 'content'
            ? r.method
            : 'content'
          : 'none',
        confidence: answered
          ? Math.max(0, Math.min(1, Number(r?.confidence) || 0.5))
          : 0,
        verdict,
        awarded,
        max,
        feedback: answered
          ? String(r?.feedback || '').trim() || 'No feedback returned for this answer.'
          : 'Not attempted.',
        note: r?.note ? String(r.note).trim() : null,
      };
    });

    const modelUnmatched = new Map<string, string>(
      (raw?.unmatched || [])
        .filter((u) => u?.segmentId && segIds.has(String(u.segmentId)))
        .map((u) => [String(u.segmentId), String(u.reason || '').trim()])
    );

    // any block nobody claimed is unmatched, whether or not the model said so
    const unmatched: UnmatchedAnswer[] = segments
      .filter((s) => !claimed.has(s.id))
      .map((s) => ({
        segmentId: s.id,
        reason:
          modelUnmatched.get(s.id) ||
          'This writing does not correspond to any question on the paper.',
      }));

    const answered = results.filter((r) => r.segmentIds.length > 0).length;
    const graded: GradedPaper = {
      results,
      unmatched,
      summary: {
        totalAwarded: results.reduce((a, r) => a + r.awarded, 0),
        totalMax: results.reduce((a, r) => a + r.max, 0),
        answered,
        unanswered: results.length - answered,
        outOfOrder: countOutOfOrder(questions, segments, results),
        overallFeedback: String(raw?.overallFeedback || '').trim(),
      },
    };

    return NextResponse.json(graded);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Could not map the answers.' },
      { status: 500 }
    );
  }
}
