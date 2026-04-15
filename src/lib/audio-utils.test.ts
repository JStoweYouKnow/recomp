import { describe, it, expect, vi } from "vitest";
import { isAudioSupported, playAudioResponse } from "./audio-utils";

describe("isAudioSupported", () => {
  it("returns false when mediaDevices is missing", () => {
    const orig = global.navigator;
    (global as unknown as { navigator: { mediaDevices?: unknown } }).navigator = { mediaDevices: undefined };
    expect(isAudioSupported()).toBe(false);
    (global as unknown as { navigator: typeof orig }).navigator = orig;
  });

  it("returns false when AudioContext is missing", () => {
    const origAC = (global as unknown as { AudioContext?: unknown }).AudioContext;
    (global as unknown as { AudioContext: undefined }).AudioContext = undefined;
    expect(isAudioSupported()).toBe(false);
    (global as unknown as { AudioContext: typeof origAC }).AudioContext = origAC;
  });
});

describe("playAudioResponse", () => {
  it("returns immediately for empty input", async () => {
    await playAudioResponse("");
    // No throw
  });
});
