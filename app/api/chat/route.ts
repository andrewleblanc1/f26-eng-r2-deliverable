import { FALLBACK_RESPONSE, generateResponse, SpeciesChatUpstreamError } from "@/lib/services/species-chat";
import { NextResponse } from "next/server";
import { z } from "zod";

// Validate the request body with zod, mirroring how the species forms validate their input.
// A message that is missing, not a string, empty, or only whitespace is a client error.
const chatRequestSchema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty.").max(2000, "Message is too long."),
});

export async function POST(request: Request) {
  // A malformed or absent JSON body throws here, which is a 400 rather than a server fault.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Expected a body of the form { message: string }." },
      { status: 400 },
    );
  }

  try {
    const response = await generateResponse(parsed.data.message);
    return NextResponse.json({ response });
  } catch (error) {
    if (error instanceof SpeciesChatUpstreamError) {
      // The provider failed, not the caller. Return the safe fallback text alongside the 502 so the
      // UI can render something readable even if it only looks at `response`.
      console.error("[api/chat] Upstream failure:", error.message);
      return NextResponse.json(
        { error: "The chatbot is temporarily unavailable.", response: FALLBACK_RESPONSE },
        { status: 502 },
      );
    }

    // Anything else is a genuine bug in our own code.
    console.error("[api/chat] Unexpected failure:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
