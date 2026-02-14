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
      <h2 className="text-2xl font-bold">Connect wearables</h2>
      <p className="text-[var(--muted)]">Sync activity, sleep, and heart rate from Oura, Fitbit, Apple Watch, and Android watches.</p>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="card rounded-xl p-6">
          <h3 className="mb-3 font-semibold text-[var(--accent-terracotta)]">Oura Ring</h3>
          <p className="mb-3 text-sm text-[var(--muted)]">Get a Personal Access Token from cloud.ouraring.com</p>
          <input
            type="password"
            value={ouraToken}
            onChange={(e) => setOuraToken(e.target.value)}
            placeholder="Oura token"
            className="mb-2 w-full input-base rounded-lg px-3 py-2 text-sm text-[var(--foreground)]"
          />
          <div className="flex gap-2">
            <button onClick={connectOura} disabled={loading.oura || !ouraToken} className="btn-primary px-3 py-1 text-sm disabled:opacity-50">Connect</button>
            <button onClick={fetchOura} disabled={loading.ouraFetch} className="btn-secondary px-3 py-1 text-sm disabled:opacity-50">Fetch data</button>
          </div>
        </div>

        <div className="card rounded-xl p-6">
          <h3 className="mb-3 font-semibold text-[var(--accent)]">Fitbit & compatible</h3>
          <p className="mb-3 text-sm text-[var(--muted)]">Fitbit trackers and watches. Many Android watches sync via Fitbit app.</p>
          <a href="/api/wearables/fitbit/auth" className="btn-primary inline-block px-4 py-2 text-sm">Connect Fitbit (OAuth)</a>
          <button onClick={fetchFitbit} disabled={loading.fitbitFetch} className="btn-secondary ml-2 px-3 py-1 text-sm disabled:opacity-50">Fetch data</button>
        </div>

        <div className="rounded-xl card p-6 sm:col-span-2">
          <h3 className="mb-3 font-semibold text-[var(--accent-warm)]">Apple Watch & Health Connect</h3>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Sync directly from an iOS HealthKit bridge app, or import exported JSON from Apple Health / Health Connect.
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              onClick={syncAppleHealthSdk}
              disabled={loading.appleSdk || !appleSdkAvailable}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
            >
              {loading.appleSdk ? "Syncing Apple Health..." : "Sync Apple Health (SDK)"}
            </button>
            <span className="text-xs text-[var(--muted)]">
              {appleSdkAvailable
                ? "HealthKit bridge detected in iOS app"
                : "SDK bridge not detected in browser (JSON import still works)"}
            </span>
          </div>
          <input type="file" accept=".json" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} className="mb-2 text-sm text-[var(--muted)]" />
          <textarea value={importJson} onChange={(e) => setImportJson(e.target.value)} placeholder='Paste JSON: {"data": [{"date": "2025-02-10", "steps": 5000, ...}]}' rows={4} className="input-base mb-2 w-full px-3 py-2 font-mono text-sm" />
          <button onClick={importHealth} disabled={loading.import} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">Import</button>
        </div>

        <div className="rounded-xl card p-6 sm:col-span-2">
          <h3 className="mb-2 font-semibold text-[var(--accent-slate)]">Garmin & Android watches</h3>
          <p className="text-sm text-[var(--muted)]">Garmin: Requires Garmin Health API access. Android/Health Connect: Export via compatible apps or use Fitbit if your watch syncs there.</p>
          <a href="https://developer.garmin.com/gc-developer-program/health-api/" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-[var(--accent-slate)] hover:underline">Garmin Developer Portal →</a>
        </div>
      </div>
    </div>
  );
}
