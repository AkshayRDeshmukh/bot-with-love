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
  candidateName?: string;
  candidateYears?: number;
  candidateDomain?: string;
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
    candidateName,
    candidateYears,
    candidateDomain,
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

  const candidateSection = (() => {
    if (candidateName || candidateYears || candidateDomain) {
      const parts: string[] = [];
      const namePart = candidateName ? `Name: ${candidateName}` : null;
      const yearsPart = typeof candidateYears === "number" ? `Experience: ${candidateYears} years` : null;
      const domainPart = candidateDomain ? `Domain: ${candidateDomain}` : null;
      if (namePart) parts.push(namePart);
      if (yearsPart) parts.push(yearsPart);
      if (domainPart) parts.push(domainPart);
      parts.push("Use the candidate's name once in a natural greeting; avoid repeating it.");
      return [`Candidate Profile:`, parts.filter(Boolean).join("; ")].join("\n");
    }
    return null;
  })();

  const templateSection = (() => {
    if (Array.isArray(templateSummary) && templateSummary.length > 0) {
      const focusLine = currentSkill
        ? `Focus now on: ${currentSkill} (skill ${Number(currentSkillIndex ?? 0) + 1} of ${templateSummary.length}). Ask questions to elicit evidence for this skill. Remaining questions for this skill: ${remainingForSkill ?? 5}.`
        : "Focus on the next skill area according to system guidance.";
      return [
        `Interview Report Skill Area (current focus):`,
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
    candidateSection,
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

export function buildContextDomainPrompt(context: string) {
  const trimmed = (context || "").trim();
  return [
    "You are a domain classifier. Read the interview context and return a single short domain label that best describes the domain/specialization required (e.g., 'backend', 'frontend', 'datascience', 'devops', 'product', 'mobile', 'security').",
    "Requirements:",
    "- Return ONLY a single short label (1-3 words) in lowercase, no punctuation, no explanation.",
    "- If multiple domains apply, choose the primary/most relevant one.",
    "Context:",
    trimmed,
  ].join("\n\n");
}
