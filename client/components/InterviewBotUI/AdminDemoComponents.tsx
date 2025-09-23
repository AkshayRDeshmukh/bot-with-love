import React from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Copy, FileText, BarChart3, ChevronDown, ChevronUp, Pencil, Link as LinkIcon, Send, MoreHorizontal } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export function DemoReportTemplate() {
  const sample = {
    parameters: [
      { id: "p1", name: "Communication", description: "Clarity and structure of answers", weight: 40, scale: { type: "1-5", min: 1, max: 5 } },
      { id: "p2", name: "Problem Solving", description: "Approach and correctness", weight: 40, scale: { type: "1-5", min: 1, max: 5 } },
      { id: "p3", name: "Culture Fit", description: "Alignment with company values", weight: 20, scale: { type: "1-5", min: 1, max: 5 } },
    ],
    includeOverall: true,
    includeSkillLevels: true,
  };

  const sumWeights = sample.parameters.reduce((a, p) => a + p.weight, 0);

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>AI Report Template (Demo)</CardTitle>
          <CardDescription>Auto-generate and edit evaluation parameters</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => alert("Generate with AI (demo)")}>Generate with AI</Button>
          <Button onClick={() => alert("Save (demo)")}>Save</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary"/> Overall</span>
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-secondary"/> Skill Levels</span>
            </div>
            <div className={`text-xs ${sumWeights !== 100 ? "text-amber-600" : "text-muted-foreground"}`}>
              Total weight: {sumWeights}% {sumWeights !== 100 && "(should be 100%)"}
            </div>
          </div>

          <div className="grid gap-2">
            {sample.parameters.map((p, idx) => (
              <div key={p.id} className={`grid grid-cols-12 items-start rounded-lg border p-3 sm:p-3 ${idx % 2 === 0 ? "bg-muted/50" : "bg-background"}`}>
                <div className="col-span-12 sm:col-span-8">
                  <div className="font-medium leading-tight">{p.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{p.description}</div>
                </div>
                <div className="col-span-12 sm:col-span-4 sm:text-right mt-2 sm:mt-0">
                  <div className="flex sm:justify-end gap-2 flex-wrap">
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-primary/10 text-primary border-primary/20">Weight: {p.weight}%</span>
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-secondary/10 text-foreground border-secondary/20">Scale: {p.scale.type} ({p.scale.min}–{p.scale.max})</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <Button variant="secondary" onClick={() => alert("Add Parameter (demo)")}>Add Parameter</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DemoCandidatesPanel() {
  const candidates = [
    { id: "c1", name: "Alice Johnson", email: "alice@example.com", status: "NOT_STARTED", inviteUrl: "https://example.com/invite/abc123" },
    { id: "c2", name: "Bob Smith", email: "bob@example.com", status: "IN_PROGRESS", inviteUrl: "https://example.com/invite/def456" },
    { id: "c3", name: "Carla Gomez", email: "carla@example.com", status: "COMPLETED", inviteUrl: "https://example.com/invite/ghi789" },
  ];

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <CardTitle>Candidates (Demo)</CardTitle>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => alert("Add candidate (demo)")}>
            <Pencil className="h-4 w-4 mr-2" /> Add Candidate
          </Button>
          <Button size="sm" variant="outline" onClick={() => alert("Bulk upload (demo)")}>Bulk upload</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Add candidates individually or upload resumes in bulk. Use the actions to invite or view reports.</div>

          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Candidate</th>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.email}</td>
                    <td className="px-3 py-2">{c.status}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => alert(`Resume: ${c.email} (demo)`)}>
                              <FileText className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Resume</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => alert(`Send invite to ${c.email} (demo)`)}>
                              <Send className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Send / Resend invite</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => alert(`Copy link: ${c.inviteUrl}`)}>
                              <LinkIcon className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Copy invite link</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => alert("Reports (demo)")}>
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Reports</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => alert("Edit candidate (demo)")}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Edit</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
