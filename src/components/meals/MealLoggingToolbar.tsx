"use client";

/** Primary meal log button + collapsible capture tools (voice / photo / receipt / menu). */
export function MealLoggingToolbar({
  showMoreTools,
  onToggleMore,
  onShowAdd,
  onVoiceLog,
  onPhotoLog,
  onReceiptScan,
  onMenuScan,
  voiceLoading,
  photoLoading,
  receiptLoading,
  menuScanLoading,
}: {
  showMoreTools: boolean;
  onToggleMore: () => void;
  onShowAdd: () => void;
  onVoiceLog: () => void;
  onPhotoLog: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReceiptScan: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMenuScan: (e: React.ChangeEvent<HTMLInputElement>) => void;
  voiceLoading: boolean;
  photoLoading: boolean;
  receiptLoading: boolean;
  menuScanLoading: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={onShowAdd} className="btn-primary">
          + Log a meal
        </button>
        <button
          type="button"
          onClick={onToggleMore}
          className="btn-secondary !text-xs"
          aria-expanded={showMoreTools}
        >
          {showMoreTools ? "Hide tools" : "More"}
        </button>
      </div>
      {showMoreTools && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={onVoiceLog}
            disabled={voiceLoading}
            className="btn-secondary !text-xs disabled:opacity-50"
            title="Describe your meal by voice"
          >
            {voiceLoading ? "Listening…" : "Voice log"}
          </button>
          <label
            className="btn-secondary !text-xs cursor-pointer"
            title="Photo of your plate — JPEG/PNG, large photos auto-resize for best results"
          >
            <input type="file" accept="image/*" className="hidden" onChange={onPhotoLog} disabled={photoLoading} />
            {photoLoading ? "Analyzing…" : "Snap plate"}
          </label>
          <label
            className="btn-secondary !text-xs cursor-pointer"
            title="Photo of receipt — JPEG/PNG, large photos auto-resize"
          >
            <input type="file" accept="image/*" className="hidden" onChange={onReceiptScan} disabled={receiptLoading} />
            {receiptLoading ? "Scanning…" : "Scan receipt"}
          </label>
          <label
            className="btn-secondary !text-xs cursor-pointer"
            title="Menu photo or Uber Eats / DoorDash screenshot — ranks items against your remaining macros"
          >
            <input type="file" accept="image/*" className="hidden" onChange={onMenuScan} disabled={menuScanLoading} />
            {menuScanLoading ? "Scanning…" : "Scan menu"}
          </label>
        </div>
      )}
    </div>
  );
}
