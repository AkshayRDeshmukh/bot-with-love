import type { RequestHandler } from "express";
import { prisma } from "../prisma";
import {
  buildInterviewSystemPrompt,
  buildUserMessage,
} from "../prompts/interview";
import { groqChat, type ChatMessage } from "../services/llm";

export const chatWithLLM: RequestHandler = async (req, res) => {
  try {
    const {
      interviewId,
      userText,
      history,
      interview: inputInterview,
    } = (req.body || {}) as {
      interviewId?: string;
      userText?: string;
      history?: ChatMessage[];
      interview?: {
        title?: string;
        description?: string;
        context?: string;
        interviewerRole?: string;
      };
    };

    if (!userText || !userText.trim()) {
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

    const sys = buildInterviewSystemPrompt({
      title: interview?.title,
      description: interview?.description,
      context: interview?.context,
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

    // If history is long, summarize older parts to keep prompts small while preserving full history in DB
    let recentMessages: ChatMessage[] = [];
    if (Array.isArray(history) && history.length > 0) {
      const MAX_KEEP = 8; // keep recent 8 messages (approx 4 pairs)
      if (history.length > MAX_KEEP) {
        const older = history.slice(0, Math.max(0, history.length - MAX_KEEP));
        recentMessages = history.slice(Math.max(0, history.length - MAX_KEEP));
        try {
          const olderText = older
            .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
            .join("\n");
          const summaryPrompt = `Summarize the conversation below into 6-8 concise bullet points that capture the candidate's key answers and facts. Return ONLY the summary as plain text without additional commentary.\n\n${olderText}`;
          const summary = await groqChat([
            { role: "system", content: "You are a concise summarizer. Return only bullets." },
            { role: "user", content: summaryPrompt },
          ]);
          if (summary && String(summary).trim()) {
            messages.push({ role: "system", content: `Conversation summary:\n${summary.trim()}` });
          }
        } catch (e) {
          // ignore summarization errors and fall back to including recent messages only
        }
      } else {
        recentMessages = history;
      }

      for (const m of recentMessages) {
        if (m?.role && m?.content) messages.push({ role: m.role, content: m.content });
      }
    }

    messages.push({ role: "user", content: buildUserMessage(userText) });

    const reply = await groqChat(messages);
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "LLM error" });
  }
};
