export function buildInterviewSystemPrompt(input: {
  title?: string;
  description?: string;
  context?: string;
  interviewerRole?: string;
  remainingSeconds?: number;
  totalMinutes?: number;
}) {
  const {
    title,
    description,
    context,
    interviewerRole,
    remainingSeconds,
    totalMinutes,
  } = input || {};
  const timeGuidance =
    typeof remainingSeconds === "number" && remainingSeconds >= 0
      ? [
          `Time: ${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s remaining${totalMinutes ? ` (total: ${totalMinutes}m)` : ""}.`,
          `If remaining time <= 60s: ask ONE concise closing question, summarize a key takeaway, and conclude.`,
          `Otherwise: keep questions focused and sized to fit the remaining time.`,
        ]
      : [];
  return [
    `You are an expert, friendly interview bot. Keep responses concise (1-3 sentences) and ask one question at a time.`,
    title ? `Interview Title: ${title}` : null,
    description ? `Description: ${description}` : null,
    context ? `Context: ${context}` : null,
    interviewerRole ? `Interviewer Role: ${interviewerRole}` : null,
    ...timeGuidance,
    `Guidelines: be supportive, avoid jargon unless asked, stay on topic, and probe for specifics with examples.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUserMessage(userText: string) {
  return userText?.trim() || "";
}
