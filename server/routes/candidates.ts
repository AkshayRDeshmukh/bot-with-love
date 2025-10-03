import { RequestHandler } from "express";
import multer from "multer";
import { promises as fs } from "fs";
import { createRequire } from "module";
import { prisma } from "../prisma";
import { AuthRequest } from "../middleware/auth";
import { getBlobServiceClient, getContainerName } from "../azure";
import sgMail from "@sendgrid/mail";
import { groqChat } from "../services/llm";
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const SENDGRID_FROM = process.env.SENDGRID_FROM || "";
if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

async function normalizeToBuffer(file: Express.Multer.File | undefined): Promise<Buffer | null> {
  if (!file) return null;
  const anyFile: any = file as any;
  if (file.buffer && Buffer.isBuffer(file.buffer)) return file.buffer as Buffer;
  if (anyFile.path && typeof anyFile.path === "string") {
    try { return await fs.readFile(anyFile.path); } catch {}
  }
  if (anyFile.stream && typeof anyFile.stream.pipe === "function") {
    const stream: NodeJS.ReadableStream = anyFile.stream;
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    return Buffer.concat(chunks);
  }
  return null;
}

async function extractResumeText(originalname: string, mimetype: string, buffer: Buffer): Promise<string> {
  const require = createRequire(import.meta.url);
  const ext = originalname.toLowerCase();
  if (mimetype.includes("pdf") || ext.endsWith(".pdf")) {
    const pdfParse = require("pdf-parse");
    const parsed = await pdfParse(Buffer.from(buffer));
    return String(parsed?.text || "");
  }
  if (
    mimetype.includes("word") ||
    mimetype.includes("officedocument") ||
    ext.endsWith(".docx") ||
    ext.endsWith(".doc")
  ) {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return String(result?.value || "");
  }
  if (mimetype.startsWith("text/") || ext.endsWith(".txt")) {
    return Buffer.from(buffer).toString("utf8");
  }
  return "";
}

async function extractProfileFromText(text: string): Promise<any | null> {
  if (!text || text.trim().length === 0) return null;
  const prompt = [
    { role: "system", content: "You extract structured candidate profile from resumes. Return ONLY valid JSON with keys: name, email, total_experience_months (integer), summary (string), domain (string), skills (array of strings). Be accurate." },
    { role: "user", content: `Resume text:\n\n${text}\n\nReturn JSON now.` },
  ] as any;
  const reply = await groqChat(prompt);
  const jsonMatch = reply.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : reply;
  try { return JSON.parse(jsonStr); } catch { return null; }
}

async function uploadResumeToBlob(interviewId: string, originalname: string, mimetype: string, buffer: Buffer) {
  try {
    const blobService = getBlobServiceClient();
    const containerClient = blobService.getContainerClient(getContainerName());
    try {
      await containerClient.getProperties();
    } catch (err: any) {
      if (err?.statusCode === 404) throw new Error("skip-upload");
      if (typeof err?.message === "string" && err.message.includes("Public access")) throw new Error("skip-upload");
      throw err;
    }
    const blobName = `interviews/${interviewId}/${crypto.randomUUID()}-${originalname}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(buffer, { blobHTTPHeaders: { blobContentType: mimetype } });
    return { blobName, originalName: originalname, mimeType: mimetype } as const;
  } catch (e: any) {
    console.warn("Resume upload skipped:", e?.message || e);
    return { blobName: undefined, originalName: undefined, mimeType: undefined } as const;
  }
}

function summarizeProfile(p: { name?: string | null; email?: string | null; totalExperienceMonths?: number | null; summary?: string | null; domain?: string | null; skills?: string[] | null; }): string {
  const years = typeof p.totalExperienceMonths === 'number' ? (p.totalExperienceMonths/12).toFixed(1) : 'unknown';
  const parts = [
    `name: ${p.name || ''}`,
    `email: ${p.email || ''}`,
    `experience_years: ${years}`,
    `domain: ${p.domain || ''}`,
    `skills: ${(Array.isArray(p.skills)? p.skills: []).join(', ')}`,
    `summary: ${(p.summary || '').slice(0, 400)}`,
  ];
  return parts.join('\n');
}

async function findPotentialCandidates(extracted: any, limit = 30, interviewId?: string) {
  const email = (extracted?.email || '').toLowerCase();
  const domain = email.includes('@') ? email.split('@')[1] : null;
  const months = Number(extracted?.total_experience_months);
  const minMonths = Number.isFinite(months) ? Math.max(0, Math.floor(months - 36)) : undefined;
  const maxMonths = Number.isFinite(months) ? Math.floor(months + 36) : undefined;
  const skills: string[] = Array.isArray(extracted?.skills) ? extracted.skills.map((s: any) => String(s)) : [];

  const orFilters = [
    domain ? { email: { endsWith: `@${domain}`, mode: 'insensitive' } } : undefined,
    typeof minMonths === 'number' && typeof maxMonths === 'number' ? { totalExperienceMonths: { gte: minMonths, lte: maxMonths } } : undefined,
    skills.length ? { skills: { hasSome: skills } } : undefined,
    extracted?.domain ? { domain: { equals: String(extracted.domain), mode: 'insensitive' } } : undefined,
  ].filter(Boolean) as any[];

  // If interviewId is provided, scope candidates to that interview only
  if (interviewId) {
    let whereClause: any = {};
    if (orFilters.length) {
      whereClause.AND = [
        { interviewCandidates: { some: { interviewId } } },
        { OR: orFilters },
      ];
    } else {
      whereClause = { interviewCandidates: { some: { interviewId } } } as any;
    }

    const filtered = await prisma.candidate.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, name: true, email: true, totalExperienceMonths: true, summary: true, domain: true, skills: true },
    });
    if (filtered.length > 0) return filtered.slice(0, limit);

    const recent = await prisma.candidate.findMany({
      where: { interviewCandidates: { some: { interviewId } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, name: true, email: true, totalExperienceMonths: true, summary: true, domain: true, skills: true },
    });
    return recent;
  }

  // Fallback to system-wide search (existing behaviour)
  const filtered = await prisma.candidate.findMany({
    where: {
      OR: orFilters as any,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, name: true, email: true, totalExperienceMonths: true, summary: true, domain: true, skills: true },
  });
  if (filtered.length > 0) return filtered.slice(0, limit);

  const recent = await prisma.candidate.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, name: true, email: true, totalExperienceMonths: true, summary: true, domain: true, skills: true },
  });
  return recent;
}

async function llmDecideDuplicate(newProfile: any, candidates: { id: string; name: string | null; email: string; totalExperienceMonths: number | null; summary: string | null; domain: string | null; skills: string[]; }[]): Promise<{ duplicate: boolean; id?: string; name?: string; reason?: string } | null> {
  try {
    const items = candidates.map((c, i) => ({
      idx: i + 1,
      id: c.id,
      summary: summarizeProfile(c),
    }));
    const listText = items.map(it => `#${it.idx}\n${it.summary}`).join('\n\n');
    const newText = summarizeProfile({
      name: newProfile?.name,
      email: newProfile?.email,
      totalExperienceMonths: Number(newProfile?.total_experience_months) || null,
      summary: newProfile?.summary || null,
      domain: newProfile?.domain || null,
      skills: Array.isArray(newProfile?.skills) ? newProfile.skills : [],
    });
    const prompt = [
      { role: 'system', content: 'You are a strict deduplication engine for resumes. Decide if the NEW profile refers to the SAME PERSON as one of the EXISTING profiles even if name/email/phone differ. Rely on experience duration, domain, skill mix, and summary details. Return ONLY JSON: {"duplicate": boolean, "match_index"?: number, "confidence": 0..1, "reason"?: string} and set duplicate true only if confidence >= 0.85.' },
      { role: 'user', content: `NEW PROFILE\n${newText}\n\nEXISTING PROFILES\n${listText}` },
    ] as any;
    const reply = await groqChat(prompt);
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : reply;
    const data = JSON.parse(jsonStr);
    if (data && data.duplicate && typeof data.match_index === 'number') {
      const idx = Math.max(1, Math.min(items.length, data.match_index)) - 1;
      const chosenFull = candidates[idx];
      return { duplicate: true, id: chosenFull.id, name: chosenFull.name || chosenFull.email, reason: String(data.reason || '') };
    }
    return { duplicate: false };
  } catch (e) {
    return null;
  }
}

export const listCandidates: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id } = req.params as { id: string };
  const interview = await prisma.interview.findFirst({
    where: { id, adminId },
  });
  if (!interview) return res.status(404).json({ error: "Interview not found" });
  const rows = await prisma.interviewCandidate.findMany({
    where: { interviewId: id },
    include: { candidate: true },
    orderBy: { createdAt: "desc" },
  });

  const out: any[] = [];
  for (const r of rows) {
    const transcripts = await prisma.interviewTranscript.findMany({
      where: { interviewId: id, candidateId: r.candidateId },
      select: { attemptNumber: true },
      orderBy: [{ attemptNumber: "desc" }],
    });
    const attemptNumbers = Array.from(new Set(transcripts.map((t) => Number(t.attemptNumber)))).filter(Boolean);
    const attemptsCount = attemptNumbers.length;
    const latestAttemptNumber = attemptNumbers.length > 0 ? Math.max(...attemptNumbers) : null;

    out.push({
      id: r.candidateId,
      name: r.candidate.name,
      email: r.candidate.email,
      status: r.status,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      invitedAt: r.inviteSentAt,
      inviteCount: r.inviteCount,
      inviteUrl: r.inviteUrl,
      totalExperienceMonths:
        (r.candidate as any).totalExperienceMonths ?? undefined,
      summary: (r.candidate as any).summary ?? undefined,
      domain: (r.candidate as any).domain ?? undefined,
      skills: (r.candidate as any).skills ?? undefined,
      attemptsCount,
      latestAttemptNumber,
      hasPreviousAttempts: attemptsCount > 1,
    });
  }

  res.json(out);
};

export const createCandidate = [
  upload.single("resume"),
  (async (req, res) => {
    const adminId = (req as AuthRequest).userId!;
    const { id } = req.params as { id: string };
    const interview = await prisma.interview.findFirst({
      where: { id, adminId },
    });
    if (!interview)
      return res.status(404).json({ error: "Interview not found" });

    const name = (req.body.name as string) || null;
    const email = req.body.email as string;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const file = (req as any).file as Express.Multer.File | undefined;

    // Normalize uploaded file into a Buffer regardless of storage engine
    const fileBuffer: Buffer | null = await (async () => {
      if (!file) return null;
      if (file.buffer && Buffer.isBuffer(file.buffer))
        return file.buffer as Buffer;
      const anyFile: any = file as any;
      if (anyFile.path && typeof anyFile.path === "string") {
        try {
          return await fs.readFile(anyFile.path);
        } catch {}
      }
      if (anyFile.stream && typeof anyFile.stream.pipe === "function") {
        const stream: NodeJS.ReadableStream = anyFile.stream;
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => resolve());
          stream.on("error", reject);
        });
        return Buffer.concat(chunks);
      }
      return null;
    })();

    let blobName: string | undefined;
    let originalName: string | undefined;
    let mimeType: string | undefined;

    if (file && fileBuffer) {
      try {
        const blobService = getBlobServiceClient();
        const containerClient =
          blobService.getContainerClient(getContainerName());

        try {
          await containerClient.getProperties();
        } catch (err: any) {
          if (err?.statusCode === 404) {
            console.error("Azure container not found");
            throw new Error("skip-upload");
          }
          if (
            typeof err?.message === "string" &&
            err.message.includes("Public access")
          ) {
            console.error("Azure storage forbids public access");
            throw new Error("skip-upload");
          }
          throw err;
        }

        blobName = `interviews/${id}/${crypto.randomUUID()}-${file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.uploadData(fileBuffer, {
          blobHTTPHeaders: { blobContentType: file.mimetype },
        });
        originalName = file.originalname;
        mimeType = file.mimetype;
      } catch (e: any) {
        console.warn("Resume upload skipped:", e?.message || e);
        blobName = undefined;
        originalName = undefined;
        mimeType = undefined;
      }
    }

    // Extract profile from resume via LLM
    let extracted: any = null;
    try {
      let text = "";
      if (file && fileBuffer && fileBuffer.length > 0) {
        const ext = (file.originalname || "").toLowerCase();
        if (file.mimetype.includes("pdf") || ext.endsWith(".pdf")) {
          const require = createRequire(import.meta.url);
          const pdfParse = require("pdf-parse");
          const parsed = await pdfParse(Buffer.from(fileBuffer));
          text = String(parsed?.text || "");
        } else if (
          file.mimetype.includes("word") ||
          file.mimetype.includes("officedocument") ||
          ext.endsWith(".docx") ||
          ext.endsWith(".doc")
        ) {
          const require = createRequire(import.meta.url);
          const mammoth = require("mammoth");
          const result = await mammoth.extractRawText({
            buffer: Buffer.from(fileBuffer),
          });
          text = String(result?.value || "");
        } else if (file.mimetype.startsWith("text/") || ext.endsWith(".txt")) {
          text = Buffer.from(fileBuffer).toString("utf8");
        }
      }
      if (text && text.trim().length > 0) {
        const prompt = [
          {
            role: "system",
            content:
              "You extract structured candidate profile from resumes. Return ONLY valid JSON with keys: name, email, total_experience_months (integer), summary (string), domain (string), skills (array of strings). Be accurate.",
          },
          {
            role: "user",
            content: `Resume text:\n\n${text}\n\nReturn JSON now.`,
          },
        ] as any;
        const reply = await groqChat(prompt);
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : reply;
        extracted = JSON.parse(jsonStr);
      }
    } catch (e) {
      console.warn("Resume extraction failed", e);
    }

    // Duplicate detection (LLM + heuristics) scoped to this interview
    try {
      const incomingEmail = (email || extracted?.email || '').trim().toLowerCase();
      let byEmail: any = null;
      if (incomingEmail) {
        byEmail = await prisma.candidate.findUnique({ where: { email: incomingEmail } as any });
        if (byEmail) {
          const existsForInterview = await prisma.interviewCandidate.findUnique({
            where: { interviewId_candidateId: { interviewId: id, candidateId: byEmail.id } },
          });
          if (existsForInterview) {
            return res.status(409).send(`Looks like this profile already exists for this interview: ${byEmail.name || byEmail.email}`);
          }
        }
      }

      const potentials = await findPotentialCandidates(extracted, 30, id);
      if (potentials.length) {
        const decision = await llmDecideDuplicate(extracted, potentials as any);
        if (decision && decision.duplicate) {
          return res.status(409).send(`Looks like this profile already exists: ${decision.name}`);
        }
      }
    } catch (e) {
      // Swallow dedupe errors to avoid blocking
    }

    const skillsArray: string[] | undefined = Array.isArray(extracted?.skills)
      ? extracted.skills.map((s: any) => String(s)).filter(Boolean)
      : undefined;
    const totalMonths = Number(extracted?.total_experience_months);

    const candidate = await prisma.candidate.upsert({
      where: { email },
      create: {
        email,
        name: name || (extracted?.name ? String(extracted.name) : undefined),
        ...(blobName
          ? {
              resumeBlobName: blobName,
              resumeOriginalName: originalName,
              resumeMimeType: mimeType,
            }
          : {}),
        totalExperienceMonths: Number.isFinite(totalMonths)
          ? Math.max(0, Math.floor(totalMonths))
          : undefined,
        summary: extracted?.summary
          ? String(extracted.summary).slice(0, 5000)
          : undefined,
        domain: extracted?.domain
          ? String(extracted.domain).slice(0, 255)
          : undefined,
        skills: skillsArray,
      } as any,
      update: {
        name: name || (extracted?.name ? String(extracted.name) : undefined),
        ...(blobName
          ? {
              resumeBlobName: blobName,
              resumeOriginalName: originalName,
              resumeMimeType: mimeType,
            }
          : {}),
        totalExperienceMonths: Number.isFinite(totalMonths)
          ? Math.max(0, Math.floor(totalMonths))
          : undefined,
        summary: extracted?.summary
          ? String(extracted.summary).slice(0, 5000)
          : undefined,
        domain: extracted?.domain
          ? String(extracted.domain).slice(0, 255)
          : undefined,
        skills: skillsArray,
      } as any,
    });
    await prisma.interviewCandidate.upsert({
      where: {
        interviewId_candidateId: { interviewId: id, candidateId: candidate.id },
      },
      create: { interviewId: id, candidateId: candidate.id },
      update: {},
    });

    res.status(201).json({
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      totalExperienceMonths: (candidate as any).totalExperienceMonths,
      summary: (candidate as any).summary,
      domain: (candidate as any).domain,
      skills: (candidate as any).skills,
    });
  }) as RequestHandler,
];

export const inviteCandidate: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id, cid } = req.params as { id: string; cid: string };
  const interview = await prisma.interview.findFirst({
    where: { id, adminId },
  });
  if (!interview) return res.status(404).json({ error: "Interview not found" });

  const relation = await prisma.interviewCandidate.findUnique({
    where: { interviewId_candidateId: { interviewId: id, candidateId: cid } },
  });
  if (!relation)
    return res
      .status(404)
      .json({ error: "Candidate not attached to interview" });

  const token = crypto.randomUUID();
  const incomingOrigin = String(req.headers.origin || req.headers.referer || "");
  const derivedBase = incomingOrigin ? incomingOrigin.replace(/\/$/, "") : APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const url = `${derivedBase}/candidate?token=${token}`;
  const updated = await prisma.interviewCandidate.update({
    where: { interviewId_candidateId: { interviewId: id, candidateId: cid } },
    data: {
      inviteSentAt: new Date(),
      inviteCount: { increment: 1 },
      inviteToken: token,
      inviteUrl: url,
    },
  });

  try {
    if (SENDGRID_API_KEY && SENDGRID_FROM) {
      const candidate = await prisma.candidate.findUnique({
        where: { id: cid },
      });
      const interviewTitle = interview.title;
      const to = candidate?.email;
      if (to) {
        await sgMail.send({
          to,
          from: SENDGRID_FROM,
          subject: `Interview Invitation: ${interviewTitle}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5;">
              <h2>Welcome to your interview${candidate?.name ? ", " + candidate.name : ""}!</h2>
              <p>You have been invited to an interview for <strong>${interviewTitle}</strong>.</p>
              <p>Please click the button below to join your interview and follow the on-screen instructions.</p>
              <p style="margin: 20px 0;">
                <a href="${url}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Join Interview</a>
              </p>
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p><a href="${url}">${url}</a></p>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
              <p><strong>Instructions:</strong></p>
              <ul>
                <li>Use a modern browser (Chrome/Edge) and allow mic/camera permissions.</li>
                <li>Find a quiet place and ensure a stable internet connection.</li>
                <li>Answer clearly and concisely; you can type or speak.</li>
              </ul>
              <p>Good luck!</p>
            </div>
          `,
        });
      }
    }
  } catch (e) {
    // Don't fail the request on email issues
    console.error("Send invite email failed", e);
  }

  res.json({
    ok: true,
    invitedAt: updated.inviteSentAt,
    inviteCount: updated.inviteCount,
    inviteUrl: updated.inviteUrl,
  });
};

export const inviteBulk: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id } = req.params as { id: string };
  const { candidateIds } = (req.body as { candidateIds?: string[] }) || {};
  if (!Array.isArray(candidateIds) || candidateIds.length === 0)
    return res.status(400).json({ error: "candidateIds required" });
  const interview = await prisma.interview.findFirst({
    where: { id, adminId },
  });
  if (!interview) return res.status(404).json({ error: "Interview not found" });

  const results = [] as { cid: string; invitedAt: Date }[];
  for (const cid of candidateIds) {
    const exists = await prisma.interviewCandidate.findUnique({
      where: { interviewId_candidateId: { interviewId: id, candidateId: cid } },
    });
    if (!exists) continue;
    const token = crypto.randomUUID();
    const incomingOrigin = String(req.headers.origin || req.headers.referer || "");
    const derivedBase = incomingOrigin ? incomingOrigin.replace(/\/$/, "") : APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const url = `${derivedBase}/candidate?token=${token}`;
    const updated = await prisma.interviewCandidate.update({
      where: { interviewId_candidateId: { interviewId: id, candidateId: cid } },
      data: {
        inviteSentAt: new Date(),
        inviteCount: { increment: 1 },
        inviteToken: token,
        inviteUrl: url,
      },
    });

    if (SENDGRID_API_KEY && SENDGRID_FROM) {
      try {
        const candidate = await prisma.candidate.findUnique({
          where: { id: cid },
        });
        const to = candidate?.email;
        if (to) {
          await sgMail.send({
            to,
            from: SENDGRID_FROM,
            subject: `Interview Invitation: ${interview.title}`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.5;">
                <h2>Welcome to your interview${candidate?.name ? ", " + candidate.name : ""}!</h2>
                <p>You have been invited to an interview for <strong>${interview.title}</strong>.</p>
                <p>Please click the button below to join your interview and follow the on-screen instructions.</p>
                <p style="margin: 20px 0;">
                  <a href="${url}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Join Interview</a>
                </p>
                <p>If the button doesn't work, copy and paste this link into your browser:</p>
                <p><a href="${url}">${url}</a></p>
              </div>
            `,
          });
        }
      } catch (e) {
        console.error("Bulk invite email failed", e);
      }
    }

    results.push({ cid, invitedAt: updated.inviteSentAt! });
  }
  res.json({ ok: true, count: results.length, results });
};

export const updateCandidateProfile: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id, cid } = req.params as { id: string; cid: string };
  const interview = await prisma.interview.findFirst({
    where: { id, adminId },
  });
  if (!interview) return res.status(404).json({ error: "Interview not found" });
  const {
    name,
    email,
    totalExperienceMonths,
    summary,
    domain,
    skills,
    maxAttempts,
  } = (req.body || {}) as any;
  const updated = await prisma.candidate.update({
    where: { id: cid },
    data: {
      name: name ?? undefined,
      email: email ?? undefined,
      totalExperienceMonths:
        typeof totalExperienceMonths === "number" &&
        Number.isFinite(totalExperienceMonths)
          ? Math.max(0, Math.floor(totalExperienceMonths))
          : undefined,
      summary: typeof summary === "string" ? summary.slice(0, 5000) : undefined,
      domain: typeof domain === "string" ? domain.slice(0, 255) : undefined,
      skills: Array.isArray(skills) ? skills.map((s) => String(s)) : undefined,
    } as any,
  });

  if (typeof maxAttempts === "number" || maxAttempts === null) {
    await prisma.interviewCandidate.update({
      where: { interviewId_candidateId: { interviewId: id, candidateId: cid } },
      data: {
        maxAttempts:
          typeof maxAttempts === "number"
            ? Math.max(1, Math.floor(maxAttempts))
            : null,
      } as any,
    });
  }

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    totalExperienceMonths: (updated as any).totalExperienceMonths,
    summary: (updated as any).summary,
    domain: (updated as any).domain,
    skills: (updated as any).skills,
  });
};

export const downloadProctorPhoto: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id, cid } = req.params as { id: string; cid: string };
  const interview = await prisma.interview.findFirst({
    where: { id, adminId },
  });
  if (!interview) return res.status(404).send("Not found");

  const attempt = Number((req.query as any)?.attempt);
  const attemptParam = Number.isFinite(attempt) && attempt > 0 ? attempt : null;

  const blobService = getBlobServiceClient();
  const containerClient = blobService.getContainerClient(getContainerName());

  // If attempt specified, try transcript-specific photo first
  if (attemptParam) {
    const t = await prisma.interviewTranscript.findFirst({
      where: { interviewId: id, candidateId: cid, attemptNumber: attemptParam },
      orderBy: { createdAt: "desc" },
      select: {
        proctorPhotoBlobName: true,
        proctorPhotoMimeType: true,
      },
    });
    if (t?.proctorPhotoBlobName) {
      const blobClient = containerClient.getBlobClient(t.proctorPhotoBlobName);
      const download = await blobClient.download();
      res.setHeader("Content-Type", t.proctorPhotoMimeType || "image/jpeg");
      const inline = String(req.query.inline || "").toLowerCase();
      const disposition =
        inline === "1" || inline === "true" ? "inline" : "attachment";
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="proctor-photo"`,
      );
      download.readableStreamBody?.pipe(res);
      return;
    }
  }

  // Fallback to latest candidate-level photo
  const ic = await prisma.interviewCandidate.findUnique({
    where: { interviewId_candidateId: { interviewId: id, candidateId: cid } },
  });
  if (!ic || !(ic as any).proctorPhotoBlobName)
    return res.status(404).send("Not found");

  const blobClient = containerClient.getBlobClient(
    (ic as any).proctorPhotoBlobName,
  );
  const download = await blobClient.download();
  res.setHeader(
    "Content-Type",
    (ic as any).proctorPhotoMimeType || "image/jpeg",
  );
  const inline = String(req.query.inline || "").toLowerCase();
  const disposition =
    inline === "1" || inline === "true" ? "inline" : "attachment";
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="proctor-photo"`,
  );
  download.readableStreamBody?.pipe(res);
};

export const bulkUploadCandidates = [
  upload.fields([
    { name: "resumes", maxCount: 200 },
    { name: "zip", maxCount: 1 },
  ]),
  (async (req, res) => {
    const adminId = (req as AuthRequest).userId!;
    const { id } = req.params as { id: string };
    const interview = await prisma.interview.findFirst({ where: { id, adminId } });
    if (!interview) return res.status(404).json({ error: "Interview not found" });

    const files = ((req as any).files?.["resumes"] as Express.Multer.File[]) || [];
    const zipFile = (((req as any).files?.["zip"] as Express.Multer.File[]) || [])[0];

    const inputs: { name: string; mimetype: string; buffer: Buffer }[] = [];

    // Unpack zip if provided
    if (zipFile) {
      try {
        const zipBuf = await normalizeToBuffer(zipFile);
        if (zipBuf) {
          const require = createRequire(import.meta.url);
          const AdmZip = require("adm-zip");
          const zip = new AdmZip(zipBuf);
          const entries = zip.getEntries();
          for (const e of entries) {
            if (e.isDirectory) continue;
            const name = e.entryName || e.name;
            if (!name) continue;
            const lower = name.toLowerCase();
            if (!(lower.endsWith(".pdf") || lower.endsWith(".doc") || lower.endsWith(".docx") || lower.endsWith(".txt"))) continue;
            const buf = e.getData();
            inputs.push({ name, mimetype: guessMimeFromName(name), buffer: buf });
          }
        }
      } catch (err) {
        console.warn("Failed to process zip:", err);
      }
    }

    for (const f of files) {
      const buf = await normalizeToBuffer(f);
      if (!buf) continue;
      const lower = (f.originalname || "").toLowerCase();
      if (!(lower.endsWith(".pdf") || lower.endsWith(".doc") || lower.endsWith(".docx") || lower.endsWith(".txt"))) continue;
      inputs.push({ name: f.originalname, mimetype: f.mimetype || guessMimeFromName(f.originalname), buffer: buf });
    }

    if (inputs.length === 0) return res.status(400).json({ error: "No supported files found" });

    const results: any[] = [];

    for (const item of inputs) {
      try {
        const text = await extractResumeText(item.name, item.mimetype, item.buffer);
        const extracted = await extractProfileFromText(text);
        const email = extracted?.email ? String(extracted.email).trim() : "";
        if (!email) {
          results.push({ file: item.name, status: "failed", reason: "Email not found in resume" });
          continue;
        }

        // Duplicate detection scoped to this interview
        try {
          const byEmail = await prisma.candidate.findUnique({ where: { email: email.toLowerCase() } as any });
          if (byEmail) {
            const existsForInterview = await prisma.interviewCandidate.findUnique({
              where: { interviewId_candidateId: { interviewId: id, candidateId: byEmail.id } },
            });
            if (existsForInterview) {
              results.push({ file: item.name, status: "failed", reason: `Duplicate: ${byEmail.name || byEmail.email}` });
              continue;
            }
          }

          const potentials = await findPotentialCandidates(extracted, 30, id);
          if (potentials.length) {
            const decision = await llmDecideDuplicate(extracted, potentials as any);
            if (decision && decision.duplicate) {
              results.push({ file: item.name, status: "failed", reason: `Duplicate: ${decision.name}` });
              continue;
            }
          }
        } catch {}

        const { blobName, originalName, mimeType } = await uploadResumeToBlob(id, item.name, item.mimetype, item.buffer);
        const skillsArray: string[] | undefined = Array.isArray(extracted?.skills)
          ? extracted.skills.map((s: any) => String(s)).filter(Boolean)
          : undefined;
        const totalMonths = Number(extracted?.total_experience_months);

        const candidate = await prisma.candidate.upsert({
          where: { email },
          create: {
            email,
            name: extracted?.name ? String(extracted.name) : undefined,
            ...(blobName ? { resumeBlobName: blobName, resumeOriginalName: originalName, resumeMimeType: mimeType } : {}),
            totalExperienceMonths: Number.isFinite(totalMonths) ? Math.max(0, Math.floor(totalMonths)) : undefined,
            summary: extracted?.summary ? String(extracted.summary).slice(0, 5000) : undefined,
            domain: extracted?.domain ? String(extracted.domain).slice(0, 255) : undefined,
            skills: skillsArray,
          } as any,
          update: {
            name: extracted?.name ? String(extracted.name) : undefined,
            ...(blobName ? { resumeBlobName: blobName, resumeOriginalName: originalName, resumeMimeType: mimeType } : {}),
            totalExperienceMonths: Number.isFinite(totalMonths) ? Math.max(0, Math.floor(totalMonths)) : undefined,
            summary: extracted?.summary ? String(extracted.summary).slice(0, 5000) : undefined,
            domain: extracted?.domain ? String(extracted.domain).slice(0, 255) : undefined,
            skills: skillsArray,
          } as any,
        });
        await prisma.interviewCandidate.upsert({
          where: {
            interviewId_candidateId: { interviewId: id, candidateId: candidate.id },
          },
          create: { interviewId: id, candidateId: candidate.id },
          update: {},
        });
        results.push({ file: item.name, status: "ok", candidateId: candidate.id, email: candidate.email });
      } catch (e: any) {
        results.push({ file: item.name, status: "failed", reason: e?.message || String(e) });
      }
    }

    res.json({ ok: true, count: results.length, results });
  }) as RequestHandler,
];

export const downloadResume: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id, cid } = req.params as { id: string; cid: string };
  const interview = await prisma.interview.findFirst({
    where: { id, adminId },
  });
  if (!interview) return res.status(404).send("Not found");
  const candidate = await prisma.candidate.findUnique({ where: { id: cid } });
  if (!candidate || !candidate.resumeBlobName)
    return res.status(404).send("Not found");

  const blobService = getBlobServiceClient();
  const containerClient = blobService.getContainerClient(getContainerName());
  const blobClient = containerClient.getBlobClient(candidate.resumeBlobName);
  const download = await blobClient.download();
  res.setHeader(
    "Content-Type",
    candidate.resumeMimeType || "application/octet-stream",
  );
  const inline = String(req.query.inline || "").toLowerCase();
  const disposition =
    inline === "1" || inline === "true" ? "inline" : "attachment";
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${candidate.resumeOriginalName || "resume"}"`,
  );
  download.readableStreamBody?.pipe(res);
};
