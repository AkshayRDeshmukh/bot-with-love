import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CandidateBotPreview from "./CandidateBotPreview";

export default function CandidatePortal() {
  const [search] = useSearchParams();
  const token = search.get("token") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<null | {
    interviewId: string;
    candidateId: string;
    attemptsAllowed?: number;
    attemptsUsed?: number;
    attemptsExhausted?: boolean;
    interview: {
      title?: string;
      description?: string;
      context?: string;
      interviewerRole?: string;
      durationMinutes?: number;
      interactionMode?: "AUDIO" | "TEXT_ONLY";
    };
    candidate: {
      id: string;
      name?: string | null;
      email: string;
      hasResume: boolean;
    };
  }>(null);

  // Flow control: welcome -> consent -> interview
  const [stage, setStage] = useState<"welcome" | "consent" | "interview">(
    "welcome",
  );
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/candidate/session?token=${encodeURIComponent(token)}`,
        );
        if (!res.ok) {
          try {
            const data = await res.json();
            setError(data?.error || "Invalid link");
          } catch {
            try {
              const txt = await res.text();
              setError(txt || "Invalid link");
            } catch {
              setError("Invalid link");
            }
          }
          return;
        }
        const data = await res.json();
        setSession(data);
      } catch (e: any) {
        setError(e?.message || "Failed to start session");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const upload = async () => {
    if (!fileRef.current?.files?.[0]) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("resume", fileRef.current.files[0]);
      const res = await fetch(
        `/api/candidate/upload-resume?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          body: fd,
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setSession((prev) =>
        prev
          ? { ...prev, candidate: { ...prev.candidate, hasResume: true } }
          : prev,
      );
    } catch (e) {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-gradient-to-b from-background to-muted/40">
        <div className="container py-10 md:py-16">
          <div className="text-sm text-muted-foreground">Loading…</div>
        </div>
      </section>
    );
  }
  if (error || !session) {
    return (
      <section className="bg-gradient-to-b from-background to-muted/40">
        <div className="container py-10 md:py-16">
          <div className="text-sm text-destructive">
            {error || "Invalid or expired link"}
          </div>
        </div>
      </section>
    );
  }

  // Ensure resume is uploaded first
  if (!session.candidate.hasResume) {
    return (
      <section className="bg-gradient-to-b from-background to-muted/40">
        <div className="container py-10 md:py-16">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Upload Resume to Start
            </h1>
            <p className="mt-2 text-muted-foreground">
              We use your resume to tailor the interview. PDF/DOCX accepted.
            </p>
          </div>
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Upload Resume</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                />
                <Button onClick={upload} disabled={uploading}>
                  {uploading ? "Uploading…" : "Upload & Continue"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  // After resume, show welcome -> consent -> interview
  if (stage !== "interview") {
    const displayName =
      (session.candidate.name || "").trim() ||
      session.candidate.email?.split("@")[0] ||
      "Candidate";

    return (
      <section className="bg-gradient-to-b from-background to-muted/40">
        <div className="container py-10 md:py-16">
          {stage === "welcome" && (
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Welcome, {displayName}!
              </h1>
              <p className="mt-3 text-muted-foreground">
                You're about to start the interview for{" "}
                <span className="font-medium">
                  {session.interview?.title || "this role"}
                </span>
                .
              </p>
              <div className="mt-3 text-sm">
                {typeof session.attemptsAllowed === "number" && (
                  <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs">
                    Attempt{" "}
                    {Math.min(
                      (session.attemptsUsed || 0) + 1,
                      session.attemptsAllowed,
                    )}{" "}
                    of {session.attemptsAllowed}
                  </span>
                )}
              </div>
              {session.attemptsExhausted ? (
                <div className="mt-4 text-sm text-destructive">
                  Attempts exhausted. Please contact the administrator for
                  assistance.
                </div>
              ) : (
                <div className="mt-6 flex justify-center">
                  <Button onClick={() => setStage("consent")}>Continue</Button>
                </div>
              )}
            </div>
          )}

          {stage === "consent" && (
            <div className="mx-auto max-w-2xl">
              <Card>
                <CardHeader>
                  <CardTitle>Consent for Recording & Sharing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    {typeof session.attemptsAllowed === "number" && (
                      <div className="mb-2">
                        <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs">
                          Attempt{" "}
                          {Math.min(
                            (session.attemptsUsed || 0) + 1,
                            session.attemptsAllowed,
                          )}{" "}
                          of {session.attemptsAllowed}
                        </span>
                      </div>
                    )}
                    {session.attemptsExhausted ? (
                      <div className="text-sm text-destructive">
                        Attempts exhausted. Please contact the administrator for
                        assistance.
                      </div>
                    ) : (
                      <>
                        <p>
                          This interview involves video and audio recording of
                          your participation. Your responses and recordings may
                          be shared with the hiring organization for the
                          purposes of evaluation and recruitment.
                        </p>
                        <p>
                          We will also capture a single photo from your live
                          video at the start for proctoring purposes. Please
                          ensure your face is clearly visible and well lit.
                        </p>
                        <p>
                          By continuing, you acknowledge and consent to being
                          recorded and having your interview data shared with
                          the organization conducting this process.
                        </p>
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                          <Button
                            onClick={async () => {
                              try {
                                await fetch("/api/candidate/status", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    token,
                                    status: "IN_PROGRESS",
                                  }),
                                });
                              } catch {}
                              setStage("interview");
                            }}
                          >
                            I Agree, Start Interview
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setDeclined(true);
                            }}
                          >
                            Decline
                          </Button>
                        </div>
                        {declined && (
                          <div className="mt-4 text-sm text-destructive">
                            You need to provide consent to proceed with the
                            interview.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <CandidateBotPreview
      interviewId={session.interviewId}
      interview={session.interview}
      candidateToken={token}
      attemptsInfo={{
        allowed: session.attemptsAllowed,
        used: session.attemptsUsed,
      }}
    />
  );
}
