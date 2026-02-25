"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { segmentPersonFromPhoto } from "@/lib/body-segmentation";
import type { UserProfile } from "@/lib/types";

export function TransformationPreview({
  profile,
  onProfileUpdate,
}: {
  profile: UserProfile;
  onProfileUpdate: (p: UserProfile) => void;
}) {
  const { showToast } = useToast();
  const [fullBodyPhotoLoading, setFullBodyPhotoLoading] = useState(false);
  const [goalPhotoLoading, setGoalPhotoLoading] = useState(false);

  const handleFullBodyPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setFullBodyPhotoLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("Failed to read file"));
        r.readAsDataURL(file);
      });
      const segmented = await segmentPersonFromPhoto(dataUrl);
      onProfileUpdate({ ...profile, fullBodyPhotoDataUrl: segmented, goalPhotoDataUrl: undefined });
    } catch (err) {
      console.error("Full body photo error:", err);
      showToast(err instanceof Error ? err.message : "Photo processing failed. Try a different image (JPEG or PNG).", "error");
    } finally {
      setFullBodyPhotoLoading(false);
      e.target.value = "";
    }
  };

  const handleGenerateAfterImage = async () => {
    const photoUrl = profile.fullBodyPhotoDataUrl;
    if (!photoUrl) return;
    setGoalPhotoLoading(true);
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas not available"));
          ctx.fillStyle = "#f5f5f5";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = photoUrl;
      });

      const res = await fetch("/api/images/after", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, goal: profile.goal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      if (data.image) {
        onProfileUpdate({ ...profile, goalPhotoDataUrl: data.image });
      }
    } catch (err) {
      console.error("After image error:", err);
      showToast(err instanceof Error ? err.message : "Failed to generate after image. Try again.", "error");
    } finally {
      setGoalPhotoLoading(false);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="section-title !text-base">See your transformation</h3>
          <p className="section-subtitle">
            Upload a full-body photo and generate an AI &quot;after&quot; image based on your goal
          </p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] mt-0.5">Powered by Nova Canvas</p>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {profile.fullBodyPhotoDataUrl ? (
          <div className="flex flex-col items-center">
            <div className="relative w-full aspect-[3/4] max-h-64 rounded-xl overflow-hidden border border-[var(--border-soft)] bg-[var(--surface-elevated)]" style={{ minHeight: 180 }}>
              <img src={profile.fullBodyPhotoDataUrl} alt="Current body photo" className="w-full h-full object-cover" />
            </div>
            <p className="mt-2 text-xs font-medium text-[var(--muted)]">You now</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border-soft)] bg-[var(--surface-elevated)] py-10 px-4 text-center min-h-[180px]">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[var(--foreground)]">Add your photo</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Upload full-body photo to generate after image</p>
            <div className="mt-3 flex flex-wrap gap-2 justify-center">
              <label className="btn-primary !text-xs cursor-pointer">
                <input type="file" accept="image/*" onChange={handleFullBodyPhotoUpload} className="sr-only" aria-label="Upload full body photo" />
                {fullBodyPhotoLoading ? "Processing..." : "Upload photo"}
              </label>
            </div>
          </div>
        )}
        {profile.goalPhotoDataUrl ? (
          <div className="flex flex-col items-center">
            <div className="relative w-full aspect-[3/4] max-h-64 rounded-xl overflow-hidden border border-[var(--accent)]/40 bg-[var(--accent)]/5" style={{ minHeight: 180 }}>
              <img src={profile.goalPhotoDataUrl} alt="AI-generated goal body" className="w-full h-full object-cover" />
              <div className="absolute top-2 right-2 rounded-full bg-[var(--accent)]/90 px-2 py-0.5 text-[10px] font-semibold text-white">Goal</div>
            </div>
            <p className="mt-2 text-xs font-medium text-[var(--muted)]">Your goal (AI-generated)</p>
          </div>
        ) : profile.fullBodyPhotoDataUrl ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5 py-10 px-4 text-center min-h-[180px]">
            <p className="text-sm font-medium text-[var(--foreground)]">Generate &quot;after&quot; image</p>
            <p className="mt-1 text-xs text-[var(--muted)]">AI will transform your photo based on goal: {profile.goal.replace(/_/g, " ")}</p>
            <button onClick={handleGenerateAfterImage} disabled={goalPhotoLoading} className="btn-primary mt-3 !text-xs">
              {goalPhotoLoading ? "Generating..." : "Generate after image"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border-soft)] bg-[var(--surface-elevated)] py-10 px-4 text-center min-h-[180px]">
            <p className="text-sm font-medium text-[var(--foreground)]">Upload a photo</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Add a full-body photo to generate your AI &quot;after&quot; image</p>
            <p className="mt-2 text-xs text-[var(--muted)]">Goal: {profile.goal.replace(/_/g, " ")}</p>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="btn-secondary !text-xs cursor-pointer">
          <input type="file" accept="image/*" onChange={handleFullBodyPhotoUpload} className="sr-only" aria-label="Upload or replace body photo" />
          {fullBodyPhotoLoading ? "Processing..." : profile.fullBodyPhotoDataUrl ? "Replace body photo" : "Upload full body photo"}
        </label>
        {profile.fullBodyPhotoDataUrl && profile.goalPhotoDataUrl && (
          <button onClick={handleGenerateAfterImage} disabled={goalPhotoLoading} className="btn-secondary !text-xs">
            {goalPhotoLoading ? "Regenerating..." : "Regenerate after"}
          </button>
        )}
        {profile.fullBodyPhotoDataUrl && (
          <button onClick={() => onProfileUpdate({ ...profile, fullBodyPhotoDataUrl: undefined, goalPhotoDataUrl: undefined })} className="text-xs text-[var(--muted)] hover:text-[var(--accent-terracotta)]">
            Remove photo
          </button>
        )}
        <span className="text-caption text-[var(--muted)]">
          {profile.fullBodyPhotoDataUrl && profile.goalPhotoDataUrl ? "Right: AI-generated after image based on your goal" : !profile.fullBodyPhotoDataUrl && `Goal: ${profile.goal.replace(/_/g, " ")}`}
        </span>
      </div>
    </div>
  );
}
