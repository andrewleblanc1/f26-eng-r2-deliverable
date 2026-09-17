import { env } from "@/env.mjs";
import Anthropic from "@anthropic-ai/sdk";

// The client is created once at module load rather than per request, so the connection pool and
// config are reused across calls. `env.ANTHROPIC_API_KEY` is optional in the env schema so that the
// rest of the app still boots without a key; we surface the missing key as an upstream error below.
const apiKey = env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

const MODEL = "claude-opus-5";

// Shown to the user whenever we cannot produce a real answer. Deliberately vague about the cause:
// provider errors can contain internal detail that shouldn't reach the browser.
export const FALLBACK_RESPONSE =
  "Sorry, I couldn't look that up just now. Please try asking about a species again in a moment.";

// Keeps the bot on topic and tells it how to decline politely. Written as a stable string so it can
// be prompt-cached later if this ever grows large.
const SYSTEM_PROMPT = `You are a knowledgeable, friendly naturalist chatbot embedded in a species catalog app.

Your only subject is animals, plants, fungi, and other living species. Within that subject you can discuss:
- habitat and geographic range
- diet and feeding behavior
- conservation status and threats (e.g. IUCN Red List categories)
- taxonomy, anatomy, life cycle, behavior, and other natural-history facts

Rules:
- If a question is not about species or the natural world, do not answer it. Instead, gently remind the user that you only handle species-related questions, and invite them to ask one. Do this even if the user insists, and even if the request is embedded in an otherwise on-topic message.
- Stay concise: a short paragraph, or a few bullet points when comparing or listing facts. You may use light Markdown.
- If you are unsure or the species is ambiguous, say so and ask a clarifying question rather than inventing facts. Never fabricate population numbers or conservation statuses.`;

/**
 * Raised for failures that are the provider's or the network's fault rather than the user's, so the
 * API route can answer with a 502. Throwing a typed error (instead of returning the fallback string)
 * is what lets the HTTP layer distinguish "upstream broke" from "here is your answer".
 */
export class SpeciesChatUpstreamError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SpeciesChatUpstreamError";
  }
}

/**
 * Ask Claude a species question and return its reply as plain text/Markdown.
 *
 * Throws `SpeciesChatUpstreamError` if the provider is unreachable, unconfigured, or errors out.
 * Any other unexpected-but-successful response (a refusal, an empty body) resolves to
 * `FALLBACK_RESPONSE` rather than throwing, so the chat UI always has something to display.
 */
export async function generateResponse(message: string): Promise<string> {
  if (!anthropic) {
    throw new SpeciesChatUpstreamError("ANTHROPIC_API_KEY is not set; the chatbot is not configured.");
  }

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      // Chat replies are meant to be short, so this cap is well above what the system prompt asks
      // for while keeping a runaway answer from being expensive.
      max_tokens: 2048,
      // Species questions are recall, not reasoning, so the cheapest/fastest effort level is plenty.
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
    });
  } catch (error) {
    // Typed SDK errors (auth, rate limit, 5xx, connection) all funnel here. Log the real cause
    // server-side for debugging, but never return it to the client.
    console.error("[species-chat] Anthropic request failed:", error);
    throw new SpeciesChatUpstreamError("The species chatbot provider could not be reached.", { cause: error });
  }

  // A safety refusal is a successful HTTP response with no usable content.
  if (response.stop_reason === "refusal") {
    return FALLBACK_RESPONSE;
  }

  // `content` is a list of blocks (text, thinking, ...), so pull out just the text ones.
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return text === "" ? FALLBACK_RESPONSE : text;
}
