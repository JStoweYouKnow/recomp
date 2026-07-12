"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

export function ResearchCard() {
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ answer: string; source?: string; sources?: { title: string; url: string }[] | null; error?: boolean } | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult({ answer: data.answer ?? "", source: data.source, sources: data.sources });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Research failed. Try again.";
      setResult({ answer: msg, error: true });
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 space-y-3">
      <h4 className="text-sm font-semibold">Research</h4>
      <p className="text-label-lg text-[var(--muted)]">Ask a nutrition or fitness question. Uses web grounding for current evidence.</p>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="e.g. How much protein for muscle gain?"
          className="input-base flex-1 text-sm py-2"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="btn-primary text-sm py-2 px-3 disabled:opacity-50"
        >
          {loading ? "…" : "Ask"}
        </button>
      </div>
      {result && (
        <div className={`rounded-lg border p-3 text-sm animate-fade-in max-h-40 overflow-y-auto ${result.error ? "border-[var(--accent-terracotta)]/50 bg-[var(--accent-terracotta)]/5" : "border-[var(--border-soft)] bg-[var(--surface-elevated)]"}`}>
          <p className={`whitespace-pre-wrap ${result.error ? "text-[var(--accent-terracotta)]" : "text-[var(--foreground)]"}`}>
            {result.answer}
          </p>
          {result.sources && result.sources.length > 0 ? (
            <div className="mt-2 space-y-1">
              {result.sources.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-[var(--accent)] hover:underline truncate"
                >
                  {s.title || s.url}
                </a>
              ))}
            </div>
          ) : result.source ? (
            <p className="mt-2 text-label text-[var(--muted)]">Source: {result.source}</p>
          ) : null}
          {result.error && (
            <button type="button" onClick={handleSearch} className="mt-2 text-xs text-[var(--accent)] hover:underline">
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
