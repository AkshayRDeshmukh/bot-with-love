import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  CandidatesPanel,
  type CandidateRow,
} from "@/components/admin/CandidatesPanel";

function useInterviewCandidates(interviewId?: string) {
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!interviewId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/interviews/${interviewId}/candidates?_=${Date.now()}`,
        {
          credentials: "include",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        },
      );
      if (!res.ok) throw new Error("Failed to load candidates");
      const data = (await res.json()) as CandidateRow[];
      setRows(data);
    } catch {
      setError("Failed to load candidates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId]);

  return { rows, loading, error, refresh };
}

function useInterviewDetails(interviewId?: string) {
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!interviewId) return;
      try {
        const res = await fetch(`/api/interviews/${interviewId}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active) setTitle((data?.title as string) || null);
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [interviewId]);
  return { title };
}

function Stat({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="flex flex-col items-start">
      <div className={`text-2xl font-semibold leading-none ${colorClass}`}>
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

import usePageHelp from "@/hooks/usePageHelp";

export default function AdminInterviewCandidates() {
  const { id } = useParams<{ id: string }>();
  const { rows } = useInterviewCandidates(id);
  const { title } = useInterviewDetails(id);

  usePageHelp(
    <div>
      <p className="mb-2">This page lists candidates for the selected interview. You can open candidate reports, preview resumes, invite candidates, and manage profiles.</p>
      <ul className="list-disc ml-5 text-sm">
        <li>Click "Reports" to view candidate reports and generate PDFs.</li>
        <li>Use the "Add Candidate" button to bulk upload or add individual resumes.</li>
        <li>Click a row to edit candidate details or open the report side panel.</li>
      </ul>
    </div>
  );

  const { total, notStarted, inProgress, completed } = useMemo(() => {
    const total = rows.length;
    let ns = 0,
      ip = 0,
      cp = 0;
    for (const r of rows) {
      const s = r.status || "NOT_STARTED";
      if (s === "COMPLETED") cp++;
      else if (s === "IN_PROGRESS") ip++;
      else ns++;
    }
    return { total, notStarted: ns, inProgress: ip, completed: cp };
  }, [rows]);

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
                    <Link to={`/admin/interviews/${id}/edit`}>
                      {title || `Interview ${id?.slice(0, 6)}`}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Candidates</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Candidates
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/admin/interviews/${id}/reports`} className="inline-flex">
              <Button variant="outline" size="sm" className="bg-white text-foreground shadow-sm hover:shadow ring-1 ring-border">Reports</Button>
            </Link>
            <Link to={`/admin/interviews/${id}/edit`} className="inline-flex">
              <Button
                variant="outline"
                size="sm"
                className="bg-white text-foreground shadow-sm hover:shadow ring-1 ring-border"
              >
                Back to Interview
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Total Profiles"
            value={total}
            colorClass="text-indigo-600 dark:text-indigo-400"
          />
          <Stat
            label="In Progress"
            value={inProgress}
            colorClass="text-amber-600 dark:text-amber-400"
          />
          <Stat
            label="Completed"
            value={completed}
            colorClass="text-emerald-600 dark:text-emerald-400"
          />
          <Stat
            label="Not Started"
            value={notStarted}
            colorClass="text-slate-600 dark:text-slate-300"
          />
        </div>

        <div>
          <CandidatesPanel interviewId={id} />
        </div>
      </div>
    </section>
  );
}
