import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  Copy,
  BarChart3,
  Pencil,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
} from "lucide-react";

export type CandidateRowLite = {
  id: string;
  name?: string | null;
  email: string;
  status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  startedAt?: string | null;
  completedAt?: string | null;
  totalExperienceMonths?: number;
  domain?: string | null;
  skills?: string[] | null;
  attemptsCount?: number;
  latestAttemptNumber?: number | null;
  inviteUrl?: string | null;
};

function fmt(dt?: string | null) {
  if (!dt) return "-";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  if (user.length <= 2) return `${user[0] || "*"}***@${domain}`;
  const first = user[0];
  const last = user[user.length - 1];
  return `${first}${"*".repeat(Math.max(1, user.length - 2))}${last}@${domain}`;
}

export default function CandidatesTable({
  candidates,
  onOpenReport,
  onOpenResume,
  onCopyInvite,
  onEdit,
}: {
  candidates: CandidateRowLite[];
  onOpenReport?: (c: CandidateRowLite) => void;
  onOpenResume?: (c: CandidateRowLite) => void;
  onCopyInvite?: (c: CandidateRowLite) => void;
  onEdit?: (c: CandidateRowLite) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedSkills, setExpandedSkills] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
  const toggleSkills = (id: string) =>
    setExpandedSkills((s) => ({ ...s, [id]: !s[id] }));

  const statusBadge = (r: CandidateRowLite) => {
    const s = r.status || "NOT_STARTED";
    const colorClass =
      s === "COMPLETED"
        ? "bg-green-100 text-green-800"
        : s === "IN_PROGRESS"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-800";
    const label = typeof r.latestAttemptNumber === "number"
      ? `${s === "COMPLETED" ? "Completed" : s === "IN_PROGRESS" ? "In Progress" : "Status"} ${r.latestAttemptNumber ? `(Attempt ${r.latestAttemptNumber})` : ""}`
      : s === "COMPLETED"
      ? "Completed"
      : s === "IN_PROGRESS"
      ? "In Progress"
      : "Not Started";

    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-muted">
          <tr>
            <th className="text-left px-4 py-2 text-sm font-medium">&nbsp;</th>
            <th className="text-left px-4 py-2 text-sm font-medium">Candidate</th>
            <th className="text-left px-4 py-2 text-sm font-medium">Email</th>
            <th className="text-left px-4 py-2 text-sm font-medium">Status</th>
            <th className="text-right px-4 py-2 text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-card divide-y">
          {candidates.map((r, idx) => {
            const isOpen = !!expanded[r.id];
            const skills = Array.isArray(r.skills) ? r.skills : [];
            const showMore = skills.length > 6 && !expandedSkills[r.id];
            return (
              <React.Fragment key={r.id}>
                <tr className={`hover:bg-muted/40 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                  <td className="px-4 py-3 align-top">
                    <button
                      aria-label={isOpen ? "Collapse" : "Expand"}
                      onClick={() => toggle(r.id)}
                      className="p-1 rounded hover:bg-muted/60"
                    >
                      {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-sm">{r.name || "(No name)"}</div>
                    <div className="text-xs text-muted-foreground">{r.domain || "-"}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-sm text-muted-foreground">{maskEmail(r.email)}</td>
                  <td className="px-4 py-3 align-top">{statusBadge(r)}</td>
                  <td className="px-4 py-3 align-top text-right">
                    <div className="hidden sm:flex items-center justify-end gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => onOpenResume?.(r)}>
                            <FileText className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Resume</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => onCopyInvite?.(r)}>
                            <LinkIcon className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Copy invite link</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => onOpenReport?.(r)}>
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Reports</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => onEdit?.(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Edit</TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Mobile: grouped menu */}
                    <div className="sm:hidden inline-block">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => onOpenResume?.(r)}>Resume</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => onCopyInvite?.(r)}>Copy link</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => onOpenReport?.(r)}>Reports</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => onEdit?.(r)}>Edit</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>

                {isOpen && (
                  <tr className="bg-white">
                    <td colSpan={5} className="px-4 py-4">
                      <div className="rounded-lg shadow-sm p-4 bg-card">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <div className="text-xs text-muted-foreground">Experience</div>
                            <div className="font-medium">{typeof r.totalExperienceMonths === 'number' ? `${(r.totalExperienceMonths/12).toFixed(1)} yrs` : '-'}</div>

                            <div className="mt-3 text-xs text-muted-foreground">Domain</div>
                            <div className="font-medium">{r.domain || '-'}</div>
                          </div>

                          <div>
                            <div className="text-xs text-muted-foreground">Skills</div>
                            <div className="mt-2 flex gap-2 overflow-x-auto max-w-full py-1">
                              {skills.slice(0, expandedSkills[r.id] ? skills.length : 6).map((sk, i) => (
                                <div key={i} className="whitespace-nowrap rounded-full border px-3 py-1 text-xs bg-background">
                                  {sk}
                                </div>
                              ))}
                              {showMore && (
                                <button
                                  onClick={() => toggleSkills(r.id)}
                                  className="whitespace-nowrap rounded-full border px-3 py-1 text-xs bg-background"
                                >
                                  +{skills.length - 6} more
                                </button>
                              )}
                              {expandedSkills[r.id] && skills.length > 6 && (
                                <button
                                  onClick={() => toggleSkills(r.id)}
                                  className="whitespace-nowrap rounded-full border px-3 py-1 text-xs bg-background"
                                >
                                  show less
                                </button>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-muted-foreground">Attempt</div>
                            <div className="font-medium">{r.latestAttemptNumber ? `Attempt ${r.latestAttemptNumber}` : '-'}</div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-xs text-muted-foreground">Started</div>
                                <div className="text-sm">{r.startedAt ? fmt(r.startedAt) : '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Ended</div>
                                <div className="text-sm">{r.completedAt ? fmt(r.completedAt) : '-'}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
