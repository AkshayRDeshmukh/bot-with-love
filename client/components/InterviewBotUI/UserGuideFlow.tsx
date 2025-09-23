import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot, Video, Mic, Clock, Send, VideoOff, MicOff, MessageSquare } from "lucide-react";
import DemoCandidatePreview from "./DemoCandidatePreview";

export default function UserGuideFlow({ open = true, onClose }: { open?: boolean; onClose?: () => void }) {
  const [show, setShow] = useState(open);
  const [remainingSeconds, setRemainingSeconds] = useState(60);

  useEffect(() => {
    setShow(open);
    if (open) setRemainingSeconds(60);
  }, [open]);

  // countdown for demo guide (1 minute)
  useEffect(() => {
    if (!show) return;
    if (remainingSeconds <= 0) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [show, remainingSeconds]);

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
              <div>
                <h3 className="text-lg font-semibold">Candidate interview preview</h3>
                <p className="text-sm text-muted-foreground mt-2">This is the real interview UI (preview mode). It uses the same components as the live interview; for the guide we run in TEXT_ONLY mode to avoid camera/mic permissions.</p>

                <div className="mt-4 rounded-md border overflow-hidden">
                  <div className="p-4 bg-gradient-to-br from-violet-50 to-indigo-50">
                    <CandidateBotPreview
                      interviewId={"guide-demo"}
                      interview={{ title: "Frontend Engineer - React", description: "Demo interview", interviewerRole: "Technical Interviewer", durationMinutes: 20, interactionMode: "TEXT_ONLY" }}
                    />
                  </div>
                </div>

                {/* Controls placed below the player to fit narrow guides */}
                <div className="mt-4">
                  <h4 className="text-sm font-semibold">Controls & icons</h4>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <div className="rounded bg-background p-2"><Video className="h-4 w-4 text-muted-foreground"/></div>
                      <div>
                        <div className="font-medium">Video</div>
                        <div className="text-xs">Toggle your camera on/off. If disabled, interviewer records audio or text only.</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="rounded bg-background p-2"><Mic className="h-4 w-4 text-muted-foreground"/></div>
                      <div>
                        <div className="font-medium">Microphone</div>
                        <div className="text-xs">Mute/unmute your microphone during audio interviews.</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="rounded bg-background p-2"><Send className="h-4 w-4 text-muted-foreground"/></div>
                      <div>
                        <div className="font-medium">Send / Submit</div>
                        <div className="text-xs">Submit typed responses to the chat or send recorded audio segments when requested.</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="rounded bg-background p-2"><Clock className="h-4 w-4 text-muted-foreground"/></div>
                      <div>
                        <div className="font-medium">Timer</div>
                        <div className="text-xs">Shows elapsed interview time; helps you pace your answers.</div>
                      </div>
                    </div>

                    <div className="col-span-2">
                      <div className="font-medium">Proctoring & privacy</div>
                      <div className="text-xs text-muted-foreground">The system may capture a single photo at the start and run periodic checks to ensure session integrity. You will be notified if any proctoring flags occur.</div>
                    </div>
                  </div>
                </div>
              </div>

              <section>
                <h3 className="text-lg font-semibold">Step-by-step candidate flow</h3>
                <ol className="list-decimal ml-6 mt-2 text-sm text-muted-foreground space-y-2">
                  <li>Receive invitation email and click the secure link (tokenized) to open the candidate portal.</li>
                  <li>Upload your resume if requested and review the consent screen. Agree to recording & data sharing to proceed.</li>
                  <li>The interview UI opens. Allow camera/mic if prompted (unless this is a text-only interview).</li>
                  <li>Answer questions either by speaking (audio) or typing (text-only). Use the Send button to submit typed answers.</li>
                  <li>When complete, the system saves your attempt and notifies the organization; reports are generated for reviewers.</li>
                </ol>
              </section>

              <section>
                <h3 className="text-lg font-semibold">Buttons & what they do</h3>
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium">Camera / Video</div>
                    <div className="text-muted-foreground">Toggle self-view camera. If off, your video will not be recorded.</div>
                  </div>
                  <div>
                    <div className="font-medium">Microphone</div>
                    <div className="text-muted-foreground">Mute/unmute your microphone. On text-only interviews this is disabled.</div>
                  </div>
                  <div>
                    <div className="font-medium">Send</div>
                    <div className="text-muted-foreground">Submit typed responses or finalize an audio response chunk.</div>
                  </div>
                  <div>
                    <div className="font-medium">Timer</div>
                    <div className="text-muted-foreground">Displays elapsed time and helps with pacing answers.</div>
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
