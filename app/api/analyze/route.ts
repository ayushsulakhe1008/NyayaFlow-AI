import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { analyzeDemo, analyzeWithGemini, type ParsedDoc } from "@/lib/analyze";

export const runtime = "nodejs";
export const maxDuration = 60;
const run = promisify(execFile);

// Each PDF is parsed in a separate Node process (fresh state every time).
const PDF_SCRIPT = `
import fs from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const data = new Uint8Array(fs.readFileSync(process.argv[1]));
const doc = await getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  pages.push(tc.items.map((it) => it.str).join(" "));
}
process.stdout.write(JSON.stringify(pages));
`;

async function parsePdf(buf: Buffer): Promise<string[]> {
  const tmp = path.join(tmpdir(), `nf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  await writeFile(tmp, buf);
  try {
    const { stdout } = await run(
      process.execPath,
      ["--input-type=module", "-e", PDF_SCRIPT, tmp],
      { cwd: process.cwd(), maxBuffer: 50 * 1024 * 1024 }
    );
    return JSON.parse(stdout);
  } finally {
    unlink(tmp).catch(() => {});
  }
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
      catch (e) {
        console.error(e);
        return NextResponse.json({ error: `Could not read "${f.name}" (damaged or unsupported PDF).` }, { status: 422 });
      }
      console.log("PARSED", f.name, pages.length, "pages |", pages.join(" ").slice(0, 80));
      docs.push({ name: f.name, pages });
    }
    if (docs.every((d) => d.pages.join("").trim().length < 20))
      return NextResponse.json({ error: "No readable text found (scanned PDFs need OCR - not in this prototype)." }, { status: 422 });

    const key = process.env.GEMINI_API_KEY;
    console.log("GEMINI KEY LOADED:", !!key);
    let analysis;
    if (key) {
      try { analysis = await analyzeWithGemini(docs, hearing, key); }
      catch (e) { console.error(e); analysis = analyzeDemo(docs, hearing); analysis.summary = "AI call failed, showing demo-mode result. " + analysis.summary; }
    } else analysis = analyzeDemo(docs, hearing);
    return NextResponse.json(analysis);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message ?? "Analysis failed" }, { status: 500 });
  }
}