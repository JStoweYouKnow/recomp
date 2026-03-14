"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

export function FeedbackButton() {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!rating && !text.trim()) {
      showToast("Add a rating or some feedback text", "info");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: rating ?? undefined, text: text.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      showToast("Thanks for your feedback!", "success");
      setOpen(false);
      setRating(null);
      setText("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not send feedback", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-[var(--muted)] hover:text-[var(--accent)]"
        aria-label="Send feedback"
      >
        Send feedback
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="card max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-[var(--foreground)]">How&apos;s Refactor working for you?</h3>
            <p className="text-sm text-[var(--muted)]">Your feedback helps us improve. Family testers welcome!</p>
            <div>
              <label className="label text-xs">Rating (optional)</label>
              <div className="flex gap-2 mt-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? null : n)}
                    className={`w-9 h-9 rounded-full text-sm font-medium transition ${
                      rating === n ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-elevated)] text-[var(--muted)]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label text-xs" htmlFor="feedback-text">Comments (optional)</label>
              <textarea
                id="feedback-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What's working? What could be better?"
                className="input-base w-full mt-1 text-sm min-h-[80px] resize-y"
                maxLength={2000}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm">
                Cancel
              </button>
              <button type="button" onClick={handleSubmit} disabled={sending} className="btn-primary text-sm">
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
