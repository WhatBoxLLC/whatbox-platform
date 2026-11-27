// Detection back ends. Azure AI Content Safety rates sexual content; Azure AI Vision reads any
// text in the photo (OCR). Both are called over REST with the image in the request body, and
// neither keeps the image. QR codes are decoded locally (see check.ts), so they cost nothing.
import type { Engines } from './types';

const TIMEOUT_MS = 15_000;

async function call(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    // Never log the body we sent. The error body from Azure has no image data.
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`${new URL(url).pathname} answered ${res.status} ${detail}`);
  }
  return res.json();
}

export class AzureEngines implements Engines {
  name = 'azure';
  constructor(private cs: { endpoint: string; key: string }, private vision: { endpoint: string; key: string }) {}

  async adultSeverity(jpeg: Buffer) {
    const out = (await call(`${this.cs.endpoint.replace(/\/$/, '')}/contentsafety/image:analyze?api-version=2024-09-01`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': this.cs.key },
      body: JSON.stringify({ image: { content: jpeg.toString('base64') }, categories: ['Sexual'], outputType: 'FourSeverityLevels' }),
    })) as { categoriesAnalysis?: { category: string; severity: number }[] };
    return out.categoriesAnalysis?.find((c) => c.category === 'Sexual')?.severity ?? 0;
  }

  async readText(jpeg: Buffer) {
    const out = (await call(`${this.vision.endpoint.replace(/\/$/, '')}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Ocp-Apim-Subscription-Key': this.vision.key },
      body: new Uint8Array(jpeg),
    })) as { readResult?: { blocks?: { lines?: { text: string }[] }[] } };
    return (out.readResult?.blocks ?? []).flatMap((b) => (b.lines ?? []).map((l) => l.text)).join('\n');
  }
}

// Local dev and CI: no Azure calls. Every photo is safe and has no text, but QR codes are still found.
export class StubEngines implements Engines {
  name = 'stub';
  async adultSeverity() { return 0; }
  async readText() { return ''; }
}
