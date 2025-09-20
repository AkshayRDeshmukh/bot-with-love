import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

import usePageHelp from "@/hooks/usePageHelp";

export default function AdminDashboard() {
  usePageHelp(
    <div>
      <p className="mb-2">Admin Dashboard provides an overview of your interviews and quick actions.</p>
      <ul className="list-disc ml-5 text-sm">
        <li>Create a new interview using the "New Interview" button.</li>
        <li>Click an interview row to edit details or manage candidates.</li>
        <li>Use the top-right help button to view page-specific guidance.</li>
      </ul>
    </div>
  );

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.12),transparent_40%),radial-gradient(ellipse_at_bottom_right,rgba(79,70,229,0.12),transparent_40%)]" />
      <div className="container py-10 md:py-16">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> New:
              Admin-selectable LLMs
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Admin Dashboard
            </h1>
            <p className="mt-2 text-muted-foreground">
              Manage interviews and monitor activity.
            </p>
          </div>
          <Button
            asChild
            className="bg-gradient-to-r from-violet-500 to-indigo-500"
          >
            <a href="/admin/interviews/new">New Interview</a>
          </Button>
        </div>

        <div className="grid gap-6">
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 shadow-xl ring-1 ring-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary" /> My Interviews
              </CardTitle>
              <CardDescription>Only visible to you</CardDescription>
            </CardHeader>
            <CardContent>
              <InterviewsTable />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { Trash2, Sparkles, FileText } from "lucide-react";

type Interview = {
  id: string;
  title: string;
  description: string;
  context: string;
  interviewerRole: string;
  createdAt: string;
  candidatesCount?: number;
};

function InterviewsTable() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/interviews", { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as Interview[];
          setRows(data);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading)
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  if (rows.length === 0)
    return (
      <div className="text-sm text-muted-foreground">No interviews yet.</div>
    );

  const handleDelete = async (id: string) => {
    const ok = confirm("Delete this interview?");
    if (!ok) return;
    const res = await fetch(`/api/interviews/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.status === 204) setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const columns = [
    {
      key: "id",
      header: "UID",
      sortable: true,
      className: "text-xs text-muted-foreground w-[1%] whitespace-nowrap",
      render: (r: Interview) => r.id.slice(0, 8),
    },
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (r: Interview) => <span className="font-medium">{r.title}</span>,
    },
    {
      key: "interviewerRole",
      header: "Role",
      className: "hidden md:table-cell",
      sortable: true,
    },
    {
      key: "context",
      header: "Context",
      className: "hidden md:table-cell max-w-[280px] truncate",
    },
    {
      key: "candidatesCount",
      header: "Candidates",
      sortable: true,
      className: "text-center",
    },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      render: (r: Interview) => new Date(r.createdAt).toLocaleString(),
    },
  ] as const;

  const roleOptions = Array.from(
    new Set(rows.map((r) => r.interviewerRole).filter(Boolean)),
  ).map((v) => ({ label: v, value: v }));

  return (
    <DataTable
      columns={columns as any}
      data={rows}
      getRowId={(r) => r.id}
      searchKeys={["title", "context", "interviewerRole"]}
      filters={[
        { label: "Role", key: "interviewerRole", options: roleOptions },
      ]}
      initialSort={{ key: "createdAt", dir: "desc" }}
      actions={(r: Interview) => (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20"
            aria-label="Delete interview"
            title="Delete interview"
            onClick={() => handleDelete(r.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
      onRowClick={(r: Interview) => navigate(`/admin/interviews/${r.id}/edit`)}
    />
  );
}
