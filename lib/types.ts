// Normalised box from the model: [ymin, xmin, ymax, xmax] on a 0-1000 scale,
// relative to the rendered page image it was detected on.
export type Box = [number, number, number, number];

export interface PageImage {
  /** 0-based index across the whole document */
  index: number;
  /** data URL for rendering in the browser */
  dataUrl: string;
  /** raw base64 (no prefix) for the API */
  base64: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface Question {
  id: string;
  /** exactly as printed, e.g. "11 (a)" */
  label: string;
  /** the parent number, e.g. "11" */
  number: string;
  /** the sub-part token, e.g. "a" or "iii" */
  subpart: string | null;
  /** printed order across the whole paper, starting at 0 */
  order: number;
  section: string | null;
  text: string;
  marks: number | null;
  /** page of the question paper this was printed on */
  page: number;
}

export interface AnswerRegion {
  /** page index in the answer sheet */
  page: number;
  box: Box;
}

export interface AnswerSegment {
  id: string;
  /** the number the student wrote next to the answer, if any */
  writtenLabel: string | null;
  /** transcription of the handwriting */
  text: string;
  regions: AnswerRegion[];
  /** true when this block continues an answer started on an earlier page */
  isContinuation: boolean;
}

export type MatchMethod = 'label' | 'content' | 'none';
export type Verdict = 'correct' | 'partial' | 'incorrect' | 'unanswered';

export interface QuestionResult {
  questionId: string;
  segmentIds: string[];
  method: MatchMethod;
  confidence: number;
  verdict: Verdict;
  awarded: number;
  max: number;
  feedback: string;
  /** why the mapper linked these blocks, shown on low-confidence matches */
  note: string | null;
}

export interface UnmatchedAnswer {
  segmentId: string;
  reason: string;
}

export interface GradedPaper {
  results: QuestionResult[];
  unmatched: UnmatchedAnswer[];
  summary: {
    totalAwarded: number;
    totalMax: number;
    answered: number;
    unanswered: number;
    outOfOrder: number;
    overallFeedback: string;
  };
}

export type Stage =
  | 'idle'
  | 'rendering'
  | 'questions'
  | 'answers'
  | 'mapping'
  | 'done'
  | 'error';

export interface Progress {
  stage: Stage;
  message: string;
  /** 0-100 */
  percent: number;
}
