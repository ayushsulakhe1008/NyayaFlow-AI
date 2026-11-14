// Runs in its own process. Uses modern pdf.js, which repairs damaged PDFs.
import fs from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const data = new Uint8Array(fs.readFileSync(process.argv[2]));
const doc = await getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  pages.push(tc.items.map((it) => it.str).join(" "));
}
process.stdout.write(JSON.stringify(pages));
