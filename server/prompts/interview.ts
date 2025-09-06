export function buildInterviewSystemPrompt(input: {
  title?: string;
  description?: string;
  context?: string;
  interviewerRole?: string;
  remainingSeconds?: number;
  totalMinutes?: number;
  templateStructure?: unknown;
}) {
  const {
    title,
    description,
    context,
    interviewerRole,
    remainingSeconds,
    totalMinutes,
    templateStructure,
  } = input || {};
  const timeGuidance =
    typeof remainingSeconds === "number" && remainingSeconds >= 0
      ? [
          `Time: ${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s remaining${totalMinutes ? ` (total: ${totalMinutes}m)` : ""}.`,
          `If remaining time <= 60s: ask ONE concise closing question, summarize a key takeaway, and conclude.`,
          `Otherwise: keep questions focused and sized to fit the remaining time.`,
        ]
      : [];

  const templateSection = (() => {
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
    description ? `Description: ${description}` : null,
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
