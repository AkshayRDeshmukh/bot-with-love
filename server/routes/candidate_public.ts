import type { RequestHandler } from "express";
import multer from "multer";
import { prisma } from "../prisma";
import { getBlobServiceClient, getContainerName } from "../azure";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const getCandidateSession: RequestHandler = async (req, res) => {
  const token = String(req.query.token || "");
  if (!token) return res.status(400).json({ error: "token required" });
  const ic = await prisma.interviewCandidate.findFirst({
    where: { inviteToken: token },
    include: { candidate: true, interview: true },
  });
  if (!ic) return res.status(404).json({ error: "Invalid token" });
  const { interview, candidate } = ic;
  const allowed = Math.max(
    1,
    Number.isFinite((ic as any).maxAttempts as any) &&
      (ic as any).maxAttempts != null
      ? ((ic as any).maxAttempts as any)
      : Number.isFinite((interview as any).maxAttempts as any) &&
          (interview as any).maxAttempts != null
        ? ((interview as any).maxAttempts as any)
        : 1,
  );
  const used = await prisma.interviewTranscript.count({
    where: { interviewId: interview.id, candidateId: candidate.id },
  });
  const exhausted = used >= allowed;
  return res.json({
    interviewId: interview.id,
    candidateId: candidate.id,
    attemptsAllowed: allowed,
    attemptsUsed: used,
    attemptsExhausted: exhausted,
    interview: {
      title: interview.title,
      description: interview.description,
      // Prefer stored concise context summary for candidate flow to reduce prompt size
      context: interview.contextSummary ?? interview.context,
      contextSummary: interview.contextSummary ?? null,
      // Provide contextDomain directly so clients need not call DB again
      contextDomain: interview.contextDomain ?? null,
      interviewerRole: interview.interviewerRole,
      durationMinutes: interview.durationMinutes ?? undefined,
      interactionMode: (interview as any).interactionMode,
    },
    candidate: {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      hasResume: Boolean(candidate.resumeBlobName),
    },
  });
};

export const uploadCandidateResume = [
  upload.single("resume"),
  (async (req, res) => {
    const token = String(req.query.token || "");
    if (!token) return res.status(400).json({ error: "token required" });
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "resume file required" });
    const ic = await prisma.interviewCandidate.findFirst({
      where: { inviteToken: token },
      include: { candidate: true },
    });
    if (!ic) return res.status(404).json({ error: "Invalid token" });

    // Upload resume to Azure Blob Storage (same approach as admin)
    const { getBlobServiceClient, getContainerName } = await import("../azure");
    const blobService = getBlobServiceClient();
    const containerClient = blobService.getContainerClient(getContainerName());
    try {
      await containerClient.getProperties();
    } catch (err: any) {
      if (err?.statusCode === 404) {
        return res.status(500).json({
          error:
            "Container not found. Please create the container specified by AZURE_BLOB_CONTAINER (no public access).",
        });
      }
      if (
        typeof err?.message === "string" &&
        err.message.includes("Public access")
      ) {
        return res.status(500).json({
          error:
            "Storage account forbids public access. Ensure the container exists and keep it private.",
        });
      }
      throw err;
    }

    const blobName = `interviews/${ic.interviewId}/${crypto.randomUUID()}-${file.originalname}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });

    const candidate = await prisma.candidate.update({
      where: { id: ic.candidateId },
      data: {
        resumeBlobName: blobName,
        resumeOriginalName: file.originalname,
        resumeMimeType: file.mimetype,
      },
    });
    return res.json({ ok: true, candidateId: candidate.id });
  }) as RequestHandler,
];

export const saveTranscript: RequestHandler = async (req, res) => {
  const token = String(req.body?.token || "");
  const history = req.body?.history as
    | { role: "user" | "assistant" | "system"; content: string }[]
    | undefined;
  if (!token) return res.status(400).json({ error: "token required" });
  if (!Array.isArray(history))
    return res.status(400).json({ error: "history required" });
  const ic = await prisma.interviewCandidate.findFirst({
    where: { inviteToken: token },
  });
  if (!ic) return res.status(404).json({ error: "Invalid token" });
  // Determine allowed attempts
  const interview = await prisma.interview.findUnique({
    where: { id: ic.interviewId },
  });
  const icRow = await prisma.interviewCandidate.findFirst({
    where: { interviewId: ic.interviewId, candidateId: ic.candidateId },
  });
  const allowed = Math.max(
    1,
    Number.isFinite((icRow as any)?.maxAttempts as any) &&
      (icRow as any)?.maxAttempts != null
      ? ((icRow as any)?.maxAttempts as any)
      : Number.isFinite((interview as any)?.maxAttempts as any) &&
          (interview as any)?.maxAttempts != null
        ? ((interview as any)?.maxAttempts as any)
        : 1,
  );
  // Find latest transcript to decide target attempt correctly
  const latest = await prisma.interviewTranscript.findFirst({
    where: { interviewId: ic.interviewId, candidateId: ic.candidateId },
    orderBy: { attemptNumber: "desc" },
    select: { attemptNumber: true, content: true },
  });

  // Determine target attempt:
  // - If there's no existing transcript, start at 1
  // - If the latest transcript exists but has empty content (e.g., created by proctor photo), reuse its attemptNumber
  // - If the latest transcript has content, by default append to the same attempt (avoid creating a new attempt for every incremental save)
  // - Callers can force a new attempt by providing { forceNewAttempt: true } in the request body
  const forceNew = Boolean((req.body as any)?.forceNewAttempt);
  let targetAttempt: number;
  if (!latest) {
    targetAttempt = 1;
  } else if (Array.isArray((latest as any).content) && (latest as any).content.length === 0) {
    // reuse placeholder attempt created earlier (e.g., photo upload)
    targetAttempt = (latest as any).attemptNumber as number;
  } else {
    // latest has content
    targetAttempt = forceNew ? ((latest as any).attemptNumber as number) + 1 : ((latest as any).attemptNumber as number);
  }

  // Ensure attempts limit not exceeded
  if (targetAttempt > allowed) {
    return res.status(403).json({ error: "Attempts exhausted" });
  }

  const row = await prisma.interviewTranscript.upsert({
    where: {
      interviewId_candidateId_attemptNumber: {
        interviewId: ic.interviewId,
        candidateId: ic.candidateId,
        attemptNumber: targetAttempt,
      },
    },
    update: {
      content: history as any,
    },
    create: {
      interviewId: ic.interviewId,
      candidateId: ic.candidateId,
      attemptNumber: targetAttempt,
      content: history as any,
    },
  });
  res.json({ ok: true, id: row.id, attemptNumber: targetAttempt });
};

export const uploadProctorPhoto = [
  upload.single("photo"),
  (async (req, res) => {
    const token = String((req.query.token as string) || req.body?.token || "");
    if (!token) return res.status(400).json({ error: "token required" });
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "photo file required" });
    const ic = await prisma.interviewCandidate.findFirst({
      where: { inviteToken: token },
    });
    if (!ic) return res.status(404).json({ error: "Invalid token" });

    try {
      const blobService = getBlobServiceClient();
      const containerClient =
        blobService.getContainerClient(getContainerName());
      try {
        await containerClient.getProperties();
      } catch (err: any) {
        if (err?.statusCode === 404) {
          return res.status(500).json({ error: "Container not found" });
        }
        throw err;
      }
      const ext = (file.originalname || "").split(".").pop() || "jpg";
      const blobName = `interviews/${ic.interviewId}/proctor-${crypto.randomUUID()}.${ext}`;
      const block = containerClient.getBlockBlobClient(blobName);
      await block.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype || "image/jpeg" },
      });

      // Decide which attempt this photo belongs to
      const latest = await prisma.interviewTranscript.findFirst({
        where: { interviewId: ic.interviewId, candidateId: ic.candidateId },
        orderBy: { attemptNumber: "desc" },
        select: { attemptNumber: true, content: true },
      });
      const attemptNumber =
        latest &&
        Array.isArray((latest as any).content) &&
        (latest as any).content.length === 0
          ? (latest as any).attemptNumber!
          : (latest?.attemptNumber || 0) + 1;

      await prisma.interviewTranscript.upsert({
        where: {
          interviewId_candidateId_attemptNumber: {
            interviewId: ic.interviewId,
            candidateId: ic.candidateId,
            attemptNumber,
          },
        },
        update: {
          proctorPhotoBlobName: blobName as any,
          proctorPhotoMimeType: (file.mimetype || "image/jpeg") as any,
          proctorPhotoCapturedAt: new Date() as any,
        },
        create: {
          interviewId: ic.interviewId,
          candidateId: ic.candidateId,
          attemptNumber,
          content: [] as any,
          proctorPhotoBlobName: blobName as any,
          proctorPhotoMimeType: (file.mimetype || "image/jpeg") as any,
          proctorPhotoCapturedAt: new Date() as any,
        },
      });

      return res.json({ ok: true, attemptNumber });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "upload failed" });
    }
  }) as RequestHandler,
];

export const updateCandidateStatus: RequestHandler = async (req, res) => {
  const token = String(req.body?.token || "");
  const status = String(req.body?.status || "").toUpperCase();
  if (!token) return res.status(400).json({ error: "token required" });
  if (!["NOT_STARTED", "IN_PROGRESS", "COMPLETED"].includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }
  const ic = await prisma.interviewCandidate.findFirst({
    where: { inviteToken: token },
  });
  if (!ic) return res.status(404).json({ error: "Invalid token" });

  const now = new Date();
  const data: any = { status };
  if (status === "IN_PROGRESS" && !ic.startedAt) data.startedAt = now;
  if (status === "COMPLETED") data.completedAt = now;

  const updated = await prisma.interviewCandidate.update({
    where: {
      interviewId_candidateId: {
        interviewId: ic.interviewId,
        candidateId: ic.candidateId,
      },
    },
    data,
  });
  res.json({
    ok: true,
    status: updated.status,
    startedAt: updated.startedAt,
    completedAt: updated.completedAt,
  });
};
