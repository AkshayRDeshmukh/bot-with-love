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
    "Given the JSON structure of an interview report template, produce a VERY concise summary suitable for LLM prompts.",
    "Requirements:",
    "- Return ONLY 3-6 bullet points, each starting with '-' and no extra explanation.",
    "- Each bullet must be short (preferably <= 100 characters) and focused on what information the template captures and how it should guide questioning.",
    "- Mention key parameters or categories and any notable scales or weights if relevant.",
    "- Avoid including the full JSON or long descriptions.",
    "Template JSON:",
    json,
  ].join("\n\n");
}
