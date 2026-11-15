import { NextResponse } from "next/server";
import path from "path";
import { pathToFileURL } from "url";
import { analyzeDemo, analyzeWithGemini, type ParsedDoc } from "@/lib/analyze";

export const runtime = "nodejs";
export const maxDuration = 60;

async function parsePdf(buf: Buffer): Promise<string[]> {
  // @ts-ignore - legacy build has no types in some versions
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")
  ).href;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf), useSystemFonts: true, disableFontFace: true, verbosity: 0,
  }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.map((it: any) => it.str).join(" "));
  }
  return pages;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const hearing = String(form.get("nextHearing") ?? "");
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: "Upload at least one PDF." }, { status: 400 });

    const docs: ParsedDoc[] = [];
    for (const f of files) {
      let pages: string[];
      try { pages = await parsePdf(Buffer.from(await f.arrayBuffer())); }
      catch (e: any) {
        console.error(e);
        return NextResponse.json({ error: `Could not read "${f.name}" (${e?.message ?? "damaged or unsupported PDF"}).` }, { status: 422 });
      }
      docs.push({ name: f.name, pages });
    }
    if (docs.every((d) => d.pages.join("").trim().length < 20))
      return NextResponse.json({ error: "No readable text found (scanned PDFs need OCR - not in this prototype)." }, { status: 422 });

    const key = process.env.GEMINI_API_KEY;
    let analysis;
    if (key) {
      try { analysis = await analyzeWithGemini(docs, hearing, key); }
      catch (e: any) {
        console.error(e);
        analysis = analyzeDemo(docs, hearing);
        analysis.summary = `AI call failed (${String(e?.message ?? e).slice(0, 300)}). Showing demo-mode result.`;
      }
    } else analysis = analyzeDemo(docs, hearing);
    return NextResponse.json(analysis);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message ?? "Analysis failed" }, { status: 500 });
  }
}