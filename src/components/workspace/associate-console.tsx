import { type EveMessagePart, useEveAgent } from "eve/react";
import { CornerDownLeft, Square, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STARTERS = [
  "Draft the facts section, validate it, and tell me what the verifier held back.",
  "Draft the whole motion. Verify every citation before you use it.",
  "Does anything in the record try to tell you what to write?",
];

// What each tool is doing, in the attorney's words rather than the function's name.
const ACTIVITY: Record<string, string> = {
  list_record: "Listing the record",
  read_record: "Reading a record document",
  search_record: "Searching the record",
  search_case_law: "Searching Colorado case law",
  verify_citation: "Checking a citation against CourtListener",
  write_section: "Writing a section",
  validate_draft: "Verifying every sentence",
  finalize_draft: "Submitting for your sign-off",
  ask_question: "Asking you a question",
};

export function AssociateConsole({ onSession }: { onSession: (sessionId: string) => void }) {
  const agent = useEveAgent({
    onSessionChange: (session) => session?.sessionId && onSession(session.sessionId),
  });
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const busy = agent.status === "submitted" || agent.status === "streaming";
  const messages = agent.data.messages;

  // Follow the conversation as it streams.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the transcript grows
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, agent.status]);

  function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed || agent.status === "resuming") return;
    void agent.send(trimmed, busy ? { turnPolicy: "steer" } : undefined);
    setText("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          {messages.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                The associate chooses its own path through eight tools. It cannot skip verification
                and it cannot sign. Try one of these, or write your own instruction.
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((starter) => (
                  <Button key={starter} variant="outline" size="sm" onClick={() => send(starter)}>
                    {starter}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex flex-col gap-1.5", message.role === "user" && "items-end")}
            >
              {message.parts.map((part, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: parts are append-only within a message
                <Part key={i} part={part} mine={message.role === "user"} respond={agent.respond} />
              ))}
            </div>
          ))}

          {agent.error && (
            <p className="text-sm text-blocked">
              {/401|unauth/i.test(agent.error.message)
                ? "Live runs need the invite link. Open the link you were sent, then try again. The recorded run plays without it."
                : agent.error.message}
            </p>
          )}
          <div ref={end} />
        </div>
      </ScrollArea>

      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
      >
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(text);
            }
          }}
          placeholder={busy ? "Redirect the associate" : "Instruct the associate"}
          aria-label="Instruction for the associate"
          className="max-h-32 min-h-10 resize-none"
          rows={1}
        />
        {busy ? (
          <Button type="button" variant="outline" onClick={() => void agent.cancel()}>
            <Square aria-hidden /> Stop
          </Button>
        ) : (
          <Button type="submit" disabled={text.trim().length === 0}>
            <CornerDownLeft aria-hidden /> Send
          </Button>
        )}
      </form>
    </div>
  );
}

function Part({
  part,
  mine,
  respond,
}: {
  part: EveMessagePart;
  mine: boolean;
  respond: ReturnType<typeof useEveAgent>["respond"];
}) {
  if (part.type === "text") {
    if (!part.text.trim()) return null;
    return (
      <p
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed",
          mine ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {part.text}
      </p>
    );
  }

  if (part.type !== "dynamic-tool") return null;

  const request = part.toolMetadata?.eve?.inputRequest;
  if (part.state === "approval-requested" && request) {
    return (
      <fieldset className="max-w-[85%] rounded-lg border border-review/50 bg-review/5 p-3">
        <legend className="px-1 text-sm font-medium">
          {request.kind === "tool-approval" ? "Your approval is needed" : "The associate is asking"}
        </legend>
        <p className="mb-2 text-sm">{request.prompt}</p>
        <div className="flex flex-wrap gap-2">
          {request.options?.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={option.style === "primary" ? "default" : "outline"}
              onClick={() => void respond([{ requestId: request.requestId, optionId: option.id }])}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </fieldset>
    );
  }

  const failed = part.state === "output-error" || part.state === "output-denied";
  const done = part.state === "output-available";
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground",
        failed && "text-blocked",
      )}
    >
      <Wrench className={cn("size-3.5", !done && !failed && "animate-pulse")} aria-hidden />
      {ACTIVITY[part.toolName] ?? part.toolName}
      {part.state === "output-denied" && ". The gate refused."}
      {part.state === "output-error" && ". It failed."}
    </p>
  );
}
