import { RequestHandler } from "express";
import { prisma } from "../prisma";
import { AuthRequest } from "../middleware/auth";
import { groqChat } from "../services/llm";
import { buildContextSummaryPrompt, buildContextDomainPrompt } from "../prompts/interview";

// Normalize domain labels to canonical set
export function normalizeDomainLabel(label: string | undefined | null) {
  if (!label) return null;
  const s = String(label).toLowerCase().trim();
  if (!s) return null;

  // Reject obvious non-domain phrases (assessment/criteria words)
  const rejectWords = ["assess", "assessment", "assessing", "communication", "evaluate", "evaluation", "skills", "criteria", "test", "interview"];
  for (const w of rejectWords) {
    if (s.includes(w)) return null;
  }

  if (s.includes("front")) return "frontend";
  if (s.includes("react") || s.includes("angular") || s.includes("vue")) return "frontend";
  if (s.includes("back")) return "backend";
  if (s.includes("node") || s.includes("express") || s.includes("java") || s.includes("spring")) return "backend";
  if (s.includes("data") || s.includes("ml") || s.includes("machine")) return "datascience";
  if (s.includes("devops") || s.includes("infra") || s.includes("ops")) return "devops";
  if (s.includes("mobile") || s.includes("android") || s.includes("ios")) return "mobile";
  if (s.includes("security") || s.includes("sec")) return "security";
  if (s.includes("product")) return "product";
  if (s.includes("design") || s.includes("ux")) return "design";
  // fallback: single word from label, but ensure it's not too generic
  const first = s.split(/[^a-z0-9]+/)[0];
  if (first && first.length <= 2) return null;
  return first || s;
}

export const createInterview: RequestHandler = async (req, res) => {
  const {
    title,
    description,
    context,
    interviewerRole,
    durationMinutes,
    interactionMode,
  } = req.body as {
    title: string;
    description?: string;
    context?: string;
    interviewerRole?: string;
    durationMinutes?: number;
    interactionMode?: string;
    maxAttempts?: number | null;
  };
  if (!title) return res.status(400).json({ error: "Title is required" });
  const adminId = (req as AuthRequest).userId!;
  try {
    // Generate a concise skill-level context summary and domain to store with the interview
    let contextSummary: string | null = null;
    let contextDomain: string | null = null;
    try {
      if (context && String(context).trim()) {
        const reply = await groqChat([
          { role: "system", content: "You are a concise summarizer. Return only the summary." },
          { role: "user", content: buildContextSummaryPrompt(context) },
        ]);
        if (reply && String(reply).trim()) contextSummary = String(reply).trim();

        // Also extract domain using LLM; if it fails, fall back to simple heuristic
        try {
          const domainReply = await groqChat([
            { role: "system", content: "You are a domain classifier. Return a single short label." },
            { role: "user", content: buildContextDomainPrompt(context) },
          ]);
          if (domainReply && String(domainReply).trim()) {
            contextDomain = normalizeDomainLabel(String(domainReply).trim());
          }
        } catch (e) {
          console.warn("Domain classifier LLM failed during createInterview:", e?.message || e);
          contextDomain = null;
        }

        // Fallback: simple keyword-based detection from raw context
        if (!contextDomain) {
          try {
            const inferred = normalizeDomainLabel(context);
            if (inferred) contextDomain = inferred;
          } catch (e) {
            // ignore
          }
        }
      }
    } catch (e) {
      contextSummary = null;
    }

    const rawCc = (req.body as any)?.inviteCcEmails ?? (req.body as any)?.inviteCc;
    const ccArr: string[] = Array.isArray(rawCc)
      ? rawCc.map((s: any) => String(s)).filter(Boolean)
      : typeof rawCc === "string"
        ? String(rawCc)
            .split(/[,;\s]+/)
            .map((s) => s.trim())
            .filter((s) => s)
        : [];

    // Parse access window params (optional)
    const startRaw = (req.body as any)?.linkStartAt;
    const endRaw = (req.body as any)?.linkExpiryAt;
    const linkStartAt = startRaw ? new Date(startRaw) : null;
    const linkExpiryAt = endRaw ? new Date(endRaw) : null;
    if (linkStartAt && isNaN(linkStartAt.getTime())) return res.status(400).json({ error: "Invalid linkStartAt" });
    if (linkExpiryAt && isNaN(linkExpiryAt.getTime())) return res.status(400).json({ error: "Invalid linkExpiryAt" });
    if (linkStartAt && linkExpiryAt && linkExpiryAt.getTime() <= linkStartAt.getTime()) {
      return res.status(400).json({ error: "Expiry must be after start" });
    }

    const interview = await prisma.interview.create({
      data: {
        adminId,
        title,
        description: description || "",
        context: context || "",
        contextSummary: contextSummary || null,
        contextDomain: contextDomain || null,
        interviewerRole: interviewerRole || "",
        durationMinutes:
          typeof durationMinutes === "number" ? durationMinutes : null,
        interactionMode:
          String(interactionMode).toUpperCase() === "TEXT_ONLY"
            ? "TEXT_ONLY"
            : "AUDIO",
        // Speech provider: accept 'AZURE' explicitly, otherwise default to BROWSER
        speechProvider: (req.body as any)?.speechProvider === "AZURE" ? "AZURE" : "BROWSER",
        cefrEvaluation: Boolean((req.body as any)?.cefrEvaluation || false),
        recordingEnabled: typeof (req.body as any)?.recordingEnabled === "boolean" ? (req.body as any).recordingEnabled : true,
        maxAttempts:
          typeof (req.body as any)?.maxAttempts === "number"
            ? Math.max(1, Math.floor((req.body as any).maxAttempts))
            : null,
        inviteCcEmails: ccArr,
        linkStartAt: linkStartAt as any,
        linkExpiryAt: linkExpiryAt as any,
      } as any,
    });
    res.status(201).json(interview);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create interview" });
  }
};

export const listInterviews: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  try {
    const interviews = await prisma.interview.findMany({
      where: { adminId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { candidates: true } } },
    });
    res.json(
      interviews.map((i) => ({ ...i, candidatesCount: i._count.candidates })),
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load interviews" });
  }
};

export const getInterview: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id } = req.params as { id: string };
  try {
    const interview = await prisma.interview.findFirst({
      where: { id, adminId },
    });
    if (!interview) return res.status(404).json({ error: "Not found" });
    res.json(interview);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load interview" });
  }
};

export const updateInterview: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id } = req.params as { id: string };
  const {
    title,
    description,
    context,
    interviewerRole,
    durationMinutes,
    interactionMode,
  } = req.body as Partial<{
    title: string;
    description: string;
    context: string;
    interviewerRole: string;
    durationMinutes: number | null;
    interactionMode: string;
    maxAttempts: number | null;
  }>;
  try {
    const existing = await prisma.interview.findFirst({
      where: { id, adminId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    // If context changed, regenerate contextSummary and domain
    let contextSummary: string | null = (existing as any).contextSummary ?? null;
    let contextDomain: string | null = (existing as any).contextDomain ?? null;
    const newContext = context ?? existing.context;
    // Recompute if context or other key fields changed
    const shouldRecompute =
      (typeof context === "string" && context !== existing.context) ||
      (typeof title === "string" && title !== existing.title) ||
      (typeof description === "string" && description !== existing.description) ||
      (typeof interviewerRole === "string" && interviewerRole !== existing.interviewerRole);

    if (shouldRecompute) {
      const combined = `${title ?? existing.title}\n${description ?? existing.description}\n${newContext}`;
      try {
        const reply = await groqChat([
          { role: "system", content: "You are a concise summarizer. Return only the summary." },
          { role: "user", content: buildContextSummaryPrompt(combined) },
        ]);
        if (reply && String(reply).trim()) contextSummary = String(reply).trim();
      } catch (e) {
        // keep existing summary on failure
      }

      try {
        const domainReply = await groqChat([
          { role: "system", content: "You are a domain classifier. Return a single short label." },
          { role: "user", content: buildContextDomainPrompt(combined) },
        ]);
        if (domainReply && String(domainReply).trim()) contextDomain = normalizeDomainLabel(String(domainReply).trim());
      } catch (e) {
        console.warn("Domain classifier LLM failed during updateInterview:", e?.message || e);
        contextDomain = contextDomain || normalizeDomainLabel(combined);
      }

      // Ensure we have at least a heuristic domain
      if (!contextDomain) {
        contextDomain = normalizeDomainLabel(combined);
      }
    }

    // Parse and validate access window updates
    const startRaw = (req.body as any)?.linkStartAt;
    const endRaw = (req.body as any)?.linkExpiryAt;
    const linkStartAt = typeof startRaw !== "undefined" && startRaw !== null && startRaw !== ""
      ? new Date(startRaw)
      : (existing as any).linkStartAt ?? null;
    const linkExpiryAt = typeof endRaw !== "undefined" && endRaw !== null && endRaw !== ""
      ? new Date(endRaw)
      : (existing as any).linkExpiryAt ?? null;
    if (linkStartAt && isNaN(new Date(linkStartAt).getTime())) return res.status(400).json({ error: "Invalid linkStartAt" });
    if (linkExpiryAt && isNaN(new Date(linkExpiryAt).getTime())) return res.status(400).json({ error: "Invalid linkExpiryAt" });
    if (linkStartAt && linkExpiryAt && new Date(linkExpiryAt).getTime() <= new Date(linkStartAt).getTime()) {
      return res.status(400).json({ error: "Expiry must be after start" });
    }

    const updated = await prisma.interview.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        description: description ?? existing.description,
        context: newContext,
        // allow explicit override of contextDomain from request body
        contextSummary: contextSummary,
        contextDomain: (typeof (req.body as any)?.contextDomain === "string" ? (req.body as any).contextDomain : contextDomain),
        interviewerRole: interviewerRole ?? existing.interviewerRole,
        durationMinutes:
          durationMinutes === null
            ? null
            : typeof durationMinutes === "number"
              ? durationMinutes
              : existing.durationMinutes,
        interactionMode: interactionMode
          ? String(interactionMode).toUpperCase() === "TEXT_ONLY"
            ? "TEXT_ONLY"
            : "AUDIO"
          : (existing as any).interactionMode,
        // Speech provider update: if provided in request body, set accordingly, otherwise keep existing
        speechProvider: typeof (req.body as any)?.speechProvider === "string"
          ? (String((req.body as any).speechProvider).toUpperCase() === "AZURE" ? "AZURE" : "BROWSER")
          : (existing as any).speechProvider,
        cefrEvaluation: typeof (req.body as any)?.cefrEvaluation === "boolean" ? (req.body as any).cefrEvaluation : (existing as any).cefrEvaluation,
        recordingEnabled: typeof (req.body as any)?.recordingEnabled === "boolean" ? (req.body as any).recordingEnabled : (existing as any).recordingEnabled,
        maxAttempts:
          typeof (req.body as any)?.maxAttempts === "number"
            ? Math.max(1, Math.floor((req.body as any).maxAttempts))
            : (req.body as any)?.maxAttempts === null
              ? null
              : (existing as any).maxAttempts,
        inviteCcEmails: ((): string[] => {
          const raw = (req.body as any)?.inviteCcEmails ?? (req.body as any)?.inviteCc;
          if (Array.isArray(raw)) return raw.map((s: any) => String(s)).filter(Boolean);
          if (typeof raw === "string") return raw.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s);
          return (existing as any).inviteCcEmails || [];
        })(),
        linkStartAt: linkStartAt as any,
        linkExpiryAt: linkExpiryAt as any,
      } as any,
    });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update interview" });
  }
};

export const deleteInterview: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id } = req.params as { id: string };
  try {
    const existing = await prisma.interview.findFirst({
      where: { id, adminId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    await prisma.interview.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete interview" });
  }
};

// Recompute contextSummary and contextDomain for a single interview (admin)
export const recomputeContextForInterview: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id } = req.params as { id: string };
  try {
    const interview = await prisma.interview.findFirst({ where: { id, adminId } });
    if (!interview) return res.status(404).json({ error: "Not found" });
    const raw = interview.context || "";
    let contextSummary: string | null = null;
    let contextDomain: string | null = null;
    if (raw.trim()) {
      try {
        const reply = await groqChat([
          { role: "system", content: "You are a concise summarizer. Return only the summary." },
          { role: "user", content: buildContextSummaryPrompt(raw) },
        ]);
        if (reply && String(reply).trim()) contextSummary = String(reply).trim();
      } catch (e) {
        contextSummary = null;
      }
      try {
        const domainReply = await groqChat([
          { role: "system", content: "You are a domain classifier. Return a single short label." },
          { role: "user", content: buildContextDomainPrompt(raw) },
        ]);
        if (domainReply && String(domainReply).trim()) {
          contextDomain = normalizeDomainLabel(String(domainReply).trim());
        }
      } catch (e) {
        contextDomain = null;
      }
    }
    const updated = await prisma.interview.update({ where: { id }, data: { contextSummary, contextDomain } as any });
    res.json({ ok: true, interview: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to recompute" });
  }
};

// Backfill contextDomain for all interviews missing it (admin)
export const backfillContextDomain: RequestHandler = async (req, res) => {
  try {
    const interviews = await prisma.interview.findMany({ where: { context: { not: "" }, contextDomain: null } });
    let updated = 0;
    for (const iv of interviews) {
      const raw = iv.context || "";
      try {
        const domainReply = await groqChat([
          { role: "system", content: "You are a domain classifier. Return a single short label." },
          { role: "user", content: buildContextDomainPrompt(raw) },
        ]);
        const domain = domainReply && String(domainReply).trim() ? normalizeDomainLabel(String(domainReply).trim()) : null;
        if (domain) {
          await prisma.interview.update({ where: { id: iv.id }, data: { contextDomain: domain } as any });
          updated++;
        }
      } catch (e) {
        // continue
      }
    }
    res.json({ ok: true, total: interviews.length, updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Backfill failed" });
  }
};
