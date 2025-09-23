import React from "react";
import { Bot, Video, Mic, Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DemoCandidatePreview({ remainingSeconds }: { remainingSeconds: number }) {
  const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const ss = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <div className="rounded-md border bg-white dark:bg-card">
      <div className="p-4">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-violet-500 p-3 text-white">
            <Bot className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">AI Interviewer</div>
            <div className="text-xs text-muted-foreground">I’m going to ask a few questions about your previous projects.</div>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" /> <span>{mm}:{ss}</span>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-md border p-3 bg-muted/10">
            <div className="text-sm">Tell me about a time you shipped a feature that had ambiguous requirements.</div>
          </div>

          <div className="rounded-md border p-3 bg-background">
            <div className="text-sm">Candidate (demo): I worked with product to clarify scope, created iterations, and shipped within two sprints.</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Toggle video"><Video className="h-4 w-4"/></Button>
            <Button variant="ghost" size="icon" aria-label="Toggle microphone"><Mic className="h-4 w-4"/></Button>
          </div>
          <div className="flex-1">
            <input aria-label="answer" placeholder="Type your answer here" className="w-full rounded border px-3 py-2" />
          </div>
          <Button size="sm" aria-label="Send"><Send className="h-4 w-4"/></Button>
        </div>
      </div>
    </div>
  );
}
