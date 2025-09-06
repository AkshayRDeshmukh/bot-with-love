import "dotenv/config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export async function groqChat(
  messages: ChatMessage[],
  opts?: { model?: string; temperature?: number },
) {

  messages.forEach((msg) => {
  console.log(`[${msg.role.toUpperCase()}]: ${msg.content}`);
});
  const apiKey =
    process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.GROQ_TOKEN;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts?.model || DEFAULT_MODEL,
      temperature: opts?.temperature ?? 0.3,
      messages,
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as any;
  const reply: string = json?.choices?.[0]?.message?.content ?? "";
  return reply.trim();
}
