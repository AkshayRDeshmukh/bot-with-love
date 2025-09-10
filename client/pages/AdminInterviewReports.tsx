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

export default function AdminInterviewReports() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

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
            <Link to={`/admin/interviews/${id}/edit`} className="inline-flex">
              <Button variant="outline" size="sm" className="bg-white text-foreground shadow-sm hover:shadow ring-1 ring-border">Back to Interview</Button>
            </Link>
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <div className="overflow-auto rounded-md border">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Candidate</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Attempt</th>
                {params.map((p) => (
                  <th key={p.id} className="px-3 py-2 text-left font-medium">{p.name}</th>
                ))}
                <th className="px-3 py-2 text-left font-medium">Overall %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                row.attempts && row.attempts.length > 0 ? (
                  row.attempts.map((att: any, j: number) => (
                    <tr key={`${row.candidate.id}-${att.attemptNumber}-${j}`} className={ (i + j) % 2 === 0 ? "bg-white" : "bg-slate-50" }>
                      <td className="px-3 py-2">{row.candidate.name || "(No name)"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.candidate.email}</td>
                      <td className="px-3 py-2">{att.attemptNumber}</td>
                      {params.map((p) => (
                        <td key={p.id} className="px-3 py-2">{att.scores && typeof att.scores[p.id] === 'number' ? att.scores[p.id] : "-"}</td>
                      ))}
                      <td className="px-3 py-2">{typeof att.overall === 'number' ? `${att.overall}%` : '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr key={row.candidate.id} className={ i % 2 === 0 ? "bg-white" : "bg-slate-50" }>
                    <td className="px-3 py-2">{row.candidate.name || "(No name)"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.candidate.email}</td>
                    <td className="px-3 py-2">-</td>
                    {params.map((p) => (<td key={p.id} className="px-3 py-2">-</td>))}
                    <td className="px-3 py-2">-</td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
