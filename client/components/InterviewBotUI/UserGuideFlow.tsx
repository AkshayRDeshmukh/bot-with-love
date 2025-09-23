import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot, Video, Mic, Clock, Send } from "lucide-react";

export default function UserGuideFlow({ open = true, onClose }: { open?: boolean; onClose?: () => void }) {
  const [show, setShow] = useState(open);

  useEffect(() => {
    setShow(open);
  }, [open]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-auto"> 
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-violet-600 p-2 text-white">
                  <Bot className="h-5 w-5" />
                </div>
                <CardTitle>User Guide — Candidate Interview Flow</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => { setShow(false); onClose?.(); }}>
                  Close
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-semibold">1. Receiving the invitation</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  You will receive an email from the hiring organization with a secure link to start your interview. Open the email and click the "Start Interview" link. The link will open in your browser and automatically log you in using a secure token.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="rounded border p-3">
                    <div className="text-sm font-medium">From: recruiter@company.com</div>
                    <div className="text-sm text-muted-foreground">Subject: Interview Invitation</div>
                    <div className="mt-2">
                      <Button size="sm" onClick={() => window.alert('This demo navigates to the candidate preview page.')}>Open invitation link</Button>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold">2. Login & Resume upload</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  The secure link typically logs you in automatically. If prompted, confirm your identity or upload your resume (PDF/DOCX). The resume helps the interviewer tailor questions to your experience.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => window.alert('If not already uploaded, you can upload a resume on the real candidate portal.')}>Upload resume (demo)</Button>
                  <Button variant="secondary" onClick={() => window.location.href = '/candidate/preview'}>Open candidate preview</Button>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold">3. Consent & privacy</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Before starting, you will be asked to consent to video and audio recording. Read the notice carefully — recordings and a single photo (for proctoring) may be shared with the hiring organization.
                </p>
                <div className="mt-3">
                  <div className="rounded border p-4">
                    <div className="mb-2 text-sm">This interview involves video and audio recording for evaluation purposes. By continuing you consent to being recorded.</div>
                    <div className="flex gap-2">
                      <Button onClick={() => window.alert('Consent accepted (demo)')}>I Agree, Start Interview</Button>
                      <Button variant="secondary" onClick={() => window.alert('You declined (demo)')}>Decline</Button>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold">4. Camera & microphone permissions</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Your browser will ask permission to access your camera and microphone. Allow access so the interview can record your responses. If camera access is blocked, refresh the page and grant permissions from the browser's URL bar.
                </p>

                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded border p-4">
                    <div className="mb-2 font-medium">Camera preview</div>
                    <div className="bg-black/5 h-36 w-full flex items-center justify-center rounded"> 
                      <video className="h-full w-full object-cover rounded" playsInline muted autoPlay />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button size="sm" onClick={() => window.alert('Toggle camera (demo)')}><Video className="mr-2 h-4 w-4"/>Video</Button>
                      <Button size="sm" onClick={() => window.alert('Toggle microphone (demo)')}><Mic className="mr-2 h-4 w-4"/>Mic</Button>
                    </div>
                  </div>

                  <div className="rounded border p-4">
                    <div className="mb-2 font-medium">Proctoring & privacy</div>
                    <div className="text-sm text-muted-foreground">We may capture a single photo at the start for proctoring and run occasional face checks to ensure session integrity.</div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => window.alert('Proctoring info (demo)')}>Learn more</Button>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold">5. During the interview</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  The interview will present an animated interviewer, a chat transcript, and controls for camera/mic. Some interviews include spoken questions (TTS) — you can answer verbally or type responses depending on the setup.
                </p>

                <div className="mt-3 rounded border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-violet-500 p-2 text-white"><Bot className="h-4 w-4"/></div>
                      <div>
                        <div className="text-sm font-medium">AI Interviewer</div>
                        <div className="text-xs text-muted-foreground">Ask behavior-based questions and follow-ups.</div>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4"/> <span>00:02:34</span></div>
                  </div>

                  <div className="mt-4 rounded border bg-background p-3">
                    <div className="text-sm text-muted-foreground">Candidate answer preview (typed)</div>
                    <div className="mt-2 flex items-center gap-2">
                      <input aria-label="answer" placeholder="Type your answer here" className="flex-1 rounded border px-3 py-2" />
                      <Button size="sm"><Send className="h-4 w-4"/></Button>
                    </div>
                  </div>
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
