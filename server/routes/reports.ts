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

  // Generate a concise template summary (3-6 bullets) to store in DB
  let templateSummary: string | null = null;
  try {
    const summaryReply = await groqChat([
      { role: "system", content: "Return ONLY concise bullet points, no prose." },
      { role: "user", content: buildTemplateSummaryPrompt(structure) },
    ]);
    templateSummary = summaryReply.trim();
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
  let templateSummary: string | null = null;
  try {
    const summaryReply = await groqChat([
      { role: "system", content: "Return ONLY concise bullet points, no prose." },
      { role: "user", content: buildTemplateSummaryPrompt(structure) },
    ]);
    templateSummary = summaryReply.trim();
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

function buildCandidateReportPrompt(args: {
  template: any;
  answers: string[];
}) {
  const { template, answers } = args;
  const lines: string[] = [];
  lines.push(
    "You are a strict technical interviewer. Generate a comprehensive interview evaluation as strict JSON only.",
  );
  lines.push(
    "Use ONLY the candidate's answers below as evidence. Ignore any interviewer prompts or external context.",
  );
  lines.push("Evaluation parameters (id, name, weight, scale[min,max]):");
  const params = Array.isArray(template?.parameters) ? template.parameters : [];
  for (const p of params) {
    const min = p?.scale?.min ?? 1;
    const max = p?.scale?.max ?? 5;
    lines.push(
      `- id=${p.id}; name=${p.name}; weight=${p.weight}; scale=[${min}, ${max}]`,
    );
  }
  lines.push("Candidate answers (chronological):");
  for (let i = 0; i < answers.length; i++) {
    lines.push(`A${i + 1}: ${answers[i]}`);
  }
  lines.push(
    'Return ONLY valid JSON with this exact shape: { "summary": string, "parameters": [ { "id": string, "name": string, "score": number, "comment": string } ], "overall": number }.',
  );
  lines.push("Scoring rules:");
  lines.push(
    "- 1-5 scales: default to 2/5 with limited evidence; 1/5 if weak/missing; 4-5/5 ONLY with multiple, specific, technical evidences.",
  );
  lines.push(
    "- Percentage scales: default to 40-55% with limited evidence; <40% if weak/missing; >80% ONLY with strong evidence.",
  );
  lines.push(
    "- Be conservative. Penalize vague or missing evidence. Reward concrete, correct, role-relevant details.",
  );
  lines.push(
    "- Ensure scores are within each parameter's min/max. Use integers on 1-5 scales.",
  );
  lines.push(
    "- Comments must cite specific evidence from the answers (short quotes or precise paraphrases).",
  );
  lines.push(
    "- If insufficient evidence for a parameter, explicitly state that and assign a lower score.",
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
  const template = tpl?.structure || { parameters: [] };

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
  if (existing) {
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
    return res.json({
      report: existing,
      template,
      transcript: turns,
      attempts,
    });
  }

  const transcriptRow = await prisma.interviewTranscript.findFirst({
    where: { interviewId: id, candidateId: cid, attemptNumber: targetAttempt },
    orderBy: { createdAt: "desc" },
  });
  if (!transcriptRow)
    return res.status(404).json({ error: "Transcript not found" });

  const turns = ((transcriptRow.content as any[]) || []).map((m: any) => ({
    role: String(m.role || "user").toLowerCase(),
    content: String(m.content || "").trim(),
  }));
  const answers = turns
    .filter((t) => t.role === "user" && t.content)
    .map((t) => t.content)
    .slice(-200);

  const prompt = buildCandidateReportPrompt({ template, answers });

  let parsed: any = null;
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

  if (!parsed || !Array.isArray(parsed.parameters)) {
    parsed = { summary: "", parameters: [] };
  }

  // Compute overall percentage using template weights and scales
  try {
    const params = Array.isArray(template?.parameters)
      ? template.parameters
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

  return res.json({ report: saved, template, transcript: turns, attempts });
};
