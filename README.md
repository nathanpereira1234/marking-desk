# Marking Desk — assessment extraction and answer mapping

Upload a question paper and one student's handwritten answer sheet. The app pulls out every
question in printed order, reads every block of handwriting, matches the two, marks the paper,
and highlights the exact region of the sheet where each answer lives.

Built for the VedaAI hiring assignment.

---

## Run it locally

```bash
npm install
cp .env.example .env.local     # add your Gemini key
npm run dev
```

Get a free key at <https://aistudio.google.com/app/apikey>. The free tier of Gemini 2.5 Flash
covers this comfortably.

## Deploy

Vercel, zero config:

```bash
npm i -g vercel
vercel            # first deploy
vercel env add GEMINI_API_KEY     # paste the key, choose all environments
vercel --prod
```

Or push the repo to GitHub, import it at vercel.com, and add `GEMINI_API_KEY` under
Settings → Environment Variables. No database, no auth, nothing to provision.

---

## Approach

**Everything is rasterised in the browser first.** Both documents — PDF or images — are
rendered to page bitmaps client-side with `pdf.js`, capped at a 1600px long edge. This is the
decision the rest of the design rests on: the model sees the exact bitmap the teacher sees, so
a box it returns lands on the right pixels. Sending a PDF straight to the model would leave its
coordinates referring to a rendering nobody else has.

The pipeline then runs in four passes, batched three pages at a time so no single request is
large or slow.

**1 · Question extraction** (`/api/extract-questions`)
Page images go to the model with instructions to emit one entry per answerable item in printed
order. Labelled sub-parts are separate entries — `11 (a)` and `11 (b)` are never merged. The
printed label is reproduced verbatim rather than normalised, so the teacher sees the paper's own
numbering. Sub-parts that share a stem carry enough of that stem to stand alone. Internal-choice
alternatives (`OR`) are emitted as separate answerable entries. Rubrics, instructions and mark
banners are dropped. Batches are concatenated and given a global `order` index.

**2 · Answer extraction** (`/api/extract-answers`)
The handwriting is split into blocks. A block is a run of writing that starts where the student
begins a new question — usually at a number they wrote themselves. Each block returns: the
number the student wrote (or null), a faithful transcription including their mistakes, a
continuation flag, and one or more regions. A region is `{ page, [ymin, xmin, ymax, xmax] }` on
a 0–1000 scale relative to that page image. Several regions per block handle writing that is
interrupted and resumes further down or on the next page. Boxes are clamped, ordered and
sanity-checked server-side; degenerate ones are dropped.

**3 · Mapping** (`/api/map-and-grade`)
Hybrid, because the two failure modes are different. A deterministic pass normalises labels
(`Q.11 (a)`, `11a)`, `11(A)` all reduce to `11a`) and hands unambiguous matches to the model as
established fact. The model then resolves everything else on content, stitches continuation
blocks into whole answers, and explains any match it is unsure about. Server-side reconciliation
enforces the invariants the model can't be trusted to hold: every question gets exactly one
result, a block is claimed by at most one question, marks are clamped to the maximum, and any
block nobody claimed becomes an unmatched answer whether or not the model said so.

**4 · Grading**
Same call as mapping, so the marker has the full transcription in front of it. Per question:
marks out of the printed maximum, a verdict, and one or two sentences addressed to the teacher.
Plus an overall paragraph on the paper. Summary counts — total, answered, skipped, out-of-order,
unmatched — are computed in code, not asked for.

### The interface

Three panes: questions on the left with status and marks, the answer sheet in the middle, the
selected question's detail on the right. Clicking a question sweeps a highlighter over its
regions and scrolls to the first one.

The rail down the left of the sheet is the piece I'd point at: one bar per page, one tick per
block of writing, ticks for the selected answer lit. It's the only place the whole sheet is
visible at once, so an answer running from page 2 onto page 3 shows itself without scrolling.

Marks are editable. The model's number is a first pass, and a teacher who disagrees shouldn't
have to leave the tool — the header total updates as you adjust. Arrow keys walk the question
list.

---

## Edge cases

| Case | Handling |
|---|---|
| Labelled sub-parts | Separate entries, always. `11 (a)`, `11 (b)`. |
| Original numbering | Reproduced verbatim, never renumbered or padded. |
| Answered out of order | Position on the sheet is ignored during matching. The header counts how many answers were written away from their place in the paper's order. |
| Unanswered questions | Empty `segmentIds`, verdict `unanswered`, 0 marks, listed under a **Skipped** filter. The prompt explicitly forbids stretching a loosely related answer to cover a skipped question. |
| Answers matching no question | Collected as unmatched with a reason, listed under the questions, clickable and highlightable like any answer. |
| Answers spanning pages | A result holds several blocks; a block holds several regions. All of them highlight together and the viewer names the pages involved. |
| Continuation with no number | Flagged at extraction, joined to the right answer at mapping. |
| Internal choice (`OR`) | Both alternatives extracted; the unattempted one reads as skipped. |
| Model returns a bad box or a phantom block id | Dropped during server-side reconciliation. |
| Low-confidence match | Surfaced as **Check this match** in the list and as a note in the detail panel, rather than hidden behind a number. |

---

## Model

**Google Gemini 2.5 Flash** (`gemini-2.5-flash`) via `@google/generative-ai`, on the free tier.
Chosen for three reasons: strong handwriting OCR, native normalised bounding-box output — which
is the whole highlighting requirement — and a free tier that survives real testing. Override with
`GEMINI_MODEL` if you want to try `gemini-2.5-pro` on a hard paper.

All calls use `responseMimeType: application/json` at temperature 0 (0.1 for grading), with
defensive parsing behind that.

---

## Assumptions

- One student per run. No class-level view.
- Multiple selected images are treated as one document, in the order the file picker reports.
- Grading works from the model's subject knowledge, not from a marking scheme — no answer key is
  uploaded. Where a question's marks aren't printed, the maximum defaults to 5.
- In-memory only. Refreshing loses the session; nothing is written to disk or a database.
- Answer sheets are assumed to be one student's own work, in a language the model reads.

## Limitations

- **Boxes are close, not exact.** The model localises a block of handwriting well enough to
  point a teacher at it; it is not a line-level OCR bounding box. Regions carry a small padding
  for that reason. Dense multi-column sheets are the weakest case.
- **Grading is a first pass.** Handwriting transcription errors propagate into marks. Every
  question's transcription is shown next to its mark so the teacher can see what was actually
  read, and every mark is editable.
- **Continuations across a batch boundary** rely on the mapping step to rejoin them, since
  extraction only sees three pages at a time. This works because mapping sees all blocks at once,
  but a continuation whose subject matter is ambiguous is the likeliest place to see a wrong join.
- **Long papers cost time.** Roughly one model call per three pages, run in sequence to stay well
  inside serverless limits. A 12-page paper with a 10-page sheet is around eight calls.
- **The pdf.js worker loads from a CDN.** Offline environments won't render PDFs; images still work.
- Diagrams are transcribed as bracketed descriptions and marked on that description alone.

## Not built

Marking-scheme upload, class batches, exporting marks, and persistence — all out of scope here,
and all straightforward additions on top of this pipeline.

---

## Layout

```
app/
  page.tsx                     three-pane marking view and state
  layout.tsx  globals.css
  api/extract-questions/       question paper → ordered questions
  api/extract-answers/         answer sheet  → blocks with regions
  api/map-and-grade/           mapping, marking, reconciliation
components/
  Intake.tsx                   upload and staged progress
  QuestionList.tsx             questions, status, filters, unmatched
  SheetViewer.tsx              page images, highlights, page rail
  DetailPanel.tsx              question, transcription, marks, feedback
lib/
  render.ts                    browser rasterisation (pdf.js)
  pipeline.ts                  client orchestration and batching
  gemini.ts                    model client, JSON parsing
  mapping.ts                   label normalisation, out-of-order counting
  types.ts  ui.ts
```
