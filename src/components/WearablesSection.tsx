"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";
import type { WearableDaySummary } from "@/lib/types";
import { isAppleHealthSdkAvailable, requestAppleHealthSdkSync } from "@/lib/apple-health-bridge";

export function WearablesSection({
  onDataFetched,
}: {
  onDataFetched: (data: WearableDaySummary[]) => void;
}) {
  const { showToast } = useToast();
  const [ouraToken, setOuraToken] = useState("");
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [importJson, setImportJson] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [appleSdkAvailable, setAppleSdkAvailable] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAppleSdkAvailable(isAppleHealthSdkAvailable());
  }, []);

  const connectOura = async () => {
    setLoading((l) => ({ ...l, oura: true }));
    try {
      const r = await fetch("/api/wearables/oura/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ouraToken }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setOuraToken("");
    } finally {
      setLoading((l) => ({ ...l, oura: false }));
    }
  };

  const fetchOura = async () => {
    setLoading((l) => ({ ...l, ouraFetch: true }));
    try {
      const r = await fetch("/api/wearables/oura/data");
      const d = await r.json();
      if (d.data) onDataFetched(d.data);
    } finally {
      setLoading((l) => ({ ...l, ouraFetch: false }));
    }
  };

  const fetchFitbit = async () => {
    setLoading((l) => ({ ...l, fitbitFetch: true }));
    try {
      const r = await fetch("/api/wearables/fitbit/data");
      const d = await r.json();
      if (d.data) onDataFetched(d.data);
    } finally {
      setLoading((l) => ({ ...l, fitbitFetch: false }));
    }
  };

  const importHealth = async () => {
    let body: Record<string, unknown> | unknown;
    if (importFile) {
      const text = await importFile.text();
      const isCsv = importFile.name.toLowerCase().endsWith(".csv") || (text.trim().includes(",") && /[\r\n]/.test(text));
      if (isCsv) {
        body = { csv: text };
      } else {
        body = JSON.parse(text);
      }
    } else if (importJson.trim()) {
      const s = importJson.trim();
      try {
        body = JSON.parse(s);
      } catch {
        body = { csv: s };
      }
    } else return;
    setLoading((l) => ({ ...l, import: true }));
    setImportSuccess(null);
    try {
      const r = await fetch("/api/wearables/health/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (d.data) {
        onDataFetched(d.data);
        const count = d.count ?? d.data?.length ?? 0;
        setImportSuccess(`Imported ${count} day${count === 1 ? "" : "s"} successfully`);
        setImportFile(null);
        setImportJson("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        setTimeout(() => setImportSuccess(null), 4000);
      }
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "Import failed", "error");
    } finally {
      setLoading((l) => ({ ...l, import: false }));
    }
  };

  const syncAppleHealthSdk = async () => {
    setLoading((l) => ({ ...l, appleSdk: true }));
    try {
      const payload = await requestAppleHealthSdkSync();
      const r = await fetch("/api/wearables/apple/healthkit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (d.data) onDataFetched(d.data);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Apple Health sync failed";
      showToast(msg, "error");
    } finally {
      setLoading((l) => ({ ...l, appleSdk: false }));
      setAppleSdkAvailable(isAppleHealthSdkAvailable());
    }
  };

  return (
    <div className="card p-6 mt-6">
      <h3 className="font-semibold text-[var(--foreground)] mb-1">Connect wearables</h3>
      <p className="text-sm text-[var(--muted)] mb-4">
        Connect Oura, Fitbit, or import from Apple Health / Renpho / Health Connect. Data appears on your dashboard and in Measurements.
      </p>

      <div className="grid gap-6 sm:grid-cols-2 mb-6">
        <div className="rounded-xl border border-[var(--border-soft)] p-4">
          <h4 className="mb-2 font-medium text-[var(--accent-terracotta)]">Oura Ring</h4>
          <p className="mb-3 text-sm text-[var(--muted)]">Get a Personal Access Token from cloud.ouraring.com</p>
          <input
            type="password"
            value={ouraToken}
            onChange={(e) => setOuraToken(e.target.value)}
            placeholder="Oura token"
            className="mb-2 w-full input-base rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={connectOura} disabled={loading.oura || !ouraToken} className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50">Connect</button>
            <button onClick={fetchOura} disabled={loading.ouraFetch} className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50">Fetch data</button>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-soft)] p-4">
          <h4 className="mb-2 font-medium text-[var(--accent)]">Fitbit & compatible</h4>
          <p className="mb-3 text-sm text-[var(--muted)]">Fitbit trackers, many Android watches via Fitbit app.</p>
          <div className="flex gap-2">
            <a href="/api/wearables/fitbit/auth" className="btn-primary inline-flex px-3 py-1.5 text-sm">Connect Fitbit</a>
            <button onClick={fetchFitbit} disabled={loading.fitbitFetch} className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50">Fetch data</button>
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t border-[var(--border-soft)]">
        <h4 className="font-medium text-[var(--foreground)]">Apple Watch & Health Connect</h4>
        <p className="text-sm text-[var(--muted)]">Sync from iOS app or import exported JSON/CSV (Renpho: Device → History → Export).</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={syncAppleHealthSdk}
            disabled={loading.appleSdk || !appleSdkAvailable}
            className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {loading.appleSdk ? "Syncing…" : "Sync Apple Health (SDK)"}
          </button>
          <span className="text-xs text-[var(--muted)]">{appleSdkAvailable ? "Bridge detected" : "Use import below"}</span>
        </div>
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            className="block text-sm text-[var(--muted)] file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--surface-elevated)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <div className="flex flex-wrap items-end gap-2">
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Or paste JSON / Renpho CSV"
              rows={2}
              className="input-base flex-1 min-w-[200px] rounded-lg px-3 py-2 font-mono text-sm resize-y"
            />
            <button onClick={importHealth} disabled={loading.import} className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50">Import</button>
          </div>
          {importSuccess && <span className="text-sm font-medium text-[var(--accent)]">{importSuccess}</span>}
        </div>
      </div>

      <p className="mt-4 pt-4 border-t border-[var(--border-soft)] text-xs text-[var(--muted)]">
        <strong>Garmin</strong> — Health API required. <strong>Android / Health Connect</strong> — Export or use Fitbit if your watch syncs there.
      </p>
    </div>
  );
}
