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
    let templateSummary: string | undefined = undefined;
    if (interviewId) {
      const tpl = await prisma.reportTemplate.findUnique({
        where: { interviewId },
        select: { structure: true, templateSummary: true },
      });
      templateStructure = tpl?.structure;
      templateSummary = tpl?.templateSummary ?? undefined;
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
    });

    const messages: ChatMessage[] = [];
    messages.push({ role: "system", content: sys });
    if (Array.isArray(history)) {
      for (const m of history) {
        if (m?.role && m?.content)
          messages.push({ role: m.role, content: m.content });
      }
    }
    messages.push({ role: "user", content: buildUserMessage(userText) });

    const reply = await groqChat(messages);
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "LLM error" });
  }
};
