import { useState, useRef, useEffect } from "react";
import { Icon } from "../layout/AppShell";

const SUGGESTIONS = [
  { icon: "trending_up", label: "What's the match rate?", q: "what's the match rate?" },
  { icon: "flag", label: "Which records were escalated?", q: "which records were escalated?" },
  { icon: "content_copy", label: "Any duplicates?", q: "were there any duplicates?" },
  { icon: "gavel", label: "Any policy overrides?", q: "were any auto-resolves overridden by policy?" },
];

export default function QaPage({ batch, history, question, setQuestion, onAsk, asking }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, asking]);

  if (!batch) {
    return (
      <div className="pt-md">
        <p className="text-on-surface-variant font-body-md text-body-md">
          No batch run yet. Head to Dashboard to run one, then come back to ask about it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] md:h-[calc(100vh-96px)] -mx-margin-mobile md:-mx-margin-desktop">
      <div ref={scrollRef} className="flex-1 overflow-y-auto chat-scroll px-margin-mobile md:px-margin-desktop py-md flex flex-col gap-lg">
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 text-center gap-sm text-on-surface-variant">
            <Icon name="chat_bubble" className="text-4xl opacity-40" />
            <p className="text-body-md font-body-md max-w-xs">
              Ask anything about this batch's {batch.counts.matched} matches and {batch.counts.exceptions} exceptions.
            </p>
          </div>
        )}

        {history.map((h, i) => (
          <div key={i} className="flex flex-col gap-md">
            <div className="flex flex-col items-end gap-sm w-full">
              <div className="bg-primary text-on-primary rounded-2xl rounded-tr-none px-md py-sm max-w-[85%] md:max-w-[70%] shadow-sm">
                <p className="text-body-lg font-body-lg">{h.question}</p>
              </div>
            </div>
            <div className="flex flex-col items-start gap-sm w-full">
              <div className="flex items-center gap-sm mb-xs">
                <div className="w-6 h-6 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
                  <Icon name="smart_toy" className="text-[14px]" />
                </div>
                <span className="text-body-sm font-body-sm text-on-surface-variant">
                  ReconAgent AI · via {h.method || "…"}
                </span>
              </div>
              <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl rounded-tl-none p-md max-w-[95%] md:max-w-[85%] shadow-sm">
                <p className="text-body-md font-body-md text-on-surface whitespace-pre-wrap">{h.answer}</p>
              </div>
            </div>
          </div>
        ))}

        {asking && (
          <div className="flex items-center gap-sm text-on-surface-variant">
            <div className="w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center">
              <Icon name="smart_toy" className="text-[14px]" />
            </div>
            <span className="text-body-sm font-body-sm animate-pulse">thinking…</span>
          </div>
        )}

        {/* Suggestion chips */}
        <div className="flex flex-wrap gap-sm mt-auto pt-lg">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.q}
              onClick={() => onAsk(s.q)}
              disabled={asking}
              className="px-md py-sm border border-outline-variant rounded-full text-body-sm font-body-sm text-on-surface hover:bg-surface-container-low transition-colors bg-surface-container-lowest shadow-sm flex items-center gap-xs disabled:opacity-50"
            >
              <Icon name={s.icon} className="text-[16px]" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-margin-mobile md:px-margin-desktop pt-sm pb-md bg-gradient-to-t from-background via-background to-transparent">
        <div className="relative max-w-[800px] mx-auto">
          <input
            className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded-full pl-lg pr-16 py-md text-body-lg font-body-lg text-on-surface shadow-sm transition-shadow"
            placeholder="Ask a question about your settlements…"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !asking && question.trim() && onAsk(question)}
          />
          <button
            onClick={() => question.trim() && onAsk(question)}
            disabled={asking || !question.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Icon name="arrow_upward" />
          </button>
        </div>
      </div>
    </div>
  );
}
