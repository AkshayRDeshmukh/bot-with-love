import type { RequestHandler } from "express";
import { prisma } from "../prisma";
import {
  buildInterviewSystemPrompt,
  buildUserMessage,
  buildContextSummaryPrompt,
} from "../prompts/interview";
import { groqChat, type ChatMessage } from "../services/llm";

export const chatWithLLM: RequestHandler = async (req, res) => {
  try {
    const {
      interviewId,
      token,
      userText,
      history,
      interview: inputInterview,
    } = (req.body || {}) as {
      interviewId?: string;
      token?: string;
      userText?: string;
      history?: ChatMessage[];
      interview?: {
        title?: string;
        description?: string;
        context?: string;
        interviewerRole?: string;
      };
    };

    // If a candidate token and history are provided, persist full conversation to DB so reports always have raw transcript
    if (token && Array.isArray(history)) {
      try {
        const ic = await prisma.interviewCandidate.findFirst({ where: { inviteToken: String(token) } });
        if (ic) {
          const interviewRow = await prisma.interview.findUnique({ where: { id: ic.interviewId } });
          const icRow = await prisma.interviewCandidate.findFirst({ where: { interviewId: ic.interviewId, candidateId: ic.candidateId } });
          const allowed = Math.max(
            1,
            Number.isFinite((icRow as any)?.maxAttempts as any) && (icRow as any)?.maxAttempts != null
              ? ((icRow as any)?.maxAttempts as any)
              : Number.isFinite((interviewRow as any)?.maxAttempts as any) && (interviewRow as any)?.maxAttempts != null
                ? ((interviewRow as any)?.maxAttempts as any)
                : 1,
          );

          const latest = await prisma.interviewTranscript.findFirst({
            where: { interviewId: ic.interviewId, candidateId: ic.candidateId },
            orderBy: { attemptNumber: "desc" },
            select: { attemptNumber: true, content: true },
          });

          const all = await prisma.interviewTranscript.findMany({
            where: { interviewId: ic.interviewId, candidateId: ic.candidateId },
            select: { id: true, content: true },
          });
          const used = all.filter((r: any) => Array.isArray(r.content) && r.content.length > 0).length;
          const targetAttempt = latest && Array.isArray((latest as any).content) && (latest as any).content.length === 0
            ? (latest as any).attemptNumber!
            : used + 1;

          if (targetAttempt <= allowed) {
            await prisma.interviewTranscript.upsert({
              where: {
                interviewId_candidateId_attemptNumber: {
                  interviewId: ic.interviewId,
                  candidateId: ic.candidateId,
                  attemptNumber: targetAttempt,
                },
              },
              update: { content: history as any },
              create: {
                interviewId: ic.interviewId,
                candidateId: ic.candidateId,
                attemptNumber: targetAttempt,
                content: history as any,
              },
            });
          }
        }
      } catch (e) {
        // Do not fail the LLM call if persistence fails
        console.error("Failed to persist transcript in chatWithLLM:", e?.message || e);
      }
    }

    // Determine if we have prior history
    const hasHistory = Array.isArray(history) && history.length > 0;

    // Allow empty userText when no history (to trigger ice-breaker); otherwise require userText
    if ((userText === undefined || userText === null || !String(userText).trim()) && hasHistory) {
      return res.status(400).json({ error: "userText is required" });
    }

    // Prefer interview context provided by the client (e.g., Admin preview)
    let interview: any = inputInterview || null;

    // Fallback: fetch from DB by id if no explicit interview context was provided
    if (!interview && interviewId) {
      interview = await prisma.interview.findUnique({
        where: { id: interviewId },
      });
    }

    const remainingSeconds = (() => {
      const raw = (req.body as any)?.timing?.remainingSeconds;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
    })();
    const totalMinutes = (() => {
      const raw = (req.body as any)?.timing?.totalMinutes;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
    })();

    // Fetch associated report template (if interviewId provided)
    let templateStructure: unknown = undefined;
    let templateSummary: string[] | undefined = undefined;
    if (interviewId) {
      const tpl = await prisma.reportTemplate.findUnique({
        where: { interviewId },
        select: { structure: true, templateSummary: true },
      });
      templateStructure = tpl?.structure;
      if (Array.isArray(tpl?.templateSummary)) {
        templateSummary = tpl?.templateSummary.map((s: any) => String(s));
      }
    }

    // Determine which skill to focus on, based on number of user messages so far
    const userCount = Array.isArray(history)
      ? history.filter((h) => h.role === "user").length
      : 0;
    let currentSkill: string | undefined = undefined;
    let currentSkillIndex: number | undefined = undefined;
    let remainingForSkill: number | undefined = undefined;
    if (templateSummary && templateSummary.length > 0) {
      currentSkillIndex = Math.floor(userCount / 5) % templateSummary.length;
      currentSkill = templateSummary[currentSkillIndex];
      remainingForSkill = 5 - (userCount % 5);
    }

    // Prefer stored concise skill-level context summary from DB; fall back to summarizing raw context
    let contextSummary: string | undefined = undefined;
    if (typeof interview?.contextSummary === "string" && interview.contextSummary.trim()) {
      contextSummary = interview.contextSummary.trim();
    } else {
      const rawContext = interview?.context;
      if (typeof rawContext === "string" && rawContext.trim()) {
        const trimmed = rawContext.trim();
        try {
          const ctxSummary = await groqChat([
            { role: "system", content: "You are a concise summarizer. Return 1-2 short sentences focused on skill-level expectations." },
            { role: "user", content: buildContextSummaryPrompt(trimmed) },
          ]);
          if (ctxSummary && String(ctxSummary).trim()) {
            contextSummary = String(ctxSummary).trim();
          } else {
            contextSummary = trimmed.slice(0, 300) + "...";
          }
        } catch (e) {
          contextSummary = trimmed.slice(0, 300) + "...";
        }
      }
    }

    const sys = buildInterviewSystemPrompt({
      title: interview?.title,
      context: contextSummary,
      interviewerRole: interview?.interviewerRole,
      remainingSeconds,
      totalMinutes,
      templateStructure,
      templateSummary,
      currentSkill,
      currentSkillIndex,
      remainingForSkill,
    });

    const messages: ChatMessage[] = [];
    messages.push({ role: "system", content: sys });

    // If no history, prompt the LLM to start with one brief ice-breaker question (once)
    const hasHistory = Array.isArray(history) && history.length > 0;
    if (!hasHistory) {
      messages.push({
        role: "system",
        content:
          "Start the interview with ONE brief ice-breaker question to build rapport (e.g., 'How are you and what is your current role?'). Do not use this in subsequent prompts.",
      });
    }

    // If history is present, perform scheduled summarization to keep prompts small.
    // Summarize after every 2 user responses: when userCount is a positive multiple of 2,
    // compress older messages into a short summary and only pass recent messages.
    let recentMessages: ChatMessage[] = [];
    if (hasHistory) {
      const MAX_KEEP = 8; // fallback: keep recent 8 messages if nothing to summarize

      // Trigger summarization when we've accumulated 2,4,6... user messages
      const shouldSummarize = userCount > 0 && userCount % 2 === 0;

      if (shouldSummarize) {
        // Keep the most recent chunk (recentKeep messages) and summarize the rest
        const recentKeep = 4; // keep ~last 4 messages (2 pairs)
        const cut = Math.max(0, history.length - recentKeep);
        const older = history.slice(0, cut);
        recentMessages = history.slice(cut);
        if (older.length > 0) {
          try {
            // Summarize only the candidate's (user) responses from the older chunk to a short paragraph
            const olderUserText = older
              .filter((m) => m.role === "user")
              .map((m, i) => `- ${m.content}`)
              .join("\n");
            const summaryPrompt = `Summarize the candidate's responses below into 3-6 concise bullet points that capture the essential facts, outcomes, and any evidence useful for evaluation. Output only the bullets, no commentary.\n\n${olderUserText}`;
            const summary = await groqChat([
              { role: "system", content: "You are a concise summarizer focused on candidate answers. Return only bullets." },
              { role: "user", content: summaryPrompt },
            ]);
            if (summary && String(summary).trim()) {
              // Push as a system-level condensed memory. Do NOT include any 'system instructs' phrasing.
              messages.push({ role: "system", content: `Condensed candidate summary:\n${summary.trim()}` });
            }
          } catch (e) {
            // On error, fall back to keeping more recent messages
            recentMessages = history.slice(Math.max(0, history.length - MAX_KEEP));
          }
        }
      } else {
        recentMessages = history.slice(Math.max(0, history.length - MAX_KEEP));
      }

      // Append only the recentMessages (either recent window or recentKeep) to messages
      for (const m of recentMessages) {
        if (m?.role && m?.content) messages.push({ role: m.role, content: m.content });
      }
    }

    messages.push({ role: "user", content: buildUserMessage(userText) });

    const rawReply = await groqChat(messages);

    // Sanitize reply: remove any fabricated END_INTERVIEW tokens and sentences that claim the system ended the interview
    function sanitizeReply(text: string) {
      if (!text) return text;
      // Remove explicit END_INTERVIEW token occurrences
      let t = text.replace(/\bEND_INTERVIEW\b\.?/gi, "");
      // Split into sentences and remove sentences that mention system-ending or system instructions
      const sentences = t.match(/[^.!?\n]+[.!?\n]?/g) || [t];
      const filtered = sentences.filter((s) => {
        const low = s.toLowerCase();
        if (low.includes("end the interview") || low.includes("conclude the interview") || low.includes("concluded the") || low.includes("finish the interview") || low.includes("wrap up the interview") ) return false;
        if (low.includes("the system") && (low.includes("end") || low.includes("conclude") || low.includes("finish") || low.includes("instruct"))) return false;
        if (low.includes("system instructs") || low.includes("system instruct") || low.includes("system confirms")) return false;
        return true;
      });
      const out = filtered.join(" ").trim();
      // Collapse multiple spaces
      return out.replace(/\s+/g, " ").trim();
    }

    const reply = sanitizeReply(String(rawReply || "")).trim();
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "LLM error" });
  }
};
