# Submission form answers

Paste these into <https://forms.gle/vFXzf3kcLmGougMr5>. Fill in the two URLs first.

**Live URL:** `<your vercel url>`
**GitHub:** `<your repo url>`

---

## Brief explanation of your approach

Both documents are rasterised to page bitmaps in the browser with pdf.js before anything is
sent anywhere. That gives one coordinate system — the model sees the exact image the teacher
sees, so the boxes it returns land on the right pixels. The pipeline then runs in four passes,
batched three pages at a time.

Question extraction sends the paper's page images to Gemini with instructions to emit one entry
per answerable item in printed order, keeping the printed label verbatim and splitting every
labelled sub-part into its own entry.

Answer extraction splits the handwriting into blocks, each returning the number the student
wrote, a faithful transcription, a continuation flag, and one or more regions as
`{ page, [ymin, xmin, ymax, xmax] }` on a 0–1000 scale. Several regions per block covers writing
that is interrupted and resumes lower down or on the next page.

Mapping is hybrid. A deterministic pass normalises labels — `Q.11 (a)`, `11a)` and `11(A)` all
reduce to `11a` — and hands unambiguous matches to the model as settled. The model resolves the
rest on content, stitches continuation blocks into whole answers, and explains any match it is
unsure about. Server-side reconciliation then enforces what the model can't be trusted to hold:
one result per question, one question per block, marks clamped to the maximum, and any block
nobody claimed becomes an unmatched answer whether or not the model flagged it.

Grading happens in the same call as mapping, so the marker has the full transcription in hand.
Summary counts are computed in code rather than asked for.

The interface is three panes — questions, sheet, detail. Clicking a question sweeps a
highlighter over its regions and scrolls to the first. A rail beside the sheet shows one bar per
page and one tick per block of writing, so an answer running across pages shows itself without
scrolling. Marks are editable, because the model's number is a first pass.

## AI model / API used

Google Gemini 2.5 Flash (`gemini-2.5-flash`) via `@google/generative-ai`, free tier. Picked for
handwriting OCR quality, native normalised bounding-box output — which is the whole highlighting
requirement — and a free tier that survives real testing. Calls use JSON response mode at
temperature 0, with defensive parsing behind it.

## Assumptions and limitations

**Assumptions.** One student per run. Several selected images are treated as one document in
picker order. Grading works from the model's subject knowledge, not an uploaded marking scheme;
where marks aren't printed the maximum defaults to 5. Storage is in-memory only.

**Limitations.** Boxes are close, not exact — they locate a block of handwriting well enough to
point a teacher at it, not line-level OCR boxes; dense multi-column sheets are the weakest case.
Grading is a first pass, so each question shows its transcription beside its mark and every mark
is editable. Continuations that cross a three-page batch boundary are rejoined at the mapping
step, which sees all blocks at once, but an ambiguous continuation is the likeliest place to see
a wrong join. Long papers cost time: roughly one model call per three pages, run in sequence.
The pdf.js worker loads from a CDN, so offline environments won't render PDFs.
