"use client";

import { useEffect, useRef, useState } from "react";
import { openConversationInputs, useEveAgent } from "eve/react";
import { ArrowUp, Check, LoaderCircle, RefreshCw, Sparkles, Square, X } from "lucide-react";

type Availability = { enabled: boolean; message: string };

const ideas = [
  "Give this day a little more breathing room",
  "Find a lower-cost way to enjoy this trip",
  "What should I do if my afternoon plans fall through?",
];

export function AiChat({ context, onClose }: { context: string; onClose: () => void }) {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [checking, setChecking] = useState(true);
  const [draft, setDraft] = useState("");
  const [shareContext, setShareContext] = useState(false);
  const [localError, setLocalError] = useState("");
  const [closing, setClosing] = useState(false);
  const endOfMessages = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const agent = useEveAgent({ followIdle: false });
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const resuming = agent.status === "resuming";
  const requests = openConversationInputs(agent.data).map((input) => input.request);

  async function checkAvailability(signal?: AbortSignal) {
    setChecking(true);
    try {
      const response = await fetch("/api/assistant-config", { cache: "no-store", signal });
      if (!response.ok) throw new Error("Configuration unavailable");
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("enabled" in result) || !("message" in result)) {
        throw new Error("Unexpected configuration");
      }
      setAvailability({ enabled: result.enabled === true, message: String(result.message) });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setAvailability({ enabled: false, message: "We couldn’t check the assistant connection. Try again in a moment." });
    } finally {
      if (!signal?.aborted) setChecking(false);
    }
  }

  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    void checkAvailability(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
  }, [agent.data.messages, busy, requests.length]);

  async function close() {
    setClosing(true);
    try {
      if (busy) await agent.cancel();
      onClose();
    } catch {
      setLocalError("We couldn’t stop this reply yet. Try stopping it again before closing.");
      setClosing(false);
    }
  }

  async function send() {
    const message = draft.trim();
    if (!message || !availability?.enabled || busy || resuming) return;
    setLocalError("");
    setDraft("");
    try {
      await agent.send(message, shareContext && context ? { clientContext: context } : undefined);
    } catch {
      setLocalError("The assistant couldn’t finish that reply. Please try again.");
    }
  }

  return (
    <dialog ref={dialog} className="trippin-ai" aria-labelledby="trippin-ai-title" onCancel={event=>{event.preventDefault();void close()}}>
      <header className="ai-header">
        <span className="ai-icon"><Sparkles size={19} /></span>
        <div>
          <h2 id="trippin-ai-title">A little local perspective.</h2>
          <p>Your Trippin AI companion · powered by EVE</p>
        </div>
        <button className="ai-icon-button" type="button" onClick={() => void close()} disabled={closing} aria-label="Close travel assistant">
          <X size={19} />
        </button>
      </header>

      <div className="ai-messages" aria-live="polite" aria-relevant="additions text" role="log" aria-label="Travel assistant conversation">
        {agent.data.messages.length === 0 && (
          <div className="ai-welcome">
            <span className="ai-eyebrow">MAKE ROOM FOR THE UNEXPECTED</span>
            <h3>Less planning.<br />More being there.</h3>
            <p>Work through the tradeoffs, find room in your day, or turn a change of plans into a good idea.</p>
            <div className="ai-ideas">
              {ideas.map((idea) => (
                <button key={idea} type="button" disabled={!availability?.enabled || checking} onClick={() => { setDraft(idea); composer.current?.focus(); }}>
                  <Sparkles size={14} /><span>{idea}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {agent.data.messages.map((message) => (
          <article className={`ai-message ${message.role === "user" ? "ai-user" : "ai-assistant"}`} key={message.id}>
            <span className="ai-message-label">{message.role === "user" ? "You" : "Trippin AI"}</span>
            {message.parts.map((part, index) => {
              if (part.type === "text") return <p key={part.id ?? index}>{part.text}</p>;
              if (part.type === "dynamic-tool") {
                return (
                  <span className="ai-tool" key={index}>
                    {part.state === "output-available" ? <Check size={13} /> : <Sparkles size={13} />}
                    {part.toolMetadata?.eve?.label ?? "Working through the numbers"}
                  </span>
                );
              }
              return null;
            })}
          </article>
        ))}

        {busy && <p className="ai-thinking"><LoaderCircle size={14} className="ai-spin" /> Thinking it through…</p>}
        {requests.map((request) => (
          <fieldset className="ai-request" key={request.requestId} disabled={resuming}>
            <legend>{request.kind === "tool-approval" ? "Approval required" : request.kind === "question" ? "Your choice" : "Planning session limit"}</legend>
            <p>{request.prompt}</p>
            {request.options?.map((option) => (
              <button key={option.id} type="button" onClick={() => {
                void agent.respond([{ requestId: request.requestId, optionId: option.id }]).catch(() => setLocalError("That choice couldn’t be sent. Please try again."));
              }}>{option.label}</button>
            ))}
          </fieldset>
        ))}
        <div ref={endOfMessages} />
      </div>

      {!checking && !availability?.enabled && (
        <div className="ai-availability" role="status">
          <strong>A connection away.</strong>
          <p>{availability?.message} No AI reply has been generated.</p>
          <button type="button" onClick={() => void checkAvailability()}><RefreshCw size={13} /> Check again</button>
        </div>
      )}

      {(localError || agent.error) && <p className="ai-error" role="alert">{localError || "The assistant connection was interrupted. Please try again."}</p>}

      <footer className="ai-footer">
        <label className="ai-context">
          <input type="checkbox" checked={shareContext} onChange={(event) => setShareContext(event.target.checked)} />
          <span>Share my trip plan with AI <small>City, dates, interests, and itinerary estimates</small></span>
        </label>
        <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <label className="ai-sr-only" htmlFor="trippin-ai-message">Message your travel assistant</label>
          <textarea id="trippin-ai-message" ref={composer} value={draft} maxLength={4_000} rows={2}
            disabled={checking || !availability?.enabled || busy || resuming}
            placeholder={checking ? "Checking your connection…" : "Where could the day take us?"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
            }} />
          {busy ? (
            <button className="ai-send" type="button" aria-label="Stop reply" onClick={() => void agent.cancel().catch(() => setLocalError("We couldn’t stop the reply. Try again."))}><Square size={15} fill="currentColor" /></button>
          ) : (
            <button className="ai-send" type="submit" aria-label="Send message" disabled={!draft.trim() || !availability?.enabled || checking || resuming}><ArrowUp size={20} /></button>
          )}
        </form>
        <p className="ai-note">AI can make mistakes. Verify times and prices. Avoid sensitive details. Suggestions never change your trip automatically.</p>
      </footer>

      <style jsx>{`
        .trippin-ai { position:fixed;z-index:100;right:24px;top:24px;bottom:24px;width:min(440px,calc(100vw - 48px));background:#fffef9;color:#24372e;border:1px solid #dedfd3;border-radius:22px;box-shadow:0 20px 100px #0b271c38;display:flex;flex-direction:column;overflow:hidden;font-family:inherit; }
        .ai-header { display:flex;align-items:center;gap:12px;padding:22px 20px;border-bottom:1px solid #e6e7dc; }
        .ai-icon { display:flex;align-items:center;justify-content:center;width:38px;height:38px;flex-shrink:0;background:#eaf0d9;border-radius:12px;color:#436431; }
        .ai-header h2 { font-size:16px;line-height:1.3;margin:0;font-weight:600;letter-spacing:-.3px; }
        .ai-header p { color:#7b8579;font-size:10px;margin:5px 0 0; }
        .ai-icon-button { background:transparent;border:0;padding:5px;color:#6a7468;margin-left:auto;cursor:pointer;display:flex; }
        .ai-messages { flex:1;overflow-y:auto;padding:24px 22px;overscroll-behavior:contain; }
        .ai-welcome { padding-top:15px; }
        .ai-eyebrow { color:#9a7955;font-size:9px;letter-spacing:1.8px;font-weight:600; }
        .ai-welcome h3 { font-family:Georgia,serif;font-size:37px;font-weight:400;letter-spacing:-1.2px;line-height:1.12;margin:17px 0; }
        .ai-welcome>p { color:#748071;font-size:13px;line-height:1.7;max-width:315px; }
        .ai-ideas { display:grid;gap:9px;margin-top:26px; }
        .ai-ideas button { text-align:left;display:flex;align-items:center;gap:10px;background:#f4f5ec;border:1px solid #e7e8de;color:#52634b;border-radius:11px;padding:12px;font:inherit;font-size:12px;cursor:pointer; }
        .ai-ideas button:disabled { opacity:.6;cursor:default; }
        .ai-message { margin:0 0 17px;padding:13px 15px;border-radius:13px;background:#f0f3e7; }
        .ai-user { margin-left:30px;background:#e5ecdb; }
        .ai-message-label { font-size:9px;letter-spacing:1px;text-transform:uppercase;font-weight:600;color:#7b876e; }
        .ai-message p { white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.7;margin:7px 0 0; }
        .ai-tool { display:flex;align-items:center;gap:6px;font-size:11px;color:#7a846e;padding-top:8px; }
        .ai-thinking { font-size:12px;display:flex;align-items:center;gap:7px;color:#839076; }
        .ai-availability { margin:0 20px 12px;border:1px solid #e6dcc7;background:#faf4e8;padding:13px;border-radius:11px;font-size:12px; }
        .ai-availability strong { font-weight:600; }.ai-availability p { font-size:11px;line-height:1.6;margin:5px 0; }
        .ai-availability button { display:flex;align-items:center;gap:5px;border:0;background:transparent;padding:4px 0;color:#6e7852;font:inherit;font-size:11px;cursor:pointer; }
        .ai-error { margin:0 20px 10px;color:#a04b33;font-size:12px;line-height:1.5; }
        .ai-footer { padding:16px 20px 14px;border-top:1px solid #e6e7dc; }
        .ai-context { display:flex;align-items:flex-start;gap:8px;margin-bottom:12px;font-size:11px;color:#52634b;cursor:pointer; }
        .ai-context input { accent-color:#305941;margin:2px 0 0; }.ai-context small { display:block;font-size:9px;color:#8a927f;margin-top:3px; }
        .ai-footer form { display:flex;align-items:flex-end;border:1px solid #d9decf;border-radius:12px;padding:11px;background:#f8f9f1;gap:8px; }
        .ai-footer textarea { resize:none;width:100%;background:transparent;border:0;font:inherit;font-size:12px;line-height:1.6;color:#354d39;outline:none; }.ai-footer textarea::placeholder { color:#9aA18e; }
        .ai-send { display:flex;align-items:center;justify-content:center;flex-shrink:0;border:0;border-radius:9px;background:#31593f;color:#fff;width:32px;height:32px;cursor:pointer; }.ai-send:disabled { opacity:.35;cursor:default; }
        .ai-note { color:#979d8f;font-size:9px;line-height:1.5;margin:9px 0 0; }
        .ai-request { border:1px solid #d5dcc6;border-radius:10px;font-size:12px;margin:14px 0;padding:12px; }.ai-request p { line-height:1.5; }.ai-request button { margin:3px 5px 0 0;border:1px solid #cbd5bd;border-radius:6px;background:#eef3e6;color:#3a583c;padding:6px 9px;cursor:pointer; }
        .ai-sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0; }
        .ai-spin { animation:ai-rotate 1.4s linear infinite; }@keyframes ai-rotate { to { transform:rotate(360deg); } }
        button:focus-visible,input:focus-visible { outline:2px solid #bc8d4f;outline-offset:3px; }.ai-footer form:focus-within { border-color:#75916a; }
        @media(max-width:600px) { .trippin-ai { top:10px;right:10px;bottom:10px;width:calc(100vw - 20px);border-radius:16px; }.ai-header { padding:16px; }.ai-messages { padding:18px; }.ai-footer { padding:13px 16px; }.ai-welcome h3 { font-size:32px; } }
        @media(prefers-reduced-motion:reduce) { .ai-spin { animation:none; } }
      `}</style>
    </dialog>
  );
}
