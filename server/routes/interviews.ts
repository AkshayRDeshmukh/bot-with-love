import { RequestHandler } from "express";
import { prisma } from "../prisma";
import { AuthRequest } from "../middleware/auth";

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
    const interview = await prisma.interview.create({
      data: {
        adminId,
        title,
        description: description || "",
        context: context || "",
        interviewerRole: interviewerRole || "",
        durationMinutes:
          typeof durationMinutes === "number" ? durationMinutes : null,
        interactionMode:
          String(interactionMode).toUpperCase() === "TEXT_ONLY"
            ? "TEXT_ONLY"
            : "AUDIO",
        maxAttempts:
          typeof (req.body as any)?.maxAttempts === "number"
            ? Math.max(1, Math.floor((req.body as any).maxAttempts))
            : null,
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
    const updated = await prisma.interview.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        description: description ?? existing.description,
        context: context ?? existing.context,
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
        maxAttempts:
          typeof (req.body as any)?.maxAttempts === "number"
            ? Math.max(1, Math.floor((req.body as any).maxAttempts))
            : (req.body as any)?.maxAttempts === null
              ? null
              : (existing as any).maxAttempts,
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
