export function buildInterviewSystemPrompt(input: {
  title?: string;
  context?: string;
  interviewerRole?: string;
  remainingSeconds?: number;
  totalMinutes?: number;
  templateStructure?: unknown;
  templateSummary?: string[];
  currentSkill?: string;
  currentSkillIndex?: number;
  remainingForSkill?: number;
}) {
  const {
    title,
    context,
    interviewerRole,
    remainingSeconds,
    totalMinutes,
    templateStructure,
    templateSummary,
    currentSkill,
    currentSkillIndex,
    remainingForSkill,
  } = input || {};
  const timeGuidance = (() => {
    if (typeof remainingSeconds !== "number" || remainingSeconds < 0) return [] as string[];
    const parts: string[] = [];
    parts.push(`Time: ${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s remaining${totalMinutes ? ` (total: ${totalMinutes}m)` : ""}.`);
    const isEndingSoon = remainingSeconds <= 60;
    if (isEndingSoon) {
      parts.push(`Remaining time is <= 60s: ask ONE concise closing question, summarize a key takeaway, and conclude.`);
    } else {
      parts.push(`Keep questions focused and sized to fit the remaining time.`);
    }
    return parts;
  })();

  const templateSection = (() => {
    if (Array.isArray(templateSummary) && templateSummary.length > 0) {
      const list = templateSummary.map((s, i) => `${i + 1}. ${s}`).join("\n");
      const focusLine = currentSkill
        ? `Focus now on: ${currentSkill} (skill ${Number(currentSkillIndex ?? 0) + 1} of ${templateSummary.length}). Ask questions to elicit evidence for this skill. Remaining questions for this skill: ${remainingForSkill ?? 5}.`
        : "Focus on the listed skill areas, one at a time, in order.";
      return [
        `Interview Report Skill Areas (priority order):`,
        list,
        focusLine,
        `The system will decide when to move to the next skill. Do NOT switch skills unless the system indicates the next skill index.`,
        `CRITICAL: Never end, conclude, or announce completion of the interview unless the system sends an EXACT single token message: END_INTERVIEW (system role). Under no circumstances should you produce or fabricate this token or claim the system instructed you to end. Continue asking focused questions until you receive that exact system token.`,
      ].join("\n");
    }
    if (templateStructure == null) return null;
    try {
      const json = JSON.stringify(templateStructure, null, 2);
      return [
        `Interview Report Structure (JSON):`,
        json,
        `Use this structure to guide your questioning. Ensure questions elicit information needed to populate each field.`,
      ].join("\n");
    } catch {
      return null;
    }
  })();

  return [
    `You are an expert, friendly interview bot. Keep responses concise (1-3 sentences) and ask one question at a time.`,
    title ? `Interview Title: ${title}` : null,
    context ? `Context: ${context}` : null,
    interviewerRole ? `Interviewer Role: ${interviewerRole}` : null,
    templateSection,
    ...timeGuidance,
    `Guidelines: be supportive, avoid jargon unless asked, stay on topic, and probe for specifics with examples.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUserMessage(userText: string) {
  return userText?.trim() || "";
}

export function buildContextSummaryPrompt(context: string) {
  const trimmed = (context || "").trim();
  return [
    "You are an expert interviewer prompt engineer. Read the interview context and produce a concise plain-English summary describing what the interviewer expects from the candidate.",
    "Requirements:",
    "- Return 2-3 short sentences (total <= 300 characters) in plain English.",
    "- Focus on: the key skill areas to assess, expected outcomes / deliverables from the candidate, and any constraints or priorities.",
    "- Do NOT list or output the original context verbatim or as JSON. Avoid extraneous background details.",
    "- Output should be a compact narrative that can be used directly in an LLM system prompt.",
    "Context:",
    trimmed,
  ].join("\n\n");
}
