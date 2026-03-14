"use client";

import { useState, useCallback } from "react";

interface FeatureStatus {
  name: string;
  key: string;
  novaModel: string;
  description: string;
}

const NOVA_FEATURES: FeatureStatus[] = [
  { name: "Nova Lite", key: "planGeneration", novaModel: "Text & Vision", description: "Plan generation, meal suggestions, coaching" },
  { name: "Nova Sonic", key: "voice", novaModel: "Speech-to-Speech", description: "Bidirectional voice coach (Reco)" },
  { name: "Nova Canvas", key: "canvas", novaModel: "Image Generation", description: "AI meal inspiration images" },
  { name: "Nova Reel", key: "reelVideo", novaModel: "Video Generation", description: "Motivational workout clips" },
  { name: "Nova Act", key: "actGrocery", novaModel: "Browser Agent", description: "Amazon grocery product search" },
  { name: "Nova Embeddings", key: "embeddings", novaModel: "Multimodal Embeddings", description: "Similar meal re-log suggestions" },
  { name: "Web Grounding", key: "webGrounding", novaModel: "Grounded Search", description: "USDA-backed nutrition research" },
  { name: "Extended Thinking", key: "extendedThinking", novaModel: "Reasoning", description: "Deep plan generation reasoning" },
];

type StatusLevel = "live" | "fallback" | "disabled" | "unknown";

function statusColor(status: StatusLevel): string {
  switch (status) {
    case "live": return "bg-emerald-500";
    case "fallback": return "bg-amber-400";
    case "disabled": return "bg-red-400";
    default: return "bg-gray-400";
  }
}

function statusLabel(status: StatusLevel): string {
  switch (status) {
    case "live": return "Live";
    case "fallback": return "Fallback";
    case "disabled": return "Off";
    default: return "Unknown";
  }
}

export function NovaStatusCard() {
  const [statuses, setStatuses] = useState<Record<string, StatusLevel>>({});
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/judge/health");
      if (!res.ok) throw new Error("Health check failed");
      const data = await res.json();
      const features = data.features ?? {};
      const map: Record<string, StatusLevel> = {};
      // Map API features to our display keys
      for (const f of NOVA_FEATURES) {
        if (features[f.key]) {
          map[f.key] = features[f.key] as StatusLevel;
        } else if (f.key === "canvas" || f.key === "embeddings" || f.key === "webGrounding" || f.key === "extendedThinking") {
          // These features are live if Bedrock is configured (planGeneration is live)
          map[f.key] = features.planGeneration === "live" ? "live" : "disabled";
        } else {
          map[f.key] = "unknown";
        }
      }
      setStatuses(map);
      setLastChecked(new Date().toLocaleTimeString());
    } catch {
      // Mark all unknown on failure
      const map: Record<string, StatusLevel> = {};
      for (const f of NOVA_FEATURES) map[f.key] = "unknown";
      setStatuses(map);
      setLastChecked("failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const hasChecked = Object.keys(statuses).length > 0;
  const liveCount = Object.values(statuses).filter((s) => s === "live").length;

  return (
    <div className="card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          </span>
          <h3 className="font-semibold text-sm">Nova AI Features</h3>
          {hasChecked && (
            <span className="badge badge-muted text-[10px]">
              {liveCount}/{NOVA_FEATURES.length} live
            </span>
          )}
        </div>
        <button
          onClick={checkStatus}
          disabled={loading}
          className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-elevated)] disabled:opacity-50 transition"
        >
          {loading ? "Checking..." : hasChecked ? "Refresh" : "Check status"}
        </button>
      </div>

      <p className="text-xs text-[var(--muted)] mb-3">
        8 Amazon Nova models power Refactor. Check live connectivity to AWS Bedrock and external services.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {NOVA_FEATURES.map((f) => {
          const status = statuses[f.key] ?? (hasChecked ? "unknown" : undefined);
          return (
            <div
              key={f.key}
              className="flex items-center gap-2 rounded-lg bg-[var(--surface-elevated)] px-3 py-2"
            >
              <span
                className={`h-2 w-2 rounded-full flex-shrink-0 ${status ? statusColor(status) : "bg-gray-300"}`}
                aria-label={status ? statusLabel(status) : "Not checked"}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{f.name}</p>
                <p className="text-[10px] text-[var(--muted)] truncate">{f.description}</p>
              </div>
              {status && (
                <span className={`text-[10px] font-medium flex-shrink-0 ${
                  status === "live" ? "text-emerald-600" : status === "fallback" ? "text-amber-600" : "text-[var(--muted)]"
                }`}>
                  {statusLabel(status)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {lastChecked && (
        <p className="text-[10px] text-[var(--muted)] mt-2 text-right">
          Last checked: {lastChecked}
        </p>
      )}
    </div>
  );
}
