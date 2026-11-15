import type { Analysis, Obligation, Status } from "./types";

export interface ParsedDoc { name: string; pages: string[] }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

/* ---------- AI mode (Gemini) ---------- */
export async function analyzeWithGemini(docs: ParsedDoc[], hearing: string, key: string): Promise<Analysis> {
  const body = docs
    .map((d) => `=== DOCUMENT: ${d.name} ===\n` + d.pages.map((p, i) => `[Page ${i + 1}] ${p}`).join("\n"))
    .join("\n\n")
    .slice(0, 150000);

  const prompt = `You are NyayaFlow AI, a decision-support tool for case preparation. You do NOT decide guilt, bail or outcomes.
Analyse the uploaded case documents. Next hearing date: ${hearing || "unknown"}.
1. Classify each document type (e.g. Court Order, Petition, Forensic Report, Investigation Report, Evidence, Other).
2. Extract a short neutral case summary (max 80 words).
3. Build a chronological timeline of dated events with the source document.
4. Extract PROCEDURAL OBLIGATIONS: directions in court orders (e.g. "submit forensic report before next date", "file reply", "produce witness").
5. For each obligation, search the OTHER uploaded documents for evidence that it was complied with. Set status:
   "found" (clear evidence in uploaded records), "pending" (no evidence, deadline not passed / still to do),
   "not_found" (looked, not found in available records), "unverified" (partial/unclear evidence).
   Put what you found (or why not) in "evidence". Never claim compliance without a source.
6. List missing information that would be needed before the hearing.
Return ONLY JSON: {"summary":string,"documents":[{"name":string,"type":string,"pages":number}],
"timeline":[{"date":string,"event":string,"source":string}],
"obligations":[{"text":string,"deadline":string,"sourceDoc":string,"page":number|null,"status":"found|pending|not_found|unverified","evidence":string}],
"missingInfo":[string]}

${body}`;

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(50000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${clip(await res.text(), 200)}`);
  const data = await res.json();
  const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const j = JSON.parse(raw.replace(/^```json|```$/g, "").trim());
  const valid: Status[] = ["found", "pending", "not_found", "unverified"];
  return {
    mode: "ai",
    summary: j.summary ?? "",
    documents: j.documents ?? docs.map((d) => ({ name: d.name, type: "Document", pages: d.pages.length })),
    timeline: j.timeline ?? [],
    missingInfo: j.missingInfo ?? [],
    obligations: (j.obligations ?? []).map((o: Partial<Obligation>, i: number): Obligation => ({
      id: `ob-${i}`,
      text: o.text ?? "",
      deadline: o.deadline ?? "Not stated",
      sourceDoc: o.sourceDoc ?? "",
      page: o.page ?? null,
      status: valid.includes(o.status as Status) ? (o.status as Status) : "unverified",
      evidence: o.evidence ?? "",
    })),
  };
}

/* ---------- Demo mode (no API key): simple rules ---------- */
const DIRECTION = /\b(directed|ordered|shall|is required to|are required to|to file|to submit|to produce|to appear|furnish)\b/i;
const DATE = /\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{1,2}(st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+\d{4})\b/gi;
const STOP = new Set(["the","and","that","this","with","before","shall","order","court","next","date","hearing","report","from","have","been","will","also","into","such"]);

function docType(name: string, text: string) {
  const pick = (s: string) => {
    if (/order|judg(e)?ment/.test(s)) return "Court Order";
    if (/forensic|fsl/.test(s)) return "Forensic Report";
    if (/petition|plaint|application/.test(s)) return "Petition / Application";
    if (/investigation|charge ?sheet|police/.test(s)) return "Investigation Report";
    return "";
  };
  return pick(name.toLowerCase()) || pick(text.slice(0, 300).toLowerCase()) || "Other";
}

export function analyzeDemo(docs: ParsedDoc[], hearing: string): Analysis {
  const documents = docs.map((d) => ({ name: d.name, type: docType(d.name, d.pages.join(" ")), pages: d.pages.length }));
  const timeline: Analysis["timeline"] = [];
  const obligations: Obligation[] = [];

  docs.forEach((d, di) => {
    d.pages.forEach((page, pi) => {
      page.split(/(?<=[.;])\s+/).forEach((sent) => {
        const dates = sent.match(DATE);
        if (dates && timeline.length < 25) timeline.push({ date: dates[0], event: clip(sent.trim(), 160), source: `${d.name}, p.${pi + 1}` });
        if (documents[di].type === "Court Order" && DIRECTION.test(sent) && obligations.length < 12 && sent.length > 25) {
          const keys = (sent.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w));
          // look for evidence in OTHER documents
          let hit: { doc: string; page: number; n: number } | null = null;
          docs.forEach((o, oi) => {
            if (oi === di) return;
            o.pages.forEach((op, opi) => {
              const n = keys.filter((k) => op.toLowerCase().includes(k)).length;
              if (n >= 3 && (!hit || n > hit.n)) hit = { doc: o.name, page: opi + 1, n };
            });
          });
          const h = hit as { doc: string; page: number; n: number } | null;
          obligations.push({
            id: `ob-${obligations.length}`,
            text: clip(sent.trim(), 220),
            deadline: (sent.match(DATE) ?? [hearing ? `Before ${hearing}` : "Not stated"])[0],
            sourceDoc: d.name,
            page: pi + 1,
            status: h ? (h.n >= 5 ? "found" : "unverified") : "not_found",
            evidence: h ? `Possible match in ${h.doc}, p.${h.page}` : "No matching document found in uploaded records",
          });
        }
      });
    });
  });

  return {
    mode: "demo",
    summary: `Demo mode (no AI key): ${docs.length} document(s) processed with simple keyword rules. Add a Gemini API key for full AI analysis.`,
    documents,
    timeline,
    obligations,
    missingInfo: obligations.filter((o) => o.status === "not_found").map((o) => `Evidence for: ${clip(o.text, 90)}`),
  };
}