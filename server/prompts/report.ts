export function buildReportTemplatePrompt(input: {
  title?: string;
  description?: string;
  context?: string;
  interviewerRole?: string;
}) {
  const { title, description, context, interviewerRole } = input || {};
  const parts: string[] = [];
  parts.push(
    "You are an expert technical hiring assistant. Generate an interview evaluation template as strict JSON.",
  );
  parts.push(
    "The template must include a set of evaluation parameters tailored to the role and context, with default weight percentages and rating scales.",
  );
  parts.push(
    'Return ONLY valid JSON with this exact shape: { "parameters": [ { "id": string, "name": string, "description": string, "weight": number, "scale": { "type": "1-5"|"percentage"|"stars", "min": number, "max": number } } ], "includeOverall": boolean, "includeSkillLevels": boolean }.',
  );
  parts.push("- parameters.weight should sum to 100 across all parameters.");
  parts.push(
    "- Include soft skills (e.g., communication, empathy), problem solving, and role-specific technical skills.",
  );
  parts.push(
    "- Prefer 1-5 scale for most parameters; use percentage for overall if included.",
  );
  parts.push("- Generate 6-10 parameters depending on the role complexity.");
  parts.push("Role: " + (interviewerRole || ""));
  parts.push("Title: " + (title || ""));
  parts.push("Context: " + (context || ""));
  if (description) parts.push("Description: " + description);
  return parts.join("\n");
}

export function buildTemplateSummaryPrompt(structure: any) {
  // structure is expected to be a normalized template object with parameters array
  const json = JSON.stringify(structure || {}, null, 2);
  return [
    "You are a concise summarizer for interview report templates.",
    "Given the JSON structure of an interview report template, produce a VERY concise JSON array of skill area strings suitable for guiding an interview LLM.",
    "Requirements:",
    "- Return ONLY valid JSON: an array of strings, e.g. [\"System Design\", \"Algorithms\", \"Communication\"]",
    "- Return between 3 and 8 skill areas.",
    "- Each skill area should be short (<= 40 characters) and represent a testable skill or category.",
    "- Order skills by priority (most important first).",
    "Template JSON:",
    json,
  ].join("\n\n");
}
