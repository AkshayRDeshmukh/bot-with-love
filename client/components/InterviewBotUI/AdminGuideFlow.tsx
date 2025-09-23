import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportTemplateEditor } from "@/components/admin/ReportTemplateEditor";
import { CandidatesPanel } from "@/components/admin/CandidatesPanel";
import { DemoReportTemplate, DemoCandidatesPanel } from "./AdminDemoComponents";
import { AdminInterviewForm, InterviewInput } from "@/components/admin/AdminInterviewForm";

export default function AdminGuideFlow({ open = true, onClose }: { open?: boolean; onClose?: () => void }) {
  const [show, setShow] = useState(open);

  return !show ? null : (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-auto">
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Admin Guide — Managing Interviews</CardTitle>
              </div>
              <div>
                <Button variant="ghost" onClick={() => { setShow(false); onClose?.(); }}>
                  Close
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-semibold">1. Create or edit an interview</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Use the form to define the interview. The left column shows the real form from the platform (demo submit). The right column explains each field and why it matters.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="p-2">
                    <div className="mb-2 text-sm text-muted-foreground">Live form (demo):</div>
                    <div className="rounded-md border p-4 bg-background">
                      <AdminInterviewForm
                        initial={{
                          title: "Frontend Engineer - React",
                          description: "Behavioral and technical interview focusing on React, state management, and testing.",
                          context: "You are interviewing a frontend engineer skilled in React and TypeScript.",
                          contextDomain: "frontend",
                          interviewerRole: "Technical Interviewer",
                          durationMinutes: 30,
                          interactionMode: "AUDIO",
                          maxAttempts: 1,
                          cefrEvaluation: false,
                        }}
                        onSubmit={async (v: InterviewInput) => {
                          alert('Demo save: ' + JSON.stringify(v, null, 2));
                        }}
                      />
                    </div>
                  </div>

                  <div className="p-2">
                    <div className="mb-2 text-sm text-muted-foreground">Field explanations:</div>
                    <div className="space-y-3">
                      <div>
                        <div className="font-medium">Title</div>
                        <div className="text-sm text-muted-foreground">Short name for the interview (visible in admin lists). Use a descriptive title like "Frontend Engineer - React" so reviewers can identify the position and focus.</div>
                      </div>
                      <div>
                        <div className="font-medium">Description</div>
                        <div className="text-sm text-muted-foreground">Longer summary shown to admins and in exported materials. Include the interview objective and any special instructions.</div>
                      </div>
                      <div>
                        <div className="font-medium">Context</div>
                        <div className="text-sm text-muted-foreground">Prompt context fed into the interviewer AI. Provide role-specific background and constraints so questions are relevant to the role.</div>
                      </div>
                      <div>
                        <div className="font-medium">Context Domain (optional)</div>
                        <div className="text-sm text-muted-foreground">A short tag (e.g., frontend, backend, data) to help categorize interviews and select domain-specific templates or prompts.</div>
                      </div>
                      <div>
                        <div className="font-medium">Interviewer Role</div>
                        <div className="text-sm text-muted-foreground">Label for the AI persona (e.g., Technical Interviewer, HR). This shapes tone and question style.</div>
                      </div>
                      <div>
                        <div className="font-medium">Duration (minutes)</div>
                        <div className="text-sm text-muted-foreground">Expected interview length; used for pacing and timers. Helps set candidate expectations and manage interview flow.</div>
                      </div>
                      <div>
                        <div className="font-medium">Interaction Type</div>
                        <div className="text-sm text-muted-foreground">Choose Audio (voice/mic enabled) or Text only. AUDIO enables TTS and microphone recording; TEXT_ONLY disables mic and relies on typed responses.</div>
                      </div>
                      <div>
                        <div className="font-medium">Max Attempts</div>
                        <div className="text-sm text-muted-foreground">Default allowed attempts per candidate for this interview. Override per-candidate if needed.</div>
                      </div>
                      <div>
                        <div className="font-medium">CEFR Evaluation</div>
                        <div className="text-sm text-muted-foreground">When enabled, language evaluations report CEFR bands (A1..C2) across parameters. Useful for language-focused roles.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold">2. Report template (look & feel)</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Use the AI Report Template panel to auto-generate evaluation parameters or edit them manually. The component below is the real ReportTemplateEditor used in the admin editor.
                </p>
                <div className="mt-3">
                  <DemoReportTemplate />
                </div>
                <p className="text-xs text-muted-foreground mt-2">Meaning: Parameters define what evaluators see — weight adjusts importance, scale sets scoring type.</p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">3. Add candidates & share links</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  You can add candidates individually or bulk-upload resumes. After adding a candidate, the system generates a secure link you can copy or email to the candidate. The Candidates panel below shows a demo list so you can preview the UI without contacting the server.
                </p>
                <div className="mt-3">
                  <DemoCandidatesPanel />
                </div>
                <p className="text-xs text-muted-foreground mt-2">Meaning: Invite URL contains a short-lived token that authenticates the candidate and opens the candidate portal.</p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">4. View reports</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  After candidates complete attempts, view aggregated reports on the Reports page. You can filter by date, export CSV, and expand individual candidate attempts to see per-parameter scores.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => (window.location.href = '/admin')}>
                    Open Admin Dashboard
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => (window.location.href = '/admin/interviews/guide-demo/reports')}>
                    Open Reports (demo)
                  </Button>
                </div>
              </section>

              <section className="flex justify-end">
                <Button onClick={() => { setShow(false); onClose?.(); }}>Close guide</Button>
              </section>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
