"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";
import type { WearableDaySummary } from "@/lib/types";

function lbsToKg(lbs: number): number {
  return lbs / 2.2046226218;
}
import { getTodayLocal } from "@/lib/date-utils";
import { isAppleHealthSdkAvailable, requestAppleHealthSdkSync } from "@/lib/apple-health-bridge";

export function WearablesView({ onDataFetched }: { onDataFetched: (data: WearableDaySummary[]) => void }) {
  const { showToast } = useToast();
  const [ouraToken, setOuraToken] = useState("");
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [importJson, setImportJson] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [appleSdkAvailable, setAppleSdkAvailable] = useState(false);
  const [scaleWeight, setScaleWeight] = useState("");
  const [scaleBodyFat, setScaleBodyFat] = useState("");
  const [scaleDate, setScaleDate] = useState(() => getTodayLocal());
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
      const isCsv = importFile.name.toLowerCase().endsWith(".csv") || text.trim().includes(",") && /[\r\n]/.test(text);
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
        // Likely Renpho CSV paste
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

  const addManualWeight = async () => {
    const lbs = parseFloat(scaleWeight);
    if (!Number.isFinite(lbs) || lbs < 44 || lbs > 1100) {
      showToast("Enter weight in lbs (44–1100)", "info");
      return;
    }
    setLoading((l) => ({ ...l, scale: true }));
    try {
      const r = await fetch("/api/wearables/scale/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: scaleDate,
          weightKg: lbsToKg(lbs),
          bodyFatPercent: scaleBodyFat ? parseFloat(scaleBodyFat) : undefined,
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (d.data) onDataFetched(d.data);
      setScaleWeight("");
      setScaleBodyFat("");
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "Failed to add weight", "error");
    } finally {
      setLoading((l) => ({ ...l, scale: false }));
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
    <div className="space-y-10">
      <header>
        <h2 className="section-title">Connect wearables</h2>
        <p className="section-subtitle mt-0.5">
          Connect one or more devices to see steps, sleep, and heart rate on your dashboard and in your Weekly AI Review.
        </p>
      </header>

      {/* Smart scales */}
      <section>
        <h3 className="section-title !text-base mb-1">Smart &amp; Bluetooth scales</h3>
        <p className="section-subtitle mb-4">
          Log weight from any scale. <strong>Renpho</strong> — export CSV in app (Device → History → Export data), then import below. Fitbit Aria syncs via Fitbit. Withings, Eufy sync to Apple Health — import JSON.
        </p>
        <div className="card rounded-xl p-6 space-y-4">
          <h4 className="font-medium text-[var(--foreground)]">Manual entry</h4>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label text-xs">Date</label>
              <input
                type="date"
                value={scaleDate}
                onChange={(e) => setScaleDate(e.target.value.slice(0, 10))}
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="label text-xs">Weight (lbs)</label>
              <input
                type="number"
                step="0.1"
                min={44}
                max={1100}
                value={scaleWeight}
                onChange={(e) => setScaleWeight(e.target.value)}
                placeholder="e.g. 165"
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="label text-xs">Body fat % (optional)</label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={100}
                value={scaleBodyFat}
                onChange={(e) => setScaleBodyFat(e.target.value)}
                placeholder="e.g. 18"
                className="input-base w-full"
              />
            </div>
          </div>
          <button onClick={addManualWeight} disabled={loading.scale || !scaleWeight.trim()} className="btn-primary text-sm disabled:opacity-50">
            {loading.scale ? "Adding…" : "Add weight"}
          </button>
        </div>
      </section>

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
            <p className="mb-3 text-sm text-[var(--muted)]">Upload .json (Apple Health / Health Connect) or .csv (Renpho: Device → History → Export data).</p>
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="block w-full max-w-xs text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface-elevated)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--foreground)]"
              />
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder='Or paste JSON or Renpho CSV (Device → History → Export data)'
                rows={3}
                className="input-base w-full rounded-lg px-3 py-2 font-mono text-sm resize-y min-h-[80px]"
              />
              <button onClick={importHealth} disabled={loading.import} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">Import</button>
              {importSuccess && <p className="text-sm font-medium text-[var(--accent)]">{importSuccess}</p>}
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
