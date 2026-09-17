"use client";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { useRef, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";

// Shown if the request itself fails (network down, unexpected status) so the chat never dead-ends.
const ERROR_MESSAGE = "Sorry, something went wrong reaching the chatbot. Please try again.";

export default function SpeciesChatbot() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  const [chatLog, setChatLog] = useState<{ role: "user" | "bot"; content: string }[]>([]);
  // Tracks the in-flight request so we can disable the input and avoid overlapping sends.
  const [isLoading, setIsLoading] = useState(false);

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();

    // Ignore empty/whitespace-only sends, and ignore a second send while one is in flight.
    if (trimmed === "" || isLoading) return;

    // Show the user's message immediately and clear the composer, so the UI feels responsive while
    // we wait on the API.
    setChatLog((log) => [...log, { role: "user", content: trimmed }]);
    setMessage("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      // The route returns a `response` string on success, and also on a 502 so there is something
      // readable to show. Fall back to a generic message for any other failure.
      const data = (await res.json()) as { response?: string; error?: string };
      const reply = data.response ?? ERROR_MESSAGE;

      setChatLog((log) => [...log, { role: "bot", content: reply }]);
    } catch (error) {
      console.error("Chat request failed:", error);
      setChatLog((log) => [...log, { role: "bot", content: ERROR_MESSAGE }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Enter sends the message; Shift+Enter inserts a newline.
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <>
      <TypographyH2>Species Chatbot</TypographyH2>
      <div className="mt-4 flex gap-4">
        <div className="mt-4 rounded-lg bg-foreground p-4 text-background">
          <TypographyP>
            The Species Chatbot is a feature to be implemented that is specialized to answer questions about animals.
            Ideally, it will be able to provide information on various species, including their habitat, diet,
            conservation status, and other relevant details. Any unrelated prompts will return a message to the user
            indicating that the chatbot is specialized for species-related queries only.
          </TypographyP>
          <TypographyP>
            To use the Species Chatbot, simply type your question in the input field below and hit enter. The chatbot
            will respond with the best available information.
          </TypographyP>
        </div>
      </div>
      {/* Chat UI, ChatBot to be implemented */}
      <div className="mx-auto mt-6">
        {/* Chat history */}
        <div className="h-[400px] space-y-3 overflow-y-auto rounded-lg border border-border bg-muted p-4">
          {chatLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">Start chatting about a species!</p>
          ) : (
            chatLog.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] whitespace-pre-wrap rounded-2xl p-3 text-sm ${
                    msg.role === "user"
                      ? "rounded-br-none bg-primary text-primary-foreground"
                      : "rounded-bl-none border border-border bg-foreground text-primary-foreground"
                  }`}
                >
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))
          )}
          {/* Typing indicator while we wait for the bot's reply */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[75%] rounded-2xl rounded-bl-none border border-border bg-foreground p-3 text-sm text-primary-foreground">
                Thinking...
              </div>
            </div>
          )}
        </div>
        {/* Textarea and submission */}
        <div className="mt-4 flex flex-col items-end">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
            placeholder="Ask about a species..."
            className="w-full resize-none overflow-hidden rounded border border-border bg-background p-2 text-sm text-foreground focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            // Also disabled on an empty composer so the button matches what handleSubmit will do.
            disabled={isLoading || message.trim() === ""}
            className="mt-2 rounded bg-primary px-4 py-2 text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Sending..." : "Enter"}
          </button>
        </div>
      </div>
    </>
  );
}
