import { GoogleGenerativeAI, type Part } from '@google/generative-ai';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function client() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY is not set. Add it to .env.local (or your host\u2019s environment) and restart.'
    );
  }
  return new GoogleGenerativeAI(key);
}

export interface InlineImage {
  base64: string;
  mimeType: string;
}

/**
 * One call to Gemini that is required to return a JSON array.
 * `responseMimeType: application/json` removes prose and code fences, but we
 * still parse defensively because vision models occasionally wrap output.
 */
export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  images?: InlineImage[];
  /** text label injected before each image, e.g. page markers */
  imageLabels?: string[];
  temperature?: number;
}): Promise<T> {
  const model = client().getGenerativeModel({
    model: MODEL,
    systemInstruction: opts.system,
    generationConfig: {
      temperature: opts.temperature ?? 0,
      responseMimeType: 'application/json',
      maxOutputTokens: 32768,
    },
  });

  const parts: Part[] = [{ text: opts.prompt }];
  (opts.images || []).forEach((img, i) => {
    const label = opts.imageLabels?.[i];
    if (label) parts.push({ text: label });
    parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } });
  });

  const res = await model.generateContent({
    contents: [{ role: 'user', parts }],
  });

  const raw = res.response.text();
  return parseJson<T>(raw);
}

export function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // last resort: grab the outermost array or object
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error('Model did not return valid JSON.');
  }
}

export function modelName() {
  return MODEL;
}
