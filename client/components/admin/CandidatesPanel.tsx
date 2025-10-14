import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import CandidatesTable from "./CandidatesTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FileText, Copy, BarChart3, Pencil, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type CandidateRow = {
  id: string;
  name: string | null;
  email: string;
  status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  startedAt?: string | null;
  completedAt?: string | null;
  invitedAt?: string | null;
  inviteCount?: number;
  inviteUrl?: string | null;
  totalExperienceMonths?: number;
  summary?: string | null;
  domain?: string | null;
  skills?: string[] | null;
  // New fields
  attemptsCount?: number;
  latestAttemptNumber?: number | null;
  hasPreviousAttempts?: boolean;
};

function useCandidates(interviewId: string | undefined) {
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
    } catch (e) {
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

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  if (user.length <= 2) return `${user[0] || "*"}***@${domain}`;
  const first = user[0];
  const last = user[user.length - 1];
  return `${first}${"*".repeat(Math.max(1, user.length - 2))}${last}@${domain}`;
}
function fmt(dt?: string | null) {
  if (!dt) return null;
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}
function shortId(id?: string) {
  if (!id) return "";
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function friendlyReportError(e: any): string {
  const raw = typeof e === 'string' ? e : (e?.message || '');
  try {
    const parsed = JSON.parse(raw);
    const msg = parsed?.error || parsed?.message || raw;
    if (String(msg).toLowerCase().includes('transcript not found')) {
      return 'No attempts yet. Report will be available after the candidate completes an attempt.';
    }
    return String(msg);
  } catch {}
  if (raw.toLowerCase().includes('transcript not found')) {
    return 'No attempts yet. Report will be available after the candidate completes an attempt.';
  }
  return raw || 'Failed to load report';
}

export function CandidatesPanel({ interviewId }: { interviewId?: string }) {
  const { rows, loading, error, refresh } = useCandidates(interviewId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = useMemo(() => Boolean(name && email), [name, email]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any | null>(null);
  const [reportTemplate, setReportTemplate] = useState<any | null>(null);
  const [reportTranscript, setReportTranscript] = useState<any[]>([]);
  const [proctorImgError, setProctorImgError] = useState(false);
  const [reportProctorUrl, setReportProctorUrl] = useState<string | null>(null);
  const [reportInterview, setReportInterview] = useState<any | null>(null);
  const [reportAttempt, setReportAttempt] = useState<number>(1);
  const [reportAttempts, setReportAttempts] = useState<
    { attemptNumber: number; createdAt?: string; id?: string }[]
  >([]);
  const [reportShowClips, setReportShowClips] = useState<boolean>(false);

  // Ref to the report sheet content so we can clone it for printing (right side panel)
  const reportSheetRef = useRef<HTMLElement | null>(null);
  const printCloneContainerId = 'report-print-clone-container';

  const prevSheetVisibilityRef = useRef<string | null>(null);
  useEffect(() => {
    // Improved beforeprint/afterprint handlers that:
    // - clone the right-panel sheet into a top-level container
    // - hide all other top-level body children while printing (avoids duplication and multiple <body> previews)
    // - restore original DOM state after printing
    const prevBodyDisplayRef = {
      current: null as null | Map<Element, string | null>,
    };
    let isPrinting = false;

    const sanitizeClone = (root: HTMLElement) => {
      const nodes = root.querySelectorAll('*');
      nodes.forEach((n) => {
        try {
          const hn = n as HTMLElement;
          // reset positioning and overflow to allow content to flow across pages
          hn.style.position = 'static';
          hn.style.top = 'auto';
          hn.style.left = 'auto';
          hn.style.transform = 'none';
          hn.style.height = 'auto';
          hn.style.maxHeight = 'none';
          hn.style.overflow = 'visible';
          hn.style.visibility = 'visible';
          hn.style.zIndex = 'auto';
          hn.style.pointerEvents = 'none';
        } catch (e) {
          // ignore
        }
      });
    };

    const onBeforePrint = () => {
      try {
        if (isPrinting) return;
        const el = reportSheetRef.current;
        if (!el) return;
        // avoid duplicating clone
        if (document.getElementById(printCloneContainerId)) return;

        isPrinting = true;

        // Save current display style of all direct body children
        const bodyChildren = Array.from(document.body.children);
        const prev = new Map<Element, string | null>();
        bodyChildren.forEach((c) => {
          try {
            prev.set(c, (c as HTMLElement).style.display || null);
          } catch (e) {
            prev.set(c, null);
          }
        });
        prevBodyDisplayRef.current = prev;

        // Create clone container
        const container = document.createElement('div');
        container.id = printCloneContainerId;
        container.style.position = 'relative';
        container.style.zIndex = '99999';
        container.style.background = 'white';
        container.style.width = '100%';
        container.style.padding = '12mm';
        container.style.boxSizing = 'border-box';

        // Deep clone the sheet element
        const clone = el.cloneNode(true) as HTMLElement;
        sanitizeClone(clone);
        container.appendChild(clone);

        // Hide all other top-level body children to ensure only our clone appears in print preview
        bodyChildren.forEach((c) => {
          try {
            if (c === container) return;
            (c as HTMLElement).style.display = 'none';
          } catch (e) {}
        });

        document.body.appendChild(container);

        // Ensure at top of page
        try { window.scrollTo(0, 0); } catch (e) {}
      } catch (e) {
        // swallow
      }
    };

    const onAfterPrint = () => {
      try {
        const c = document.getElementById(printCloneContainerId);
        if (c) c.remove();
        // Restore body children display
        const prev = prevBodyDisplayRef.current;
        if (prev) {
          prev.forEach((val, el) => {
            try {
              (el as HTMLElement).style.display = val || '';
            } catch (e) {}
          });
        }
        prevBodyDisplayRef.current = null;
      } catch (e) {
        // ignore
      } finally {
        isPrinting = false;
      }
    };

    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    (window as any).onbeforeprint = onBeforePrint;
    (window as any).onafterprint = onAfterPrint;
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      (window as any).onbeforeprint = null;
      (window as any).onafterprint = null;
      try { const c = document.getElementById(printCloneContainerId); if (c) c.remove(); } catch (e) {}
    };
  }, []);
  const [currentCandidate, setCurrentCandidate] = useState<CandidateRow | null>(
    null,
  );

  // Abortable per-attempt photo loader to avoid cache/stale-image races
  const photoRequestControllerRef = useRef<AbortController | null>(null);
  const photoRequestIdRef = useRef(0);
  const prevObjectUrlRef = useRef<string | null>(null);

  const loadProctorPhoto = async (photoUrl: string | null) => {
    try {
      // Cancel previous in-flight request
      if (photoRequestControllerRef.current) {
        try {
          photoRequestControllerRef.current.abort();
        } catch {}
      }
      photoRequestControllerRef.current = new AbortController();
      const localId = ++photoRequestIdRef.current;

      // Clear current UI image while loading
      if (prevObjectUrlRef.current) {
        try {
          URL.revokeObjectURL(prevObjectUrlRef.current);
        } catch {}
        prevObjectUrlRef.current = null;
      }
      setReportProctorUrl(null);
      setProctorImgError(false);

      if (!photoUrl) {
        setProctorImgError(true);
        return;
      }

      const res = await fetch(photoUrl, {
        credentials: "include",
        cache: "no-store",
        signal: photoRequestControllerRef.current.signal,
      });

      if (!res.ok) {
        if (photoRequestIdRef.current === localId) setProctorImgError(true);
        return;
      }

      const b = await res.blob();

      // If another request started after this one, discard this result
      if (photoRequestIdRef.current !== localId) {
        try {
          URL.revokeObjectURL(URL.createObjectURL(b));
        } catch {}
        return;
      }

      const obj = URL.createObjectURL(b);

      // Revoke previous and set new
      if (prevObjectUrlRef.current) {
        try {
          URL.revokeObjectURL(prevObjectUrlRef.current);
        } catch {}
      }
      prevObjectUrlRef.current = obj;
      setReportProctorUrl(obj);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setProctorImgError(true);
    }
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<CandidateRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editExpYears, setEditExpYears] = useState<string>("");
  const [editDomain, setEditDomain] = useState("");
  const [editSkills, setEditSkills] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editMaxAttempts, setEditMaxAttempts] = useState<string>("");

  // Bulk upload state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResults, setBulkResults] = useState<any[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).filter((f) => /\.(pdf|docx?|txt|zip)$/i.test(f.name));
    setBulkFiles((prev) => {
      const names = new Set(prev.map((f) => f.name + f.size));
      const merged = [...prev];
      for (const f of arr) {
        const key = f.name + f.size;
        if (!names.has(key)) merged.push(f);
      }
      return merged;
    });
  };

  async function openReport(cid: string, row?: CandidateRow) {
    if (!interviewId) return;
    setReportOpen(true);
    setReportLoading(true);
    setReportError(null);
    setReportData(null);
    setReportTemplate(null);
    setReportTranscript([]);
    setProctorImgError(false);
    if (row) setCurrentCandidate(row);
    try {
      const [rep, intr] = await Promise.all([
        fetch(`/api/interviews/${interviewId}/candidates/${cid}/report`, {
          credentials: "include",
        }),
        fetch(`/api/interviews/${interviewId}`, { credentials: "include" }),
      ]);
      if (!rep.ok) throw new Error(await rep.text());
      const data = await rep.json();
      setReportData(data?.report || data);
      setReportTemplate(data?.template || null);
      setReportTranscript(
        Array.isArray(data?.transcript) ? data.transcript : [],
      );
      const attempts = Array.isArray(data?.attempts) ? data.attempts : [];
      setReportAttempts(attempts);
      if (data?.report?.attemptNumber)
        setReportAttempt(Number(data.report.attemptNumber));
      if (intr.ok) setReportInterview(await intr.json());

      // Load proctor photo for this attempt using abortable loader to avoid stale images
      try {
        await loadProctorPhoto(data?.proctorPhotoUrl || null);
      } catch (err) {
        // errors handled inside loader
      }
    } catch (e: any) {
      setReportError(friendlyReportError(e));
    } finally {
      setReportLoading(false);
    }
  }

  const submit = async () => {
    if (!interviewId || !file) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (name) fd.append("name", name);
      fd.append("email", email);
      if (file) fd.append("resume", file);
      const res = await fetch(`/api/interviews/${interviewId}/candidates`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to add candidate");
      }
      const created = (await res.json()) as CandidateRow;
      await refresh();
      setOpen(false);
      setName("");
      setEmail("");
      setFile(null);
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      key: "interviewId",
      header: "Interview ID",
      sortable: false,
      className: "w-[140px] align-top",
      render: () => (
        <code
          title={interviewId}
          className="text-xs font-mono text-muted-foreground"
        >
          {shortId(interviewId)}
        </code>
      ),
    },
    {
      key: "name",
      header: "Candidate",
      sortable: true,
      className: "align-top",
      render: (r: CandidateRow) => {
        const s = r.status || "NOT_STARTED";
        let label = "";
        const color =
          s === "COMPLETED"
            ? "bg-green-100 text-green-700 border-green-200"
            : s === "IN_PROGRESS"
              ? "bg-amber-100 text-amber-700 border-amber-200"
              : "bg-slate-100 text-slate-700 border-slate-200";
        if (typeof r.latestAttemptNumber === "number") {
          if (s === "IN_PROGRESS") {
            label = `Attempt ${r.latestAttemptNumber}: In progress`;
          } else if (s === "COMPLETED") {
            label = `Attempt ${r.latestAttemptNumber}: Completed`;
          } else {
            label = `Attempt ${r.latestAttemptNumber}`;
          }
        } else {
          label =
            s === "COMPLETED"
              ? "Completed"
              : s === "IN_PROGRESS"
                ? "In Progress"
                : "Not Started";
        }
        const started = fmt(r.startedAt);
        const ended = fmt(r.completedAt);
        const expYears =
          typeof r.totalExperienceMonths === "number"
            ? (r.totalExperienceMonths / 12).toFixed(1)
            : null;
        return (
          <div className="flex flex-col gap-1">
            <div className="font-medium text-base">{r.name ?? "(No name)"}</div>
            <div className="text-sm text-muted-foreground">
              {maskEmail(r.email || "")}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {expYears && <span>Exp: {expYears} yrs</span>}
              {r.domain && <span>Domain: {r.domain}</span>}
              {Array.isArray(r.skills) && r.skills.length > 0 && (
                <span className="inline-flex flex-wrap gap-1">
                  {r.skills.slice(0, 5).map((sk, i) => (
                    <span key={i} className="rounded-full border px-2 py-0.5">
                      {sk}
                    </span>
                  ))}
                  {r.skills.length > 5 ? (
                    <span>+{r.skills.length - 5}</span>
                  ) : null}
                </span>
              )}
            </div>
            {r.summary && (
              <div
                className="text-xs text-muted-foreground"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical" as any,
                  overflow: "hidden",
                }}
              >
                {r.summary}
              </div>
            )}
            <div>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${color}`}
              >
                {label}
              </span>
            </div>
            {s === "IN_PROGRESS" && started && (
              <div className="text-xs text-muted-foreground">
                Started: {started}
              </div>
            )}
            {s === "COMPLETED" && (
              <div className="text-xs text-muted-foreground">
                {started ? <>Started: {started}</> : null}
                {ended ? (
                  <>
                    <br />
                    Ended: {ended}
                  </>
                ) : null}
              </div>
            )}
          </div>
        );
      },
    },
  ] as const;

  const emailDomains = Array.from(
    new Set(rows.map((r) => r.email.split("@")[1]).filter(Boolean)),
  ).map((d) => ({ label: d, value: d }));

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 shadow-xl ring-1 ring-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>
            Candidates{rows.length ? ` (${rows.length})` : ""}
          </CardTitle>
          <CardDescription>Attach candidates to this interview</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="bg-white text-foreground shadow-sm hover:shadow ring-1 ring-border"
            onClick={() => setBulkOpen(true)}
          >
            Add Candidate
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="text-sm text-muted-foreground">Loading...</div>
        )}
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="py-2">
          <CandidatesTable
            candidates={rows}
            onOpenReport={(c) => {
              if (!interviewId) return;
              openReport(c.id, c as any);
            }}
            onOpenResume={(c) => {
              setPreviewUrl(`/api/interviews/${interviewId}/candidates/${c.id}/resume?inline=1`);
              setPreviewOpen(true);
            }}
            onSendInvite={async (c) => {
              try {
                if (!interviewId) throw new Error("Missing interview id");
                const res = await fetch(`/api/interviews/${interviewId}/candidates/${c.id}/invite`, {
                  method: "POST",
                  credentials: "include",
                });
                if (!res.ok) throw new Error(await res.text());
                toast({ title: (c.inviteCount ?? 0) > 0 ? "Resent" : "Sent", description: "Invitation has been sent." });
                await refresh();
              } catch (e) {
                toast({ title: "Failed", description: "Unable to send invite.", variant: "destructive" });
              }
            }}
            onCopyInvite={async (c) => {
              try {
                if (!interviewId) throw new Error("Missing interview id");
                // Request server to generate an invite and return the candidate link (with token)
                const res = await fetch(`/api/interviews/${interviewId}/candidates/${c.id}/invite`, {
                  method: "POST",
                  credentials: "include",
                });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                const url = data?.inviteUrl || data?.url || c.inviteUrl;
                if (url) {
                  await navigator.clipboard.writeText(url);
                  toast({ title: "Copied", description: "Invite link copied to clipboard." });
                } else {
                  throw new Error("No invite URL returned");
                }
                // Refresh list to show invite metadata
                await refresh();
              } catch (e) {
                toast({ title: "Failed", description: "Unable to generate or copy invite link.", variant: "destructive" });
              }
            }}
            onEdit={(c) => {
              setEditing(c as any);
              setEditName((c as any).name || "");
              setEditEmail((c as any).email || "");
              setEditExpYears(typeof (c as any).totalExperienceMonths === "number" ? ((c as any).totalExperienceMonths / 12).toFixed(1) : "");
              setEditDomain((c as any).domain || "");
              setEditSkills(Array.isArray((c as any).skills) ? (c as any).skills.join(", ") : "");
              setEditSummary((c as any).summary || "");
              setEditMaxAttempts("");
              setEditOpen(true);
            }}
          />
        </div>
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Candidate Profile</DialogTitle>
            <DialogDescription>Update extracted details</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label>Email</Label>
              <Input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label>Total Experience (years)</Label>
              <Input
                type="number"
                step="0.1"
                value={editExpYears}
                onChange={(e) => setEditExpYears(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label>Domain</Label>
              <Input
                value={editDomain}
                onChange={(e) => setEditDomain(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label>Skills (comma separated)</Label>
              <Input
                value={editSkills}
                onChange={(e) => setEditSkills(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label>Summary</Label>
              <textarea
                className="rounded-md border bg-background px-3 py-2 min-h-24"
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label>Max Attempts (override)</Label>
              <Input
                type="number"
                min={1}
                value={editMaxAttempts}
                onChange={(e) => setEditMaxAttempts(e.target.value)}
                placeholder="Leave blank to use interview default"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!interviewId || !editing) return;
                const months = editExpYears
                  ? Math.round(parseFloat(editExpYears) * 12)
                  : undefined;
                const skills = editSkills
                  ? editSkills
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : [];
                const res = await fetch(
                  `/api/interviews/${interviewId}/candidates/${editing.id}/profile`,
                  {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                      name: editName,
                      email: editEmail,
                      totalExperienceMonths: months,
                      summary: editSummary,
                      domain: editDomain,
                      skills,
                      maxAttempts:
                        editMaxAttempts.trim() === ""
                          ? null
                          : Math.max(1, Math.floor(Number(editMaxAttempts))),
                    }),
                  },
                );
                if (res.ok) {
                  toast({
                    title: "Saved",
                    description: "Candidate profile updated.",
                  });
                  setEditOpen(false);
                  setEditing(null);
                  await refresh();
                } else {
                  toast({
                    title: "Failed",
                    description: await res.text(),
                    variant: "destructive",
                  });
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk upload sheet */}
      <Sheet open={bulkOpen} onOpenChange={(o) => {
        if (!o) {
          setBulkFiles([]);
          setBulkResults([]);
          setBulkError(null);
          setBulkUploading(false);
        }
        setBulkOpen(o);
      }}>
        <SheetContent side="right" className="w-[96vw] sm:max-w-3xl lg:max-w-4xl">
          <SheetHeader>
            <SheetTitle>Add Candidates</SheetTitle>
          </SheetHeader>
          <div className="p-4 space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); addFiles(e.dataTransfer.files); }}
              className="rounded-lg border-2 border-dashed p-6 text-center bg-background"
            >
              <div className="text-sm text-muted-foreground">Drag & drop PDF/DOC/DOCX/TXT files or a ZIP here</div>
              <div className="mt-3">
                <Input type="file" multiple accept=".pdf,.doc,.docx,.txt,.zip" onChange={(e) => addFiles(e.target.files)} />
              </div>
            </div>

            {bulkFiles.length > 0 && (
              <div className="rounded-md border bg-card">
                <div className="px-3 py-2 text-sm font-medium">Selected Files ({bulkFiles.length})</div>
                <div className="max-h-64 overflow-auto divide-y">
                  {bulkFiles.map((f, i) => (
                    <div key={i} className="px-3 py-2 text-sm flex items-center justify-between">
                      <div className="truncate max-w-[70%]" title={f.name}>{f.name}</div>
                      <button
                        className="text-xs text-destructive hover:underline"
                        onClick={() => setBulkFiles((prev) => prev.filter((_, j) => j !== i))}
                        disabled={bulkUploading}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                onClick={async () => {
                  if (!interviewId) return;
                  setBulkUploading(true);
                  setBulkError(null);
                  setBulkResults([]);
                  try {
                    const fd = new FormData();
                    // If any zip present, send the first zip as 'zip'
                    const zips = bulkFiles.filter((f) => /\.zip$/i.test(f.name));
                    if (zips.length > 0) {
                      fd.append("zip", zips[0]);
                    }
                    // Send all non-zip resumes
                    for (const f of bulkFiles) {
                      if (!/\.zip$/i.test(f.name)) fd.append("resumes", f);
                    }
                    const res = await fetch(`/api/interviews/${interviewId}/candidates/bulk`, {
                      method: "POST",
                      credentials: "include",
                      body: fd,
                    });
                    if (!res.ok) throw new Error(await res.text());
                    const data = await res.json();
                    setBulkResults(Array.isArray(data?.results) ? data.results : []);
                    toast({ title: "Bulk upload completed", description: `${data?.results?.length || 0} files processed.` });
                    await refresh();
                  } catch (e: any) {
                    setBulkError(e?.message || "Bulk upload failed");
                    toast({ title: "Failed", description: "Bulk upload failed", variant: "destructive" });
                  } finally {
                    setBulkUploading(false);
                  }
                }}
                disabled={bulkUploading || bulkFiles.length === 0}
              >
                {bulkUploading ? (
                  <span className="inline-flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</span>
                ) : (
                  "Start Upload"
                )}
              </Button>
              <Button variant="ghost" onClick={() => { setBulkFiles([]); setBulkResults([]); setBulkError(null); }} disabled={bulkUploading}>Clear</Button>
            </div>

            {bulkError && <div className="text-sm text-destructive">{bulkError}</div>}

            {bulkResults.length > 0 && (
              <div className="rounded-md border bg-card">
                <div className="px-3 py-2 text-sm font-medium">Results</div>
                <div className="max-h-64 overflow-auto divide-y">
                  {bulkResults.map((r, i) => (
                    <div key={i} className="px-3 py-2 text-sm flex items-center justify-between">
                      <div className="truncate max-w-[60%]" title={r.file}>{r.file}</div>
                      <div className={`text-xs ${r.status === 'ok' ? 'text-emerald-600' : 'text-destructive'}`}>
                        {r.status === 'ok' ? 'OK' : r.reason || 'Failed'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent
          side="right"
          className="w-[96vw] sm:max-w-3xl lg:max-w-5xl p-0"
        >
          <SheetHeader className="px-4 py-3">
            <SheetTitle>Resume Preview</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100vh-56px)] w-full">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                title="Resume"
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No document
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={reportOpen} onOpenChange={(open) => {
        // When closing the report sheet, revoke any created object URL
        if (!open && reportProctorUrl) {
          try { URL.revokeObjectURL(reportProctorUrl); } catch {}
          setReportProctorUrl(null);
        }
        setReportOpen(open);
      }}>
        <SheetContent
          side="right"
          className="w-[96vw] sm:max-w-3xl lg:max-w-4xl"
          ref={(el: any) => reportSheetRef.current = el}
        >
          <SheetHeader>
            <div className="flex items-center justify-between px-1">
              <SheetTitle>Candidate Report</SheetTitle>
              <Button size="sm" onClick={() => {
                // Use the browser print API and our beforeprint handler to generate a clean print preview
                try {
                  window.print();
                } catch (e) {
                  // ignore
                }
              }}>
                Download PDF
              </Button>
            </div>
          </SheetHeader>
          <div className="h-[calc(100vh-56px)] overflow-auto p-4">
            <style>{`
              @media print {
                @page { size: A4; margin: 16mm; }
                html, body { height: auto !important; overflow: visible !important; }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                /* Hide everything by default, but keep layout for print root */
                body * { visibility: hidden !important; }
                #report-print, #report-print * { visibility: visible !important; }
                /* Ensure print root flows from top-left with no fixed/absolute duplication */
                #report-print, #report-print * { position: static !important; transform: none !important; }
                #report-print { width: 100% !important; margin: 0 !important; padding: 0 !important; }
                .no-print { display: none !important; }
                .avoid-break { break-inside: avoid !important; page-break-inside: avoid !important; }
                .page-break { break-after: page !important; page-break-after: always !important; }
                .shadow, .shadow-sm, .shadow-md, .shadow-lg, .ring, .ring-1, .ring-2 { box-shadow: none !important; }
                .animate-in, .fade-in, .slide-in-from-bottom-2 { animation: none !important; }
              }
            `}</style>
            {Array.isArray(reportAttempts) && reportAttempts.length > 0 && (
              <div className="mb-4">
                <div className="inline-flex flex-wrap items-center gap-2 rounded-md border p-2 bg-background">
                  {reportAttempts.map((a) => (
                    <button
                      key={a.id || a.attemptNumber}
                      className={`px-3 py-2 text-sm rounded border transition ${reportAttempt === a.attemptNumber ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                      onClick={async () => {
                        if (!currentCandidate || !interviewId) return;
                        setReportAttempt(a.attemptNumber);
                        setReportLoading(true);
                        setReportError(null);
                        try {
                          const url = new URL(
                            `/api/interviews/${interviewId}/candidates/${currentCandidate.id}/report`,
                            window.location.origin,
                          );
                          url.searchParams.set(
                            "attempt",
                            String(a.attemptNumber),
                          );
                          const rep = await fetch(url.toString(), {
                            credentials: "include",
                          });
                          if (!rep.ok) throw new Error(await rep.text());
                          const data = await rep.json();
                          setReportData(data?.report || data);
                          setReportTemplate(data?.template || null);
                          setReportTranscript(
                            Array.isArray(data?.transcript)
                              ? data.transcript
                              : [],
                          );
                          const attempts = Array.isArray(data?.attempts)
                            ? data.attempts
                            : [];
                          setReportAttempts(attempts);

                          // Load proctor photo for this attempt using abortable loader
                          try {
                            await loadProctorPhoto(data?.proctorPhotoUrl || null);
                          } catch (err) {
                            // handled in loader
                          }
                        } catch (e: any) {
                          setReportError(friendlyReportError(e));
                        } finally {
                          setReportLoading(false);
                        }
                      }}
                    >
                      <div className="font-medium">
                        Attempt {a.attemptNumber}
                      </div>
                      {a.createdAt && (
                        <div className="text-xs opacity-80 tabular-nums">
                          {fmt(a.createdAt)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <button
                    className="px-3 py-2 text-sm rounded border bg-white hover:bg-muted"
                    onClick={async () => {
                      if (!currentCandidate || !interviewId) return;
                      setReportLoading(true);
                      setReportError(null);
                      try {
                        const url = new URL(
                          `/api/interviews/${interviewId}/candidates/${currentCandidate.id}/report`,
                          window.location.origin,
                        );
                        url.searchParams.set("attempt", String(reportAttempt));
                        url.searchParams.set("force", "1");
                        url.searchParams.set("useRawTranscript", "1");
                        const rep = await fetch(url.toString(), {
                          credentials: "include",
                        });
                        if (!rep.ok) throw new Error(await rep.text());
                        const data = await rep.json();
                        setReportData(data?.report || data);
                        setReportTemplate(data?.template || null);
                        setReportTranscript(Array.isArray(data?.transcript) ? data.transcript : []);
                        const attempts = Array.isArray(data?.attempts) ? data.attempts : [];
                        setReportAttempts(attempts);

                        // Load proctor photo for this attempt using abortable loader
                        try {
                          await loadProctorPhoto(data?.proctorPhotoUrl || null);
                        } catch (err) {
                          // handled in loader
                        }
                      } catch (e: any) {
                        setReportError(friendlyReportError(e));
                      } finally {
                        setReportLoading(false);
                      }
                    }}
                  >
                    Regenerate report for this attempt
                  </button>
                </div>
              </div>
            )}
            {reportLoading && (
              <div className="text-sm text-muted-foreground">
                Generating report…
              </div>
            )}
            {reportError && (
              <div className="text-sm text-destructive">{reportError}</div>
            )}
            {!reportLoading && !reportError && reportData && (
              <div id="report-print" className="space-y-6">
                {/* Header Row: photo + name/role/date + overall ring */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 avoid-break animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-4">
                    <div className="h-36 w-28 rounded-md ring-2 ring-primary/30 overflow-hidden bg-muted">
                      {!proctorImgError ? (
                        <img
                          src={reportProctorUrl ?? `/api/interviews/${interviewId}/candidates/${(reportData as any)?.candidateId || ""}/proctor-photo?inline=1&attempt=${encodeURIComponent(String(reportAttempt))}`}
                          alt="Profile photo"
                          className="h-full w-full object-cover"
                          onError={() => setProctorImgError(true)}
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                          No photo
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-xl font-bold">
                        {currentCandidate?.name ||
                          currentCandidate?.email ||
                          "Candidate"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {(reportInterview?.interviewerRole as string) ||
                          "Interview"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {(() => {
                          const sel = (reportAttempts || []).find(
                            (x) => x.attemptNumber === reportAttempt,
                          );
                          const when =
                            sel?.createdAt ||
                            currentCandidate?.completedAt ||
                            currentCandidate?.startedAt;
                          return when
                            ? `Attempt ${reportAttempt} on ${fmt(when)}`
                            : null;
                        })()}
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const params = Array.isArray(
                      reportData?.structure?.parameters,
                    )
                      ? reportData.structure.parameters
                      : Array.isArray(reportData?.scores)
                        ? reportData.scores
                        : [];
                    const tplParams = Array.isArray(reportTemplate?.parameters)
                      ? reportTemplate.parameters
                      : [];
                    const byId: Record<string, any> = Object.fromEntries(
                      tplParams.map((p: any) => [String(p.id), p]),
                    );
                    const normalizeScore = (p: any, t: any) => {
                      let s = Number(p?.score ?? 0);
                      const comment = String(p?.comment || "").toLowerCase();
                      if (comment.includes("no evidence")) {
                        s = 0;
                      }
                      return s;
                    };
                    const pctFor = (p: any) => {
                      const t = byId[String(p.id)] || {};
                      const min = Number(t?.scale?.min ?? 1);
                      const max = Number(t?.scale?.max ?? 5);
                      const s = normalizeScore(p, t);
                      const clamped = Math.max(min, Math.min(max, s));
                      return Math.round(((clamped - min) / (max - min)) * 100);
                    };
                    const overall =
                      typeof reportData?.structure?.overall === "number"
                        ? reportData.structure.overall
                        : (() => {
                            let acc = 0,
                              tw = 0;
                            for (const p of params) {
                              const t = byId[String(p.id)] || {};
                              const w = Number(t.weight) || 0;
                              if (!w) continue;
                              const pct = pctFor(p);
                              acc += pct * w;
                              tw += w;
                            }
                            return tw > 0 ? Math.round(acc / tw) : 0;
                          })();
                    const color =
                      overall < 50
                        ? "#ef4444"
                        : overall < 80
                          ? "#f59e0b"
                          : "#10b981";
                    const Circle = ({
                      pct,
                      size = 112,
                    }: {
                      pct: number;
                      size?: number;
                    }) => {
                      const radius = (size - 12) / 2;
                      const c = 2 * Math.PI * radius;
                      const dash = (pct / 100) * c;
                      return (
                        <svg
                          width={size}
                          height={size}
                          viewBox={`0 0 ${size} ${size}`}
                        >
                          <circle
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            stroke="#e5e7eb"
                            strokeWidth="12"
                            fill="none"
                          />
                          <circle
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            stroke={color}
                            strokeWidth="12"
                            fill="none"
                            strokeDasharray={`${dash} ${c - dash}`}
                            strokeLinecap="round"
                            transform={`rotate(-90 ${size / 2} ${size / 2})`}
                            style={{
                              transition: "stroke-dasharray 600ms ease",
                            }}
                          />
                          <text
                            x="50%"
                            y="50%"
                            dominantBaseline="middle"
                            textAnchor="middle"
                            fontSize="18"
                            fontWeight="700"
                            fill={color}
                          >
                            {overall}%
                          </text>
                        </svg>
                      );
                    };
                    return (
                      <div className="rounded-lg border bg-card shadow-sm p-4 flex items-center gap-5">
                        <Circle pct={overall} />
                        <div>
                          <div className="text-base font-semibold">
                            Overall Weightage
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Weighted score across parameters
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Tabs for views */}
                <div className="avoid-break">
                  <div className="mb-3">
                    <div className="space-y-4">
                      {reportData?.summary && (
                        <div className="rounded-2xl border bg-card shadow-sm p-5 text-sm animate-in fade-in slide-in-from-bottom-2">
                          <div className="mb-2 text-lg font-semibold">
                            Summary
                          </div>
                          <p className="leading-7 whitespace-pre-wrap">
                            {reportData.summary}
                          </p>
                        </div>
                      )}
                      {(() => {
                        const params = Array.isArray(
                          reportData?.structure?.parameters,
                        )
                          ? reportData.structure.parameters
                          : Array.isArray(reportData?.scores)
                            ? reportData.scores
                            : [];
                        if (!params.length)
                          return (
                            <div className="text-sm text-muted-foreground">
                              No scores available.
                            </div>
                          );
                        const tplParams = Array.isArray(
                          reportTemplate?.parameters,
                        )
                          ? reportTemplate.parameters
                          : [];
                        const byId: Record<string, any> = Object.fromEntries(
                          tplParams.map((p: any) => [String(p.id), p]),
                        );
                        const normalizeScore = (p: any, t: any) => {
                      let s = Number(p?.score ?? 0);
                      const comment = String(p?.comment || "").toLowerCase();
                      if (comment.includes("no evidence")) {
                        s = 0;
                      }
                      return s;
                    };
                        const pctFor = (p: any) => {
                          const t = byId[String(p.id)] || {};
                          const min = Number(t?.scale?.min ?? 1);
                          const max = Number(t?.scale?.max ?? 5);
                          const s = normalizeScore(p, t);
                          const clamped = Math.max(min, Math.min(max, s));
                          return Math.round(
                            ((clamped - min) / (max - min)) * 100,
                          );
                        };
                        const colorClass = (pct: number) =>
                          pct < 50
                            ? "bg-red-500/10 ring-red-200"
                            : pct < 80
                              ? "bg-amber-500/10 ring-amber-200"
                              : "bg-emerald-500/10 ring-emerald-200";
                        return (
                          <div className="space-y-3 avoid-break animate-in fade-in slide-in-from-bottom-2">
                            <div className="text-lg font-semibold">Scores</div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {params.map((p: any, idx: number) => {
                                const pct = pctFor(p);
                                const icon =
                                  pct < 50 ? "❌" : pct < 80 ? "⚠️" : "��️";
                                return (
                                  <div
                                    key={p.id || idx}
                                    className={`rounded-2xl border p-4 ring-1 shadow-sm hover:shadow-md hover:scale-[1.01] transition ${colorClass(pct)} avoid-break`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="font-semibold text-base flex items-center gap-2">
                                        <span>{icon}</span>
                                        <span>{p.name || p.id}</span>
                                      </div>
                                      <div className="text-sm tabular-nums">
                                        {(() => {
                                          const t = byId[String(p.id)] || {};
                                          const min = Number(t?.scale?.min ?? 1);
                                          const max = Number(t?.scale?.max ?? 5);
                                          const sc = normalizeScore(p, t);
                                          const val = Number.isFinite(sc) ? sc : null;
                                          const isPct = t?.scale?.type === "percentage" || (min === 0 && max === 100);
                                          const label = val != null ? (isPct ? `${val}%` : `${val}/${max}`) : "-";
                                          return (
                                            <div className="flex items-center gap-3">
                                              <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-sm border font-medium">
                                                {label}
                                              </span>

                                              {p?.cefr || p?.CEFR ? (
                                                <span className="inline-flex items-center rounded-full bg-violet-700 text-white px-2 py-1 text-sm font-semibold">
                                                  {String(p?.cefr || p?.CEFR)}
                                                </span>
                                              ) : null}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                    {p.comment && (
                                      <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                                        {p.comment}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {(() => {
                        const selAttempt = (reportAttempts || []).find((x) => x.attemptNumber === reportAttempt);
                        const recs = Array.isArray(selAttempt?.recordings) ? selAttempt!.recordings : [];
                        // Use outer state 'reportShowClips' to control visibility of clips
                        return (
                          <>
                            {recs.length > 0 && (
                              <div className="mb-3">
                                <button
                                  className="px-3 py-2 text-sm rounded border bg-white hover:bg-muted"
                                  onClick={() => setReportShowClips((s) => !s)}
                                >
                                  {reportShowClips ? 'Hide recorded clips' : `Show recorded clips (${recs.length})`}
                                </button>
                              </div>
                            )}

                            {/* Conversation History always visible */}
                            <>
                              <div className="page-break"></div>
                              <div className="space-y-3 avoid-break animate-in fade-in slide-in-from-bottom-2">
                                <div className="text-lg font-semibold">
                                  Conversation History
                                </div>
                                <div className="space-y-2">
                                  {Array.isArray(reportTranscript) && reportTranscript.length > 0 ? (
                                    reportTranscript.map((m: any, i: number) => {
                                      const role = String(m.role || "").toLowerCase();
                                      const isUser = role === "user";
                                      const isAssistant = role === "assistant";
                                      const align = isUser ? "justify-end" : "justify-start";
                                      const bubble = isUser
                                        ? "bg-sky-500/10 border border-sky-200 text-sky-900"
                                        : isAssistant
                                          ? "bg-violet-500/10 border border-violet-200 text-violet-900"
                                          : "bg-zinc-100 border border-zinc-200 text-zinc-800";
                                      const label = isUser ? "You" : isAssistant ? "AI" : role || "System";
                                      return (
                                        <div key={i} className={`flex ${align} avoid-break`}>
                                          <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${bubble}`}>
                                            <div className="text-[11px] opacity-70 mb-1">{label}</div>
                                            <div className="whitespace-pre-wrap text-sm leading-6">{m.content}</div>
                                          </div>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="text-sm text-muted-foreground">No conversation history available.</div>
                                  )}
                                </div>
                              </div>
                            </>

                            {/* Clips area: shown only when toggled */}
                            {reportShowClips && recs.length > 0 && (
                              <div className="mt-4">
                                <div className="text-lg font-semibold mb-2">Recorded clips</div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {recs.map((rec: any) => (
                                    <div key={rec.id} className="bg-white border rounded p-1">
                                      <video controls src={rec.url} className="w-full h-28 object-cover bg-black" />
                                      <div className="text-xs text-muted-foreground mt-1">{rec.seq != null ? `#${String(rec.seq).padStart(2, '0')}` : ''} {rec.createdAt ? new Date(rec.createdAt).toLocaleString() : ''}</div>
                                      <div className="text-xs mt-1"><a className="text-blue-600 hover:underline" href={rec.url} target="_blank" rel="noreferrer">Open</a></div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
