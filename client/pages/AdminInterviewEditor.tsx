import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AdminInterviewForm,
  InterviewInput,
} from "@/components/admin/AdminInterviewForm";
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ReportTemplateEditor } from "@/components/admin/ReportTemplateEditor";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Pencil, Bot, FileText, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function AdminInterviewEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const [initial, setInitial] = useState<Partial<InterviewInput> | undefined>();
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const res = await fetch(`/api/interviews/${id}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setInitial({
          title: data.title,
          description: data.description,
          context: data.context,
          contextDomain: (data as any)?.contextDomain ?? undefined,
          interviewerRole: data.interviewerRole,
          durationMinutes: data.durationMinutes ?? undefined,
          interactionMode: data.interactionMode || "AUDIO",
          maxAttempts: (data as any)?.maxAttempts ?? undefined,
          cefrEvaluation: (data as any)?.cefrEvaluation ?? false,
          ...(Array.isArray((data as any)?.inviteCcEmails) ? { inviteCcEmails: (data as any).inviteCcEmails } : {}),
        });
      } catch (e) {
        setError("Failed to load interview");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (values: InterviewInput) => {
    setError(null);
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/interviews/${id}` : "/api/interviews";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        setError("Failed to save interview");
        return;
      }
      // Refetch saved interview from server to get contextSummary/contextDomain populated
      const freshRes = await fetch(`/api/interviews/${isEdit ? id : (await res.json()).id}`, { credentials: "include" });
      if (freshRes.ok) {
        const data = await freshRes.json();
        setInitial({
          title: data.title,
          description: data.description,
          context: data.context,
          contextDomain: (data as any)?.contextDomain ?? undefined,
          interviewerRole: data.interviewerRole,
          durationMinutes: data.durationMinutes ?? undefined,
          interactionMode: data.interactionMode || "AUDIO",
          maxAttempts: (data as any)?.maxAttempts ?? undefined,
          cefrEvaluation: (data as any)?.cefrEvaluation ?? false,
          ...(Array.isArray((data as any)?.inviteCcEmails) ? { inviteCcEmails: (data as any).inviteCcEmails } : {}),
        });
      } else {
        // fallback to submitted values
        setInitial(values);
      }
      setEditing(false);
      toast({ title: "Saved", description: "Interview details updated." });
      if (!isEdit) navigate("/admin", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.12),transparent_40%),radial-gradient(ellipse_at_bottom_right,rgba(79,70,229,0.12),transparent_40%)]" />
      <div className="container py-10 md:py-16">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {isEdit ? initial?.title?.trim() || "Interview" : "New Interview"}
            </h1>
            {id && (
              <p className="mt-1 text-xs text-muted-foreground">ID: {id}</p>
            )}
            <p className="mt-2 text-muted-foreground">
              Define the interview details. Only you (the creator) will see and
              manage it.
            </p>
            {error && (
              <div className="mt-2 rounded-md border bg-card p-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEdit && id && (
              <Link
                to={`/admin/interviews/${id}/candidates`}
                className="inline-flex"
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white text-foreground shadow-sm hover:shadow ring-1 ring-border"
                >
                  <Users className="h-4 w-4 mr-1.5" />
                  Manage Candidates
                </Button>
              </Link>
            )}
            {(() => {
              const canPreview = Boolean(
                isEdit &&
                  initial?.context &&
                  initial.context.trim() &&
                  initial?.interviewerRole &&
                  initial.interviewerRole.trim(),
              );
              if (canPreview) {
                return (
                  <a
                    href={`/candidate/preview?id=${id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center rounded-md bg-gradient-to-r from-violet-500 to-indigo-500 px-3 text-sm text-primary-foreground shadow hover:opacity-90"
                  >
                    <Bot className="h-4 w-4 mr-1.5" />
                    Preview Bot
                  </a>
                );
              }
              return (
                <button
                  type="button"
                  disabled
                  title="Add Context and Interviewer Role to enable preview"
                  className="inline-flex h-9 cursor-not-allowed items-center rounded-md bg-muted px-3 text-sm text-muted-foreground"
                >
                  Preview Bot
                </button>
              );
            })()}
          </div>
        </div>
        <div className="min-h-[50vh]">
          <ResizablePanelGroup
            direction="horizontal"
            className="rounded-md border"
          >
            <ResizablePanel defaultSize={45} minSize={0} collapsible>
              <div className="p-4 h-full overflow-auto">
                <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 shadow-xl ring-1 ring-border h-full">
                  <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-5 w-5 text-primary" /> Interview
                        Details
                      </CardTitle>
                      <CardDescription>
                        These fields will be passed to the LLM prompt later.
                      </CardDescription>
                    </div>
                    {isEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={editing ? "Cancel edit" : "Edit"}
                        onClick={() => setEditing((v) => !v)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="text-sm text-muted-foreground">
                        Loading...
                      </div>
                    ) : editing || !isEdit ? (
                      <AdminInterviewForm
                        initial={initial}
                        onSubmit={onSubmit}
                        submitting={submitting}
                      />
                    ) : (
                      <TooltipProvider>
                        <div className="grid gap-4">
                          <div>
                            <div className="text-xs text-muted-foreground">
                              Title
                            </div>
                            <div className="mt-1 whitespace-pre-wrap">
                              {initial?.title || ""}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">
                              Interviewer Role
                            </div>
                            <div className="mt-1 whitespace-pre-wrap">
                              {initial?.interviewerRole || ""}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">CEFR Evaluation</div>
                            <div className="mt-1">
                              {(initial as any)?.cefrEvaluation ? "Enabled" : "Disabled"}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-muted-foreground">
                                Duration (minutes)
                              </div>
                              <div className="mt-1">
                                {(initial as any)?.durationMinutes ?? "—"}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">
                                Interaction Type
                              </div>
                              <div className="mt-1 inline-flex items-center gap-2">
                                {((initial as any)?.interactionMode ||
                                  "AUDIO") === "TEXT_ONLY" ? (
                                  <>
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="h-4 w-4 text-muted-foreground"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                      <polyline points="7 10 12 15 17 10" />
                                      <line x1="12" x2="12" y1="15" y2="3" />
                                    </svg>
                                    <span>Text only</span>
                                  </>
                                ) : (
                                  <>
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="h-4 w-4 text-muted-foreground"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M12 1v22" />
                                      <path d="M5 8v8a7 7 0 0 0 14 0V8" />
                                      <line x1="8" y1="8" x2="8" y2="16" />
                                      <line x1="16" y1="8" x2="16" y2="16" />
                                    </svg>
                                    <span>Audio</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">
                                Default Max Attempts
                              </div>
                              <div className="mt-1">
                                {(initial as any)?.maxAttempts ?? "—"}
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">
                              Description
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className="text-sm whitespace-pre-wrap"
                                  style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 6,
                                    WebkitBoxOrient: "vertical" as any,
                                    overflow: "hidden",
                                  }}
                                >
                                  {initial?.description || ""}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md whitespace-pre-wrap">
                                {initial?.description || ""}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">
                              Context
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className="text-sm whitespace-pre-wrap"
                                  style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 6,
                                    WebkitBoxOrient: "vertical" as any,
                                    overflow: "hidden",
                                  }}
                                >
                                  {initial?.context || ""}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md whitespace-pre-wrap">
                                {initial?.context || ""}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">
                              Context Domain
                            </div>
                            <div className="mt-1">
                              {initial?.contextDomain ?? "—"}
                            </div>
                          </div>
                        </div>
                      </TooltipProvider>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={55} minSize={20}>
              <div className="p-4 h-full overflow-auto space-y-4">
                {isEdit && id && (
                  <>
                    <ReportTemplateEditor interviewId={id} />
                  </>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </section>
  );
}
