"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CaseRecord } from "@/lib/types";
import { readiness } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [title, setTitle] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [nextHearing, setNextHearing] = useState("");

  useEffect(() => {
    try { setCases(JSON.parse(localStorage.getItem("cases") || "[]")); } catch {}
  }, []);

  function create(e: React.FormEvent) {
    e.preventDefault();
    const c: CaseRecord = {
      id: Date.now().toString(36), title, caseNumber, nextHearing, createdAt: new Date().toISOString(),
    };
    const all = [c, ...cases];
    localStorage.setItem("cases", JSON.stringify(all));
    router.push(`/case/${c.id}`);
  }

  function remove(id: string) {
    const all = cases.filter((c) => c.id !== id);
    localStorage.setItem("cases", JSON.stringify(all));
    setCases(all);
  }

  return (
    <>
      <div className="card">
        <h2>Create a new case</h2>
        <form onSubmit={create}>
          <div className="row">
            <div><label>Case title</label><input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="State vs. Sample Accused" /></div>
            <div><label>Case number</label><input required value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} placeholder="CR/123/2026" /></div>
          </div>
          <label>Next hearing date (if known)</label>
          <input type="date" value={nextHearing} onChange={(e) => setNextHearing(e.target.value)} style={{ maxWidth: 220 }} />
          <div style={{ marginTop: 14 }}><button>Create case →</button></div>
        </form>
      </div>

      <div className="card">
        <h2>Your cases</h2>
        {!cases.length && <p className="muted">No cases yet. Create one above.</p>}
        {cases.map((c) => {
          const r = c.analysis ? readiness(c.analysis.obligations) : null;
          return (
            <div className="case" key={c.id}>
              <div>
                <Link href={`/case/${c.id}`}><b>{c.title}</b></Link>
                <div className="muted">{c.caseNumber} · Next hearing: {c.nextHearing || "not set"}</div>
              </div>
              <div>
                {r ? <span className="badge" style={{ background: r.score >= 80 ? "var(--ok)" : r.score >= 50 ? "var(--warn)" : "var(--bad)" }}>{r.score}% · {r.level}</span> : <span className="muted">Not analysed</span>}
                {" "}<button className="ghost" onClick={() => remove(c.id)}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
