"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Analysis, CaseRecord, Status } from "@/lib/types";
import { readiness, STATUS_LABEL } from "@/lib/types";

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<CaseRecord | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const all: CaseRecord[] = JSON.parse(localStorage.getItem("cases") || "[]");
      setC(all.find((x) => x.id === id) ?? null);
    } catch {}
  }, [id]);

  function save(next: CaseRecord) {
    setC(next);
    const all: CaseRecord[] = JSON.parse(localStorage.getItem("cases") || "[]");
    localStorage.setItem("cases", JSON.stringify(all.map((x) => (x.id === next.id ? next : x))));
  }

  async function analyse() {
    if (!c || !files.length) return;
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("nextHearing", c.nextHearing);
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      save({ ...c, analysis: data as Analysis });
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }

  function setStatus(obId: string, status: Status) {
    if (!c?.analysis) return;
    save({ ...c, analysis: { ...c.analysis, obligations: c.analysis.obligations.map((o) => (o.id === obId ? { ...o, status } : o)) } });
  }

  if (!c) return <div className="card">Case not found. <Link href="/">Back</Link></div>;
  const a = c.analysis;
  const r = a ? readiness(a.obligations) : null;
  const color = r ? (r.score >= 80 ? "var(--ok)" : r.score >= 50 ? "var(--warn)" : "var(--bad)") : "";

  return (
    <>
      <p><Link href="/">← All cases</Link></p>
      <div className="card">
        <h1>{c.title}</h1>
        <div className="muted">{c.caseNumber} · Next hearing: {c.nextHearing || "not set"}</div>
      </div>

      <div className="card noprint">
        <h2>1. Upload case documents (PDF)</h2>
        <input type="file" accept="application/pdf" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        {files.length > 0 && <p className="muted">{files.map((f) => f.name).join(", ")}</p>}
        <div style={{ marginTop: 12 }}>
          <button disabled={busy || !files.length} onClick={analyse}>{busy ? "Analysing… please wait" : "2. Analyse documents"}</button>
        </div>
        {error && <div className="err">{error}</div>}
      </div>

      {a && r && (
        <>
          <div className="card">
            <h2>Pre-hearing readiness</h2>
            <div className="score" style={{ color }}>{r.score}% <span style={{ fontSize: 18 }}>{r.level}</span></div>
            <div className="meter"><div style={{ width: `${r.score}%`, background: color }} /></div>
            <p className="muted">{a.mode === "ai" ? "Analysed with Gemini AI." : "Demo mode (rule-based)."} {a.summary}</p>
            <button className="ghost noprint" onClick={() => window.print()}>Export / Print report</button>
          </div>

          <div className="card">
            <h2>Procedural obligations ({a.obligations.length})</h2>
            <p className="muted">Confirm or correct each status manually. Statuses are suggestions, not findings.</p>
            {!a.obligations.length && <p>No obligations detected. Upload a court order.</p>}
            {a.obligations.map((o) => (
              <div className="ob" key={o.id}>
                <span className={`badge ${o.status}`}>{STATUS_LABEL[o.status]}</span>
                <p><b>{o.text}</b></p>
                <p className="muted">Deadline: {o.deadline} · Source: {o.sourceDoc}{o.page ? `, p.${o.page}` : ""}</p>
                <p className="muted">Evidence: {o.evidence || "—"}</p>
                <select className="noprint" style={{ maxWidth: 260 }} value={o.status} onChange={(e) => setStatus(o.id, e.target.value as Status)}>
                  {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
            ))}
          </div>

          {a.missingInfo.length > 0 && (
            <div className="card"><h2>Missing / unverified information</h2><ul>{a.missingInfo.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
          )}

          <div className="card">
            <h2>Case timeline</h2>
            <div className="tl">
              {a.timeline.map((t, i) => (<div key={i}><b>{t.date}</b> — {t.event}<div className="muted">{t.source}</div></div>))}
              {!a.timeline.length && <p className="muted">No dated events found.</p>}
            </div>
          </div>

          <div className="card">
            <h2>Documents</h2>
            <table><thead><tr><th>File</th><th>Type</th><th>Pages</th></tr></thead>
              <tbody>{a.documents.map((d, i) => <tr key={i}><td>{d.name}</td><td>{d.type}</td><td>{d.pages}</td></tr>)}</tbody></table>
          </div>
        </>
      )}
    </>
  );
}
