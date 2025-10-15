import type { RequestHandler } from "express";
import { prisma } from "../prisma";
import { groqChat } from "../services/llm";
import { buildReportTemplatePrompt, buildTemplateSummaryPrompt } from "../prompts/report";
import { AuthRequest } from "../middleware/auth";
import { randomUUID } from "crypto";

function normalizeTemplate(json: any) {
  try {
    const params = Array.isArray(json?.parameters) ? json.parameters : [];
    const cleaned = params
      .map((p: any, idx: number) => {
        const idVal = p?.id
          ? String(p.id)
          : (() => {
              try {
                return randomUUID();
              } catch {
                return `param-${idx}`;
              }
            })();
        const name = String(p?.name || "Parameter");
        const description = String(p?.description || "");
        const weightNum = Number(p?.weight);
        const weight = Number.isFinite(weightNum)
          ? Math.max(0, Math.min(100, weightNum))
          : 0;
        const typeRaw = String(p?.scale?.type || "1-5");
        const type =
          typeRaw === "percentage" || typeRaw === "stars" ? typeRaw : "1-5";
        const minNum = Number(p?.scale?.min);
        const maxNum = Number(p?.scale?.max);
        const min = Number.isFinite(minNum)
          ? minNum
          : type === "percentage"
            ? 0
            : 1;
        const max = Number.isFinite(maxNum)
          ? maxNum
          : type === "percentage"
            ? 100
            : 5;
        return {
          id: idVal,
          name,
          description,
          weight,
          scale: { type, min, max },
        };
      })
      .filter((p: any) => p.name && Number.isFinite(p.weight) && p.weight >= 0);
    const sum = cleaned.reduce((a: number, b: any) => a + b.weight, 0) || 0;
    if (sum > 0 && sum !== 100) {
      cleaned.forEach(
        (p: any) => (p.weight = Math.round((p.weight / sum) * 100)),
      );
      const diff = 100 - cleaned.reduce((a: number, b: any) => a + b.weight, 0);
      if (cleaned[0]) cleaned[0].weight += diff;
    }
    return {
      parameters: cleaned,
      includeOverall: Boolean(json?.includeOverall ?? true),
      includeSkillLevels: Boolean(json?.includeSkillLevels ?? true),
    };
  } catch {
    return { parameters: [], includeOverall: true, includeSkillLevels: true };
  }
}

function extractFirstJsonObject(text: string): any | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const slice = text.slice(start, end + 1).trim();
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function extractFirstJsonArray(text: string): any[] | null {
  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return null;
    const slice = text.slice(start, end + 1).trim();
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

export const getReportTemplate: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id } = req.params as { id: string };
  const interview = await prisma.interview.findFirst({
    where: { id, adminId },
  });
  if (!interview) return res.status(404).json({ error: "Interview not found" });
  const tpl = await prisma.reportTemplate.findUnique({
    where: { interviewId: id },
  });
  res.json({ structure: tpl?.structure || null, templateSummary: tpl?.templateSummary || null });
};

export const generateReportTemplate: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id } = req.params as { id: string };
  const interview = await prisma.interview.findFirst({
    where: { id, adminId },
  });
  if (!interview) return res.status(404).json({ error: "Interview not found" });
  const prompt = buildReportTemplatePrompt({
    title: interview.title,
    description: interview.description,
    context: interview.context,
    interviewerRole: interview.interviewerRole,
  });

  const buildFallback = () => {
    const role = (interview.interviewerRole || "").toLowerCase();
    const base = [
      {
        name: "Communication",
        description: "Clarity, articulation, active listening",
        weight: 20,
      },
      {
        name: "Empathy",
        description: "Respectful tone, collaborative mindset",
        weight: 10,
      },
      {
        name: "Problem Solving",
        description: "Approach, trade-offs, structured thinking",
        weight: 20,
      },
      {
        name: "Technical Knowledge",
        description: "Core concepts relevant to the role",
        weight: 30,
      },
      {
        name: "Culture Fit",
        description: "Values alignment and ownership",
        weight: 20,
      },
    ];
    if (role.includes("frontend") || role.includes("react")) {
      base[3] = {
        name: "Frontend Expertise",
        description: "React, state mgmt, performance, accessibility",
        weight: 30,
      } as any;
    } else if (role.includes("backend") || role.includes("node")) {
      base[3] = {
        name: "Backend Expertise",
        description: "APIs, databases, scalability, reliability",
        weight: 30,
      } as any;
    } else if (role.includes("data")) {
      base[3] = {
        name: "Data Expertise",
        description: "SQL, modeling, pipelines, analysis",
        weight: 30,
      } as any;
    }
    const parameters = base.map((p: any) => ({
      id: randomUUID(),
      name: p.name,
      description: p.description,
      weight: p.weight,
      scale: { type: "1-5", min: 1, max: 5 },
    }));
    return normalizeTemplate({
      parameters,
      includeOverall: true,
      includeSkillLevels: true,
    });
  };

  let structure: any = null;
  try {
    const reply = await groqChat([
      { role: "system", content: "You return only strict JSON, no prose." },
      { role: "user", content: prompt },
    ]);
    const parsed = (() => {
      try {
        return JSON.parse(reply);
      } catch {
        return extractFirstJsonObject(reply);
      }
    })();
    structure = parsed ? normalizeTemplate(parsed) : buildFallback();
  } catch {
    structure = buildFallback();
  }

  // Generate a concise template summary (JSON array of skill area strings) to store in DB
  let templateSummary: any[] | null = null;
  try {
    const summaryReply = await groqChat([
      { role: "system", content: "Return ONLY a JSON array of short skill area strings, no prose." },
      { role: "user", content: buildTemplateSummaryPrompt(structure) },
    ]);
    // Try parsing as JSON array
    let parsedArray: any[] | null = null;
    try {
      parsedArray = JSON.parse(summaryReply);
      if (!Array.isArray(parsedArray)) parsedArray = null;
    } catch {
      parsedArray = extractFirstJsonArray(summaryReply);
    }
    templateSummary = parsedArray || null;
  } catch (e) {
    templateSummary = null;
  }

  try {
    const saved = await prisma.reportTemplate.upsert({
      where: { interviewId: id },
      create: { interviewId: id, structure, templateSummary },
      update: { structure, templateSummary },
    });
    return res.json({ structure: saved.structure, templateSummary: saved.templateSummary });
  } catch (e) {
    return res.json({ structure, templateSummary });
  }
};

export const saveReportTemplate: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id } = req.params as { id: string };
  const interview = await prisma.interview.findFirst({
    where: { id, adminId },
  });
  if (!interview) return res.status(404).json({ error: "Interview not found" });
  const structure = normalizeTemplate((req.body as any)?.structure || {});

  // Generate concise summary for the provided structure
  let templateSummary: any[] | null = null;
  try {
    const summaryReply = await groqChat([
      { role: "system", content: "Return ONLY a JSON array of short skill area strings, no prose." },
      { role: "user", content: buildTemplateSummaryPrompt(structure) },
    ]);
    let parsedArray: any[] | null = null;
    try {
      parsedArray = JSON.parse(summaryReply);
      if (!Array.isArray(parsedArray)) parsedArray = null;
    } catch {
      parsedArray = extractFirstJsonArray(summaryReply);
    }
    templateSummary = parsedArray || null;
  } catch (e) {
    templateSummary = null;
  }

  const saved = await prisma.reportTemplate.upsert({
    where: { interviewId: id },
    create: { interviewId: id, structure, templateSummary },
    update: { structure, templateSummary },
  });
  res.json({ structure: saved.structure, templateSummary: saved.templateSummary });
};

export const listInterviewReportsSummary: RequestHandler = async (req, res) => {
  const adminId = (req as AuthRequest).userId!;
  const { id } = req.params as { id: string };
  const interview = await prisma.interview.findFirst({ where: { id, adminId } });
  if (!interview) return res.status(404).json({ error: "Interview not found" });

  const tpl = await prisma.reportTemplate.findUnique({ where: { interviewId: id } });
  const params = Array.isArray((tpl as any)?.structure?.parameters)
    ? (tpl as any).structure.parameters.map((p: any) => ({ id: String(p.id), name: String(p.name) }))
    : [];

  const attachments = await prisma.interviewCandidate.findMany({
    where: { interviewId: id },
    include: { candidate: true },
    orderBy: { createdAt: "asc" },
  });

  const reports = await prisma.interviewReport.findMany({
    where: { interviewId: id },
    orderBy: [{ candidateId: "asc" }, { attemptNumber: "asc" }],
  });

  const byCandidate: Record<string, any[]> = {};
  for (const r of reports) {
    const arr = byCandidate[r.candidateId] || (byCandidate[r.candidateId] = []);
    const scoresArr: any[] = Array.isArray((r as any).scores) ? (r as any).scores : [];
    const scoreMap: Record<string, number> = {};
    for (const s of scoresArr) {
      if (s && s.id != null) scoreMap[String(s.id)] = Number(s.score);
    }
    const overall = Number((r as any).structure?.overall);
    arr.push({ attemptNumber: r.attemptNumber, scores: scoreMap, overall: Number.isFinite(overall) ? overall : null, createdAt: r.createdAt });
  }

  const rows = attachments.map((rel) => ({
    candidate: { id: rel.candidate.id, name: rel.candidate.name || "", email: rel.candidate.email },
    inviteToken: (rel as any).inviteToken || null,
    attempts: (byCandidate[rel.candidateId] || []).sort((a, b) => a.attemptNumber - b.attemptNumber),
  }));

  // Helper to append server-side SAS token to URLs if configured
  const appendSas = (u: string | null) => {
    try {
      if (!u) return u;
      const sas = String(process.env.AZURE_BLOB_SAS || "").trim();
      if (!sas) return u;
      return u.includes("?") ? `${u}&${sas.replace(/^\?/, "")}` : `${u}?${sas.replace(/^\?/, "")}`;
    } catch (e) {
      return u;
    }
  };

  // For each attempt, attach recordings found in the database within the attempt's time window
  try {
    for (const r of rows) {
      const attemptsArr = Array.isArray(r.attempts) ? r.attempts : [];
      const inviteToken = r.inviteToken || null;
      for (let i = 0; i < attemptsArr.length; i++) {
        const a = attemptsArr[i];
        const start = a.createdAt || new Date(0);
        const end = attemptsArr[i + 1]?.createdAt || new Date(Date.now() + 1000);
        try {
          const whereCond: any = { createdAt: { gte: start, lt: end } };
          if (inviteToken) {
            whereCond.OR = [{ interviewId: id }, { attemptId: { contains: inviteToken } }];
          } else {
            whereCond.interviewId = id;
          }
          let recs = await prisma.interviewRecording.findMany({
            where: whereCond,
            orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, url: true, blobName: true, seq: true, createdAt: true },
          });
          // append SAS token to urls server-side if configured
          recs = (recs || []).map((x: any) => ({ ...x, url: appendSas(x?.url) }));
          a.recordings = recs;
        } catch (e) {
          a.recordings = [];
        }
      }
    }
  } catch (e) {
    // ignore errors when attaching recordings
  }

  res.json({ interview: { id: interview.id, title: interview.title }, parameters: params, rows });
};

function buildCandidateReportPrompt(args: {
  template: any;
  answers: string[];
  qaPairs?: { q: string; a: string | null }[];
  cefrEnabled?: boolean;
}) {
  const { template, answers, qaPairs, cefrEnabled } = args;
  const lines: string[] = [];
  lines.push(
    "You are a strict technical interviewer. Generate a comprehensive interview evaluation as strict JSON only.",
  );
  lines.push(
    "Use ONLY the transcript below. Evaluate answers relative to the specific questions asked. If a question was asked and the candidate did not answer it, do NOT award any marks for that question (assign the minimum for affected parameters).",
  );

  // Include brief template-level guidance if available (helps the evaluator focus on role priorities)
  if (template && template.templateSummary) {
    try {
      const tplSum = Array.isArray(template.templateSummary)
        ? template.templateSummary.join(", ")
        : String(template.templateSummary);
      lines.push(`Template summary (priority areas): ${tplSum}`);
    } catch {}
  }

  lines.push("Evaluation parameters (id, name, weight, scale[min,max], description):");
  const params = Array.isArray(template?.parameters) ? template.parameters : [];
  for (const p of params) {
    const min = p?.scale?.min ?? 1;
    const max = p?.scale?.max ?? 5;
    const desc = (p?.description || "").replace(/\n+/g, " ").trim();
    lines.push(
      `- id=${p.id}; name=${p.name}; weight=${p.weight}; scale=[${min}, ${max}]; description=${desc}`,
    );
  }

  if (cefrEnabled) {
    lines.push(
      "Special instruction: This interview is configured for CEFR-based language evaluation. For each evaluation parameter, return an additional field 'cefr' with one of: A1, A2, B1, B2, C1, C2. Also provide a short comment explaining why that CEFR level was chosen based on evidence.",
    );
    lines.push(
      "When CEFR is requested, the primary rating should be the 'cefr' string. Additionally, include 'score' numeric values mapped to the parameter's scale (e.g., 1-5 or percentage) so the system can render numeric charts. Ensure consistency between 'cefr' and numeric 'score'.",
    );
  }

  // Provide explicit Q/A pairing to judge correctness and completeness
  if (Array.isArray(qaPairs) && qaPairs.length > 0) {
    lines.push("Questions and paired candidate answers (Qn -> An):");
    qaPairs.forEach((p, i) => {
      const aTxt = p.a ? p.a : "<no answer>";
      lines.push(`Q${i + 1}: ${p.q}`);
      lines.push(`A${i + 1}: ${aTxt}`);
    });
  } else {
    lines.push("Candidate answers (chronological):");
    for (let i = 0; i < answers.length; i++) {
      lines.push(`A${i + 1}: ${answers[i]}`);
    }
  }

  lines.push(
    'Return ONLY valid JSON with this exact shape: { "summary": string, "parameters": [ { "id": string, "name": string, "score": number, "comment": string } ], "overall": number }.',
  );

  // Stronger instructions for a detailed, structured summary
  lines.push("Summary requirements:");
  lines.push(
    "- Provide a DETAILED, structured multi-paragraph summary (as the 'summary' string) with the following headings: Overview, Strengths, Weaknesses, Evidence, Suggested next steps.",
  );
  lines.push(
    "- Use clear references to parameter names when describing strengths/weaknesses and include concrete evidence (short quotes or precise paraphrases) from the candidate answers.",
  );

  lines.push("Scoring rules:");
  lines.push(
    "- Only award marks when a question was asked AND the answer addressed it correctly or partially. If a question had no answer or was irrelevant, assign the minimum score for impacted parameters (0% for percentage scales).",
  );
  lines.push(
    "- 1-5 scales: default to 2/5 with limited evidence; 1/5 if weak or partially relevant; use minimum if no answer exists; 4-5/5 ONLY with multiple, specific, technical evidences tied to asked questions.",
  );
  lines.push(
    "- Percentage scales: default to 40-55% with limited evidence; <40% if weak; use 0% if no answer exists; >80% ONLY with strong evidence.",
  );
  lines.push(
    "- Be conservative. Penalize vague, off-topic, or missing evidence. Reward concrete, correct, role-relevant details.",
  );
  lines.push(
    "- Ensure scores are within each parameter's min/max. Use integers on 1-5 scales.",
  );
  lines.push(
    "- Comments must cite specific evidence from the answers (short quotes or precise paraphrases) and reference the relevant question number (e.g., Q3).",
  );
  lines.push(
    "- If insufficient evidence for a parameter, explicitly state that and assign the minimum.",
  );
  lines.push(
    "- Overall must be a weighted aggregate (0-100). Typical averages should fall between 40 and 60 unless evidence is exceptional.",
  );
  lines.push(
    "- Limit parameters above 80% or 4/5 to cases with very strong evidence only.",
  );
  return lines.join("\n");
}

export const getOrGenerateCandidateReport: RequestHandler = async (
  req,
  res,
) => {
  const adminId = (req as AuthRequest).userId!;
  const { id, cid } = req.params as { id: string; cid: string };
  const reqAttempt = Number((req.query as any)?.attempt);
  const attemptParam =
    Number.isFinite(reqAttempt) && reqAttempt > 0
      ? Math.floor(reqAttempt)
      : null;
  const interview = await prisma.interview.findFirst({
    where: { id, adminId },
  });
  if (!interview) return res.status(404).json({ error: "Interview not found" });

  const tpl = await prisma.reportTemplate.findUnique({
    where: { interviewId: id },
  });
  const template = (tpl?.structure as any) || { parameters: [] };

  const latestTranscript = await prisma.interviewTranscript.findFirst({
    where: { interviewId: id, candidateId: cid },
    orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
  });
  const targetAttempt = attemptParam || latestTranscript?.attemptNumber || 1;

  const existing = await prisma.interviewReport.findUnique({
    where: {
      interviewId_candidateId_attemptNumber: {
        interviewId: id,
        candidateId: cid,
        attemptNumber: targetAttempt,
      },
    },
  });

  const force = ((req.query as any)?.force === "1" || (req.query as any)?.force === "true");

  if (existing && !force) {
    const transcriptRow = await prisma.interviewTranscript.findFirst({
      where: {
        interviewId: id,
        candidateId: cid,
        attemptNumber: targetAttempt,
      },
      orderBy: { createdAt: "desc" },
    });
    const turns = ((transcriptRow?.content as any[]) || []).map((m: any) => ({
      role: String(m.role || "user").toLowerCase(),
      content: String(m.content || "").trim(),
    }));
    const attempts = await prisma.interviewTranscript.findMany({
      where: { interviewId: id, candidateId: cid },
      orderBy: [{ attemptNumber: "asc" }, { createdAt: "asc" }],
      select: { attemptNumber: true, createdAt: true, id: true },
    });

    // Attach recordings for each attempt by time window (between this attempt's createdAt and the next attempt's createdAt)
    const attemptsWithRecordings: any[] = [];
    // Fetch inviteToken for this candidate to allow fallback matching if recordings were saved without interviewId
    let inviteToken: string | null = null;
    try {
      const ic = await prisma.interviewCandidate.findUnique({
        where: { interviewId_candidateId: { interviewId: id, candidateId: cid } },
        select: { inviteToken: true },
      });
      inviteToken = (ic as any)?.inviteToken || null;
    } catch (e) {
      inviteToken = null;
    }

    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i];
      const start = a.createdAt || new Date(0);
      const end = attempts[i + 1]?.createdAt || new Date(Date.now() + 1000);
      try {
        const whereCond: any = { createdAt: { gte: start, lt: end } };
        if (inviteToken) {
          whereCond.OR = [{ interviewId: id }, { attemptId: { contains: inviteToken } }];
        } else {
          whereCond.interviewId = id;
        }
        let recs = await prisma.interviewRecording.findMany({
          where: whereCond,
          orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, url: true, blobName: true, seq: true, createdAt: true },
        });
        recs = (recs || []).map((x: any) => ({ ...x, url: (String(x?.url || "") || null) }));
        // append SAS if configured
        const appendSas = (u: string | null) => {
          try {
            if (!u) return u;
            const sas = String(process.env.AZURE_BLOB_SAS || "").trim();
            if (!sas) return u;
            return u.includes("?") ? `${u}&${sas.replace(/^\?/, "")}` : `${u}?${sas.replace(/^\?/, "")}`;
          } catch (e) { return u; }
        };
        recs = recs.map((x: any) => ({ ...x, url: appendSas(x?.url) }));
        attemptsWithRecordings.push({ ...a, recordings: recs });
      } catch (e) {
        attemptsWithRecordings.push({ ...a, recordings: [] });
      }
    }

    // Determine proctor photo availability (transcript-level first, then candidate-level)
    let proctorPhotoUrl: string | null = null;
    try {
      // Prefer transcript-level photo for the requested attempt
      let chosenAttempt: number | null = null;
      let trPhoto = null as any;
      if (targetAttempt != null) {
        trPhoto = await prisma.interviewTranscript.findFirst({
          where: { interviewId: id, candidateId: cid, attemptNumber: targetAttempt, proctorPhotoBlobName: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { proctorPhotoBlobName: true, attemptNumber: true },
        });
        if (trPhoto) chosenAttempt = trPhoto.attemptNumber || targetAttempt;
      }
      // If none for the specific attempt, find the latest transcript-level photo available
      if (!trPhoto) {
        trPhoto = await prisma.interviewTranscript.findFirst({
          where: { interviewId: id, candidateId: cid, proctorPhotoBlobName: { not: null } },
          orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
          select: { proctorPhotoBlobName: true, attemptNumber: true },
        });
        if (trPhoto) chosenAttempt = trPhoto.attemptNumber || null;
      }
      if (trPhoto && trPhoto.proctorPhotoBlobName) {
        const attemptQuery = chosenAttempt ? `&attempt=${encodeURIComponent(String(chosenAttempt))}` : "";
        proctorPhotoUrl = `/api/interviews/${encodeURIComponent(id)}/candidates/${encodeURIComponent(cid)}/proctor-photo?inline=1${attemptQuery}`;
      } else {
        const icPhoto = await prisma.interviewCandidate.findUnique({
          where: { interviewId_candidateId: { interviewId: id, candidateId: cid } },
          select: { proctorPhotoBlobName: true },
        });
        if (icPhoto && (icPhoto as any).proctorPhotoBlobName) {
          proctorPhotoUrl = `/api/interviews/${encodeURIComponent(id)}/candidates/${encodeURIComponent(cid)}/proctor-photo?inline=1`;
        }
      }
    } catch (e) {
      proctorPhotoUrl = null;
    }

    return res.json({
      report: existing,
      template,
      transcript: turns,
      attempts: attemptsWithRecordings,
      proctorPhotoUrl,
    });
  }

  // If forcing regeneration and an existing report exists, remove it so we can create a fresh one
  if (existing && force) {
    try {
      await prisma.interviewReport.deleteMany({
        where: {
          interviewId: id,
          candidateId: cid,
          attemptNumber: targetAttempt,
        },
      });
    } catch (e) {
      // ignore deletion errors and continue to regenerate
    }
  }

  // Support explicit request to use all transcript rows for the attempt (useRawTranscript=1)
  const useRaw = ((req.query as any)?.useRawTranscript === "1" || (req.query as any)?.useRawTranscript === "true");

  let turns: { role: string; content: string }[] = [];

  if (useRaw) {
    // fetch all transcript rows for this attempt and concatenate their content arrays in chronological order
    const rows = await prisma.interviewTranscript.findMany({
      where: { interviewId: id, candidateId: cid, attemptNumber: targetAttempt },
      orderBy: [{ createdAt: 'asc' }],
    });
    for (const row of rows) {
      const contentArr = (row.content as any[]) || [];
      for (const m of contentArr) {
        turns.push({ role: String(m.role || "user").toLowerCase(), content: String(m.content || "").trim() });
      }
    }
  } else {
    const transcriptRow = await prisma.interviewTranscript.findFirst({
      where: { interviewId: id, candidateId: cid, attemptNumber: targetAttempt },
      orderBy: { createdAt: "desc" },
    });
    if (!transcriptRow)
      return res.status(404).json({ error: "Transcript not found" });

    turns = ((transcriptRow.content as any[]) || []).map((m: any) => ({
      role: String(m.role || "user").toLowerCase(),
      content: String(m.content || "").trim(),
    }));
  }

  const answers = turns
    .filter((t) => t.role === "user" && t.content)
    .map((t) => t.content)
    .slice(-200);

  // Build Q/A pairs based on assistant questions followed by nearest user answer
  const qaPairs: { q: string; a: string | null }[] = (() => {
    const pairs: { q: string; a: string | null }[] = [];
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      if (t.role !== "assistant" || !t.content) continue;
      let ans: string | null = null;
      for (let j = i + 1; j < turns.length; j++) {
        const u = turns[j];
        if (u.role === "assistant") break; // next question begins; no answer
        if (u.role === "user" && u.content) { ans = u.content; break; }
      }
      pairs.push({ q: t.content, a: ans && ans.trim() ? ans : null });
    }
    // limit to last 50 pairs to keep prompt bounded
    return pairs.slice(-50);
  })();

  let prompt: string | null = null;
  // If caller asked to force using raw transcript and useRawTranscript, skip LLM and run deterministic fallback scoring
  if (force && useRaw) {
    try {
      const allText = Array.isArray(answers) && answers.length > 0 ? String(answers.join(" ")) : "";
      const words = (allText || "").trim().split(/\s+/).filter(Boolean);
      const totalWords = words.length;
      const tplParams = Array.isArray((template as any)?.parameters) ? (template as any).parameters : [];
      const paramDebug: any = {};
      const fallback = tplParams.map((p: any) => {
        const min = Number(p?.scale?.min ?? 1);
        const max = Number(p?.scale?.max ?? 5);
        const mid = Number.isFinite(min) && Number.isFinite(max) ? Math.round((min + max) / 2) : min;
        if (!totalWords || totalWords < 5) {
          paramDebug[p.id] = { totalWords, keywordMatches: 0 };
          return {
            id: p.id,
            name: p.name,
            score: mid,
            comment: "No evidence in transcript to evaluate this parameter; assigned a default conservative score.",
          };
        }
        const cap = 500;
        const lenFactor = Math.min(totalWords, cap) / cap;
        let scoreFloat = min + lenFactor * (max - min);
        const textLower = allText.toLowerCase();
        const nameTokens = String(p?.name || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        let keywordMatches = 0;
        for (const t of nameTokens) {
          if (t.length < 3) continue;
          if (textLower.includes(t)) keywordMatches++;
        }
        const descTokens = String(p?.description || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        for (const t of descTokens) {
          if (t.length < 4) continue;
          if (textLower.includes(t)) keywordMatches++;
        }
        const synonyms = (p?.synonyms || []) as string[];
        for (const s of synonyms) {
          if (typeof s === 'string' && s.length > 3 && textLower.includes(s.toLowerCase())) keywordMatches++;
        }
        const nudge = Math.min(keywordMatches, 3) * 0.12 * (max - min);
        scoreFloat = scoreFloat + nudge;
        const finalScore = Math.max(min, Math.min(max, Math.round(scoreFloat)));
        paramDebug[p.id] = { totalWords, keywordMatches };
        return {
          id: p.id,
          name: p.name,
          score: finalScore,
          comment: `Automatically computed from transcript (words=${totalWords}, keywordMatches=${keywordMatches}).`,
        };
      });

      // set parsed early so downstream logic uses these params
      const parsedLocal: any = { summary: "", parameters: fallback };
      (parsedLocal as any).__debug = { used: 'fallback', totalWords: words.length, paramDebug };
      // attach to outer 'parsed' variable by setting a temporary variable on res.locals so later code can pick it up
      (res as any).__forced_parsed = parsedLocal;
    } catch (e) {
      (res as any).__forced_parsed = { summary: "", parameters: [] };
    }
  } else {
    prompt = buildCandidateReportPrompt({ template: { ...template, templateSummary: (tpl as any)?.templateSummary || null }, answers, cefrEnabled: Boolean(interview?.cefrEvaluation) });
  }

  let parsed: any = null;

  // If we computed a forced parsed result earlier, use it and skip LLM
  if ((res as any).__forced_parsed) {
    parsed = (res as any).__forced_parsed;
  } else {
    try {
      const reply = await groqChat(
        [
          { role: "system", content: "You return only strict JSON, no prose." },
          { role: "user", content: prompt },
        ],
        { temperature: 0.1 },
      );
      try {
        parsed = JSON.parse(reply);
      } catch {
        parsed = extractFirstJsonObject(reply);
      }
    } catch (e) {
      parsed = null;
    }

    // Ensure parsed is an object with parameters array
    if (!parsed || !Array.isArray(parsed.parameters)) {
      parsed = { summary: "", parameters: [] };
    }
  }

  // If some template parameters are missing from the LLM response, ask the LLM specifically to evaluate only the missing ones using the candidate answers.
  try {
    const tplParams = Array.isArray((template as any)?.parameters)
      ? (template as any).parameters
      : [];
    const existingParams = Array.isArray(parsed.parameters) ? parsed.parameters : [];
    const existingIds = new Set(existingParams.map((p: any) => String(p.id)));
    const missing = tplParams.filter((p: any) => !existingIds.has(String(p.id)));
    if (missing.length > 0 && answers.length > 0) {
      const lines: string[] = [];
      lines.push("You are an expert evaluator. For each parameter below, produce a JSON array of objects with exact fields: { id, name, score, comment }.");
      if (Boolean(interview?.cefrEvaluation)) {
        lines.push("Because this interview uses CEFR evaluation, include an additional field 'cefr' with one of: A1, A2, B1, B2, C1, C2 for each parameter. Ensure the numeric 'score' is consistent with the CEFR level and the parameter's scale.");
      }
      lines.push("Use ONLY the candidate answers provided as evidence. If no evidence exists for a parameter, state that in comment and assign a conservative midpoint score within the parameter's scale.");
      lines.push("Return ONLY valid JSON (an array of objects). Do not include any prose outside the JSON.");
      lines.push("Parameters to evaluate:");
      for (const p of missing) {
        const min = p?.scale?.min ?? 1;
        const max = p?.scale?.max ?? 5;
        const desc = (p?.description || "").replace(/\n+/g, " ").trim();
        lines.push(`- id=${p.id}; name=${p.name}; scale=[${min},${max}]; description=${desc}`);
      }
      lines.push("Candidate answers (chronological):");
      for (let i = 0; i < answers.length; i++) {
        lines.push(`A${i + 1}: ${answers[i]}`);
      }

      const missingPrompt = lines.join("\n");
      try {
        const reply2 = await groqChat(
          [
            { role: "system", content: "You return only strict JSON, no prose." },
            { role: "user", content: missingPrompt },
          ],
          { temperature: 0.1 },
        );
        let parsedMissing: any = null;
        try {
          parsedMissing = JSON.parse(reply2);
        } catch {
          parsedMissing = extractFirstJsonArray(reply2);
        }
        if (Array.isArray(parsedMissing) && parsedMissing.length > 0) {
          parsed.parameters = Array.isArray(parsed.parameters)
            ? parsed.parameters.concat(parsedMissing)
            : parsedMissing;
        }
      } catch (e) {
        // If this secondary LLM call fails, we'll rely on fallback logic below
      }
    }
  } catch (e) {
    // ignore
  }

  // If the LLM didn't include a detailed summary, ask it to generate one using the available parameter evaluations and answers
  try {
    if ((!parsed.summary || String(parsed.summary).trim() === "") && Array.isArray(parsed.parameters) && parsed.parameters.length > 0) {
      const sLines: string[] = [];
      sLines.push("You are a report writer. Produce a detailed multi-paragraph summary with headings: Overview, Strengths, Weaknesses, Evidence, Suggested next steps.");
      sLines.push("Use ONLY the parameter evaluations and candidate answers provided. Return only the plain summary text (no JSON or extraneous prose). Keep headings as plain text.");
      sLines.push("Parameter evaluations:");
      for (const p of parsed.parameters) {
        sLines.push(`- id=${p.id}; name=${p.name}; score=${p.score}; comment=${p.comment || ""}`);
      }
      sLines.push("Candidate answers:");
      for (let i = 0; i < answers.length; i++) sLines.push(`A${i + 1}: ${answers[i]}`);
      const summaryPrompt = sLines.join("\n");
      try {
        const reply3 = await groqChat(
          [
            { role: "system", content: "You return only the requested content. Do not add JSON wrappers." },
            { role: "user", content: summaryPrompt },
          ],
          { temperature: 0.1 },
        );
        if (reply3 && String(reply3).trim()) {
          parsed.summary = String(reply3).trim();
        }
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // ignore
  }


  // If LLM failed to return parameter scores, fallback to generating conservative default scores
  try {
    if (!Array.isArray(parsed.parameters) || parsed.parameters.length === 0) {
      const tplParams = Array.isArray((template as any)?.parameters)
        ? (template as any).parameters
        : [];
      // Build a dynamic fallback using simple heuristics over the candidate answers/transcript
      const allText = Array.isArray(answers) && answers.length > 0 ? String(answers.join(" ")) : "";
      const words = (allText || "").trim().split(/\s+/).filter(Boolean);
      const totalWords = words.length;
      const fallback = tplParams.map((p: any) => {
        const min = Number(p?.scale?.min ?? 1);
        const max = Number(p?.scale?.max ?? 5);
        const mid = Number.isFinite(min) && Number.isFinite(max
        )
          ? Math.round((min + max) / 2)
          : min;

        // If there is very little transcript, assign minimum score (strict)
        if (!totalWords || totalWords < 30) {
          return {
            id: p.id,
            name: p.name,
            score: min,
            comment: "No evidence in transcript to evaluate this parameter; assigned minimum score.",
          };
        }

        // Base score starts at minimum; only increases with evidence
        const cap = 500;
        const lenFactor = Math.min(totalWords, cap) / cap; // 0..1
        let scoreFloat = min; // strict baseline

        // Keyword evidence: if parameter name/description words appear in transcript, nudge score up
        const textLower = allText.toLowerCase();
        const nameTokens = String(p?.name || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        let keywordMatches = 0;
        for (const t of nameTokens) {
          if (t.length < 3) continue;
          if (textLower.includes(t)) keywordMatches++;
        }
        // also check description for keywords
        const descTokens = String(p?.description || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        for (const t of descTokens) {
          if (t.length < 4) continue;
          if (textLower.includes(t)) keywordMatches++;
        }

        // If there is no keyword-level evidence, keep minimum score
        if (keywordMatches === 0) {
          return {
            id: p.id,
            name: p.name,
            score: min,
            comment: `No evidence of relevant skills in transcript; assigned minimum score (words=${totalWords}).`,
          };
        }

        // With evidence, scale modestly by transcript length + keyword matches
        const nudge = Math.min(keywordMatches, 2) * 0.1 * (max - min);
        scoreFloat = min + lenFactor * 0.5 * (max - min) + nudge; // stricter growth

        // Clamp and round
        const finalScore = Math.max(min, Math.min(max, Math.round(scoreFloat)));

        return {
          id: p.id,
          name: p.name,
          score: finalScore,
          comment: `Automatically computed from transcript (words=${totalWords}, keywordMatches=${keywordMatches}).`,
        };
      });
      parsed.parameters = fallback;
      if (!parsed.summary || String(parsed.summary).trim() === "") {
        parsed.summary = "No detailed summary was generated by the evaluator. Default conservative scores were assigned to each parameter when no evidence was found.";
      }
    }

    // If CEFR evaluation is enabled for this interview, translate any 'cefr' fields into numeric scores consistent with each parameter's scale
    const cefrEnabled = Boolean((tpl as any)?.cefrEvaluation || (template as any)?.cefrEvaluation);
    if (cefrEnabled && Array.isArray(parsed.parameters)) {
      const mapCefrToNumeric = (cefr: string | undefined, p: any) => {
        if (!cefr) return null;
        const c = String(cefr).toUpperCase().trim();
        // numeric mapping for 1-5 scales: A1=1, A2=2, B1=3, B2=4, C1=5, C2=5
        const cefrRank: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 5 };
        const rank = cefrRank[c] || null;
        const scale = p?.scale || { min: 1, max: 5 };
        const min = Number(scale.min ?? 1);
        const max = Number(scale.max ?? 5);
        // If percentage scale, map to midpoint percentages for bands
        if (scale.type === "percentage" || (min === 0 && max === 100)) {
          const pctMap: Record<string, number> = { A1: 10, A2: 28, B1: 45, B2: 65, C1: 83, C2: 95 };
          return pctMap[c] ?? Math.round(((min + max) / 2));
        }
        // For 1-5 or similar numeric scales, map using rank proportion
        if (typeof rank === "number") {
          // Map rank (1..5) onto [min..max]
          const mapped = Math.round(min + ((rank - 1) / 4) * (max - min));
          return Math.max(min, Math.min(max, mapped));
        }
        return null;
      };

      parsed.parameters = parsed.parameters.map((p: any) => {
        const cefr = p?.cefr || p?.CEFR || null;
        const mapped = mapCefrToNumeric(cefr, p);
        if (mapped !== null) {
          return { ...p, score: mapped, comment: `${p.comment || ""} (CEFR: ${cefr})`.trim() };
        }
        return p;
      });
    }
  } catch (e) {
    // ignore and continue
  }

  // Compute overall percentage using template weights and scales
  try {
    const params = Array.isArray((template as any)?.parameters)
      ? (template as any).parameters
      : [];
    const map: Record<string, any> = Object.fromEntries(
      params.map((p: any) => [String(p.id), p]),
    );
    let totalW = 0;
    let acc = 0;
    for (const p of parsed.parameters) {
      const t = map[String(p.id)];
      if (!t) continue;
      const w = Number(t.weight) || 0;
      const min = Number(t?.scale?.min ?? 1);
      const max = Number(t?.scale?.max ?? 5);
      const s = Number(p.score);
      if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(s)) continue;
      const clamped = Math.max(min, Math.min(max, s));
      const pct = ((clamped - min) / (max - min)) * 100;
      acc += pct * w;
      totalW += w;
    }
    parsed.overall = totalW > 0 ? Math.round(acc / totalW) : 0;
  } catch {}

  // Replace answer tokens like 'answer A3' or 'A3' in the generated summary with the actual answer text
  try {
    if (parsed && typeof parsed.summary === "string" && Array.isArray(answers) && answers.length > 0) {
      let s = String(parsed.summary);
      // First replace 'answer A12' or 'answer A1' (case-insensitive)
      s = s.replace(/answer\s+A(\d{1,3})/gi, (_m, g1) => {
        const idx = Number(g1) - 1;
        const txt = answers[idx] ? String(answers[idx]).replace(/\s+/g, " ").trim() : null;
        return txt ? `"${txt}"` : _m;
      });
      // Then replace standalone tokens like 'A12' (word boundary)
      s = s.replace(/\bA(\d{1,3})\b/g, (_m, g1) => {
        const idx = Number(g1) - 1;
        const txt = answers[idx] ? String(answers[idx]).replace(/\s+/g, " ").trim() : null;
        return txt ? `"${txt}"` : _m;
      });
      parsed.summary = s;
    }
  } catch (e) {
    // ignore replacement errors
  }

  const saved = await prisma.interviewReport.create({
    data: {
      interviewId: id,
      candidateId: cid,
      attemptNumber: targetAttempt,
      structure: parsed,
      scores: parsed?.parameters || [],
      summary: typeof parsed?.summary === "string" ? parsed.summary : null,
    },
  });

  const attempts = await prisma.interviewTranscript.findMany({
    where: { interviewId: id, candidateId: cid },
    orderBy: [{ attemptNumber: "asc" }, { createdAt: "asc" }],
    select: { attemptNumber: true, createdAt: true, id: true },
  });

  // Attach recordings for each attempt by time window
  const attemptsWithRecordings: any[] = [];
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    const start = a.createdAt || new Date(0);
    const end = attempts[i + 1]?.createdAt || new Date(Date.now() + 1000);
    try {
      let recs = await prisma.interviewRecording.findMany({
        where: {
          interviewId: id,
          createdAt: { gte: start, lt: end },
        },
        orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, url: true, blobName: true, seq: true, createdAt: true },
      });
      // append SAS if configured
      const appendSasLocal = (u: string | null) => {
        try {
          if (!u) return u;
          const sas = String(process.env.AZURE_BLOB_SAS || "").trim();
          if (!sas) return u;
          return u.includes("?") ? `${u}&${sas.replace(/^\?/, "")}` : `${u}?${sas.replace(/^\?/, "")}`;
        } catch (e) { return u; }
      };
      recs = (recs || []).map((x: any) => ({ ...x, url: appendSasLocal(x?.url) }));
      attemptsWithRecordings.push({ ...a, recordings: recs });
    } catch (e) {
      attemptsWithRecordings.push({ ...a, recordings: [] });
    }
  }

  // Determine proctor photo availability for generated report
  let proctorPhotoUrl: string | null = null;
  try {
    // Prefer transcript-level photo for the requested attempt if present
    let chosenAttempt: number | null = null;
    let trPhoto = null as any;
    if (targetAttempt != null) {
      trPhoto = await prisma.interviewTranscript.findFirst({
        where: { interviewId: id, candidateId: cid, attemptNumber: targetAttempt, proctorPhotoBlobName: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { proctorPhotoBlobName: true, attemptNumber: true },
      });
      if (trPhoto) chosenAttempt = trPhoto.attemptNumber || targetAttempt;
    }
    if (!trPhoto) {
      trPhoto = await prisma.interviewTranscript.findFirst({
        where: { interviewId: id, candidateId: cid, proctorPhotoBlobName: { not: null } },
        orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
        select: { proctorPhotoBlobName: true, attemptNumber: true },
      });
      if (trPhoto) chosenAttempt = trPhoto.attemptNumber || null;
    }
    if (trPhoto && trPhoto.proctorPhotoBlobName) {
      const attemptQuery = chosenAttempt ? `&attempt=${encodeURIComponent(String(chosenAttempt))}` : "";
      proctorPhotoUrl = `/api/interviews/${encodeURIComponent(id)}/candidates/${encodeURIComponent(cid)}/proctor-photo?inline=1${attemptQuery}`;
    } else {
      const icPhoto = await prisma.interviewCandidate.findUnique({
        where: { interviewId_candidateId: { interviewId: id, candidateId: cid } },
        select: { proctorPhotoBlobName: true },
      });
      if (icPhoto && (icPhoto as any).proctorPhotoBlobName) {
        proctorPhotoUrl = `/api/interviews/${encodeURIComponent(id)}/candidates/${encodeURIComponent(cid)}/proctor-photo?inline=1`;
      }
    }
  } catch (e) {
    proctorPhotoUrl = null;
  }

  // Ensure every recording url returned includes SAS token if configured
  try {
    const sas = String(process.env.AZURE_BLOB_SAS || "").trim();
    const appendSasFinal = (u: string | null) => {
      try {
        if (!u) return u;
        if (!sas) return u;
        return u.includes("?") ? `${u}&${sas.replace(/^\?/, "")}` : `${u}?${sas.replace(/^\?/, "")}`;
      } catch (e) { return u; }
    };
    if (Array.isArray(attemptsWithRecordings)) {
      for (const a of attemptsWithRecordings) {
        if (!a || !Array.isArray(a.recordings)) continue;
        for (const r of a.recordings) {
          try {
            r.url = appendSasFinal(r.url);
          } catch {}
        }
      }
    }
    // Also ensure rows (used by admin listing) have recordings appended
    if (Array.isArray(rows)) {
      for (const r0 of rows) {
        const attemptsArr = Array.isArray(r0.attempts) ? r0.attempts : [];
        for (const a of attemptsArr) {
          if (!a || !Array.isArray(a.recordings)) continue;
          for (const r of a.recordings) {
            try { r.url = appendSasFinal(r.url); } catch {}
          }
        }
      }
    }
    try { console.info("SAS present for reporting URLs: ", !!sas); } catch {}
  } catch (e) {}

  return res.json({ report: saved, template, transcript: turns, attempts: attemptsWithRecordings, proctorPhotoUrl, debug: (parsed && (parsed as any).__debug) || null });
};
