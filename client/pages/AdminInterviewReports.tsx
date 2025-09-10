import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

function formatDate(d?: string | null) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

export default function AdminInterviewReports() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  // UI state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/interviews/${id}/reports/summary`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const params: { id: string; name: string }[] = useMemo(() => Array.isArray(data?.parameters) ? data.parameters : [], [data]);
  const rows: any[] = useMemo(() => Array.isArray(data?.rows) ? data.rows : [], [data]);

  const toggle = (cid: string) => setExpanded(s => ({ ...s, [cid]: !s[cid] }));

  const filteredRows = useMemo(() => {
    const s = (search || "").trim().toLowerCase();
    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;

    return rows
      .map(r => {
        const attempts = Array.isArray(r.attempts) ? r.attempts : [];
        // filter attempts by date range
        const filteredAttempts = attempts.filter((a: any) => {
          if (!a?.createdAt) return true;
          const dt = new Date(a.createdAt);
          if (from && dt < from) return false;
          if (to) {
            // Include whole day for 'to' by setting time to end of day
            const toEnd = new Date(to);
            toEnd.setHours(23,59,59,999);
            if (dt > toEnd) return false;
          }
          return true;
        });
        return { ...r, attempts: filteredAttempts };
      })
      .filter(r => {
        if (!s) return true;
        const name = String(r.candidate?.name || "").toLowerCase();
        const email = String(r.candidate?.email || "").toLowerCase();
        return name.includes(s) || email.includes(s);
      });
  }, [rows, search, fromDate, toDate]);

  const downloadCSV = () => {
    if (!data) return;
    const headers = ["Candidate", "Email", "Attempt", ...params.map(p => p.name), "Overall %", "Date"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      const attempts = Array.isArray(r.attempts) && r.attempts.length > 0 ? r.attempts : [{ attemptNumber: null, scores: {}, overall: null, createdAt: null }];
      for (const a of attempts) {
        const cols = [
          `"${(r.candidate.name || "").replace(/"/g, '""')}"`,
          `"${(r.candidate.email || "").replace(/"/g, '""')}"`,
          a.attemptNumber != null ? String(a.attemptNumber) : "",
        ];
        for (const p of params) {
          const v = a.scores && typeof a.scores[p.id] === 'number' ? String(a.scores[p.id]) : "";
          cols.push(`"${String(v).replace(/"/g, '""')}"`);
        }
        cols.push(a.overall != null ? String(a.overall) : "");
        cols.push(a.createdAt ? `"${String(a.createdAt)}"` : "");
        lines.push(cols.join(","));
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.interview?.title || 'reports'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.12),transparent_40%),radial-gradient(ellipse_at_bottom_right,rgba(79,70,229,0.12),transparent_40%)]" />
      <div className="container py-8 md:py-12 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/admin">Admin</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={`/admin/interviews/${id}/edit`}>{data?.interview?.title || `Interview ${id?.slice(0,6)}`}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Reports</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Interview Reports</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
            <Button variant="outline" size="sm" onClick={downloadCSV}>Export CSV</Button>
            <Link to={`/admin/interviews/${id}/edit`} className="inline-flex">
              <Button variant="outline" size="sm" className="bg-white text-foreground shadow-sm hover:shadow ring-1 ring-border">Back to Interview</Button>
            </Link>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <input className="input" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">From</label>
            <input type="date" value={fromDate || ""} onChange={(e) => setFromDate(e.target.value || null)} className="input" />
            <label className="text-sm text-muted-foreground">To</label>
            <input type="date" value={toDate || ""} onChange={(e) => setToDate(e.target.value || null)} className="input" />
            <Button variant="ghost" onClick={() => { setSearch(""); setFromDate(null); setToDate(null); }}>Clear</Button>
          </div>
        </div>

        <div className="overflow-auto rounded-md border">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Candidate</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Attempts</th>
                <th className="px-3 py-2 text-left font-medium">Top Score</th>
                <th className="px-3 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => {
                const attempts = Array.isArray(row.attempts) ? row.attempts : [];
                const top = attempts.length ? Math.max(...attempts.map((a:any) => typeof a.overall==='number' ? a.overall : -Infinity)) : null;
                const isExp = !!expanded[row.candidate.id];
                return (
                  <>
                    <tr key={row.candidate.id} className={(i % 2 === 0) ? "bg-white" : "bg-slate-50"}>
                      <td className="px-3 py-2">{row.candidate.name || "(No name)"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.candidate.email}</td>
                      <td className="px-3 py-2">{attempts.length}</td>
                      <td className="px-3 py-2">{top != null && top !== -Infinity ? `${top}%` : '-'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => toggle(row.candidate.id)}>{isExp ? 'Collapse' : 'Expand'}</Button>
                          <Link to={`/admin/interviews/${id}/candidates/${row.candidate.id}/report`} className="inline-flex">
                            <Button size="sm" variant="outline">Open Latest</Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                    {isExp && attempts.length > 0 && attempts.map((att:any, idx:number) => (
                      <tr key={`${row.candidate.id}-att-${att.attemptNumber}-${idx}`} className={(i % 2 === 0) ? "bg-white" : "bg-slate-50"}>
                        <td className="px-3 py-2">&nbsp;&nbsp;Attempt {att.attemptNumber}</td>
                        <td className="px-3 py-2 text-muted-foreground">{att.createdAt ? formatDate(att.createdAt) : '-'}</td>
                        <td className="px-3 py-2">{/* empty: placeholder for Attempts column */}</td>
                        {params.map((p) => (
                          <td key={p.id} className="px-3 py-2">{att.scores && typeof att.scores[p.id] === 'number' ? att.scores[p.id] : "-"}</td>
                        ))}
                        <td className="px-3 py-2">{typeof att.overall === 'number' ? `${att.overall}%` : '-'}</td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
