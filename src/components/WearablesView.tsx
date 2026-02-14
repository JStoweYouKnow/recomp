"use client";

import { useState, useEffect } from "react";
import type { WearableDaySummary } from "@/lib/types";
import { isAppleHealthSdkAvailable, requestAppleHealthSdkSync } from "@/lib/apple-health-bridge";

export function WearablesView({ onDataFetched }: { onDataFetched: (data: WearableDaySummary[]) => void }) {
  const [ouraToken, setOuraToken] = useState("");
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [importJson, setImportJson] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [appleSdkAvailable, setAppleSdkAvailable] = useState(false);

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
    let json: unknown;
    if (importFile) {
      json = JSON.parse(await importFile.text());
    } else if (importJson.trim()) {
      json = JSON.parse(importJson);
    } else return;
    setLoading((l) => ({ ...l, import: true }));
    try {
      const r = await fetch("/api/wearables/health/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const d = await r.json();
      if (d.data) onDataFetched(d.data);
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
      alert(msg);
    } finally {
      setLoading((l) => ({ ...l, appleSdk: false }));
      setAppleSdkAvailable(isAppleHealthSdkAvailable());
    }
  };

  return (
    <div className="space-y-10">
      <header>
        <h2 className="section-title">Connect wearables</h2>
        <p className="section-subtitle mt-0.5">
          Sync activity, sleep, and heart rate to your dashboard and Weekly AI Review.
        </p>
      </header>

      {/* Smart rings & trackers */}
      <section>
        <h3 className="section-title !text-base mb-1">Smart rings & trackers</h3>
        <p className="section-subtitle mb-4">Oura and Fitbit connect here; data appears on your dashboard after you fetch.</p>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="card rounded-xl p-6">
            <h4 className="mb-2 font-semibold text-[var(--accent-terracotta)]">Oura Ring</h4>
            <p className="mb-4 text-sm text-[var(--muted)]">Get a Personal Access Token from cloud.ouraring.com and paste it below.</p>
            <input
              type="password"
              value={ouraToken}
              onChange={(e) => setOuraToken(e.target.value)}
              placeholder="Oura token"
              className="mb-3 w-full input-base rounded-lg px-3 py-2 text-sm text-[var(--foreground)]"
            />
            <div className="flex flex-wrap gap-2">
              <button onClick={connectOura} disabled={loading.oura || !ouraToken} className="btn-primary px-3 py-2 text-sm disabled:opacity-50">Connect</button>
              <button onClick={fetchOura} disabled={loading.ouraFetch} className="btn-secondary px-3 py-2 text-sm disabled:opacity-50">Fetch data</button>
            </div>
          </div>

          <div className="card rounded-xl p-6">
            <h4 className="mb-2 font-semibold text-[var(--accent)]">Fitbit & compatible</h4>
            <p className="mb-4 text-sm text-[var(--muted)]">Fitbit trackers and watches. Many Android watches sync via the Fitbit app.</p>
            <div className="flex flex-wrap gap-2">
              <a href="/api/wearables/fitbit/auth" className="btn-primary inline-flex items-center px-4 py-2 text-sm">Connect Fitbit (OAuth)</a>
              <button onClick={fetchFitbit} disabled={loading.fitbitFetch} className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">Fetch data</button>
            </div>
          </div>
        </div>
      </section>

      {/* Apple Watch & Health Connect */}
      <section>
        <h3 className="section-title !text-base mb-1">Apple Watch & Health Connect</h3>
        <p className="section-subtitle mb-4">Sync from an iOS companion app or import exported JSON from Apple Health / Health Connect.</p>
        <div className="card rounded-xl p-6 space-y-6">
          <div>
            <h4 className="mb-2 font-medium text-[var(--foreground)]">Sync from iOS app</h4>
            <p className="mb-3 text-sm text-[var(--muted)]">If you use our iOS app with the HealthKit bridge, sync here.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={syncAppleHealthSdk}
                disabled={loading.appleSdk || !appleSdkAvailable}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
              >
                {loading.appleSdk ? "Syncing…" : "Sync Apple Health (SDK)"}
              </button>
              <span className="text-xs text-[var(--muted)]">
                {appleSdkAvailable ? "Bridge detected" : "Bridge not in browser — use import below"}
              </span>
            </div>
          </div>
          <hr className="border-[var(--border-soft)]" />
          <div>
            <h4 className="mb-2 font-medium text-[var(--foreground)]">Import from export</h4>
            <p className="mb-3 text-sm text-[var(--muted)]">Upload a .json file or paste exported Apple Health / Health Connect data.</p>
            <div className="space-y-3">
              <input
                type="file"
                accept=".json"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="block w-full max-w-xs text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface-elevated)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--foreground)]"
              />
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder='Or paste JSON: {"data": [{"date": "2025-02-10", "steps": 5000, ...}]}'
                rows={3}
                className="input-base w-full rounded-lg px-3 py-2 font-mono text-sm resize-y min-h-[80px]"
              />
              <button onClick={importHealth} disabled={loading.import} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">Import</button>
            </div>
          </div>
        </div>
      </section>

      {/* Other devices */}
      <section>
        <h3 className="section-title !text-base mb-1">Other devices</h3>
        <div className="card-flat rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--muted)]">
            <strong className="text-[var(--foreground)]">Garmin</strong> — Health API access required.{" "}
            <strong className="text-[var(--foreground)]">Android / Health Connect</strong> — Export via compatible apps or use Fitbit if your watch syncs there.
          </p>
          <a href="https://developer.garmin.com/gc-developer-program/health-api/" target="_blank" rel="noreferrer" className="text-sm font-medium text-[var(--accent-slate)] hover:underline whitespace-nowrap">Garmin Developer Portal →</a>
        </div>
      </section>
    </div>
  );
}
