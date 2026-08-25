'use client';

import type { PageImage } from './types';

/**
 * Everything is rasterised in the browser before it is sent anywhere.
 * That gives us one coordinate system: the model sees exactly the same
 * bitmap the teacher sees, so a box it returns lands on the right pixels.
 */
const MAX_EDGE = 1600; // long edge in px — enough for handwriting, small enough to post
const JPEG_QUALITY = 0.82;

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.mjs`;
      return lib;
    });
  }
  return pdfjsPromise;
}

function canvasToPage(canvas: HTMLCanvasElement, index: number): PageImage {
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return {
    index,
    dataUrl,
    base64: dataUrl.split(',')[1],
    mimeType: 'image/jpeg',
    width: canvas.width,
    height: canvas.height,
  };
}

async function renderPdf(
  file: File,
  startIndex: number,
  onPage?: (done: number, total: number) => void
): Promise<PageImage[]> {
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: PageImage[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = MAX_EDGE / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale: Math.min(scale, 3) });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    pages.push(canvasToPage(canvas, startIndex + pages.length));
    onPage?.(p, doc.numPages);
  }
  return pages;
}

async function renderImage(file: File, index: number): Promise<PageImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvasToPage(canvas, index);
}

/** Files are treated as one document, in the order they were selected. */
export async function renderDocument(
  files: File[],
  onProgress?: (label: string) => void
): Promise<PageImage[]> {
  const out: PageImage[] = [];
  for (const file of files) {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const pages = await renderPdf(file, out.length, (done, total) =>
        onProgress?.(`Reading ${file.name} — page ${done} of ${total}`)
      );
      out.push(...pages);
    } else {
      onProgress?.(`Reading ${file.name}`);
      out.push(await renderImage(file, out.length));
    }
  }
  return out;
}

/** Strip the heavy data URLs before posting to an API route. */
export function toPayload(pages: PageImage[]) {
  return pages.map((p) => ({
    index: p.index,
    base64: p.base64,
    mimeType: p.mimeType,
    width: p.width,
    height: p.height,
  }));
}
