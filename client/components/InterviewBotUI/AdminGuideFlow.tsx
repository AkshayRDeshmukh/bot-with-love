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
                  Go to the Admin &gt; New Interview page to create an interview. Fill in title, description, interviewer role and context. These values are used to craft interview prompts and enable the live preview.
                </p>
                <div className="mt-3">
                  <Button size="sm" onClick={() => (window.location.href = '/admin/interviews/new')}>Create new interview</Button>
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
