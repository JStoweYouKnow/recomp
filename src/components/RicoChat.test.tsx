import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RicoChat } from "./RicoChat";

vi.mock("@/lib/storage", () => ({
  getRicoHistory: () => [],
  saveRicoHistory: () => {},
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("RicoChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders when closed (sheet translated off-screen)", () => {
    render(
      <RicoChat
        userName="Test"
        context={{}}
        isOpen={false}
        onClose={() => {}}
      />
    );
    expect(document.querySelector(".modal")).toBeInTheDocument();
  });

  it("shows greeting and input when open", () => {
    render(
      <RicoChat
        userName="Alex"
        context={{}}
        isOpen={true}
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/Hi Alex/)).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("Ask Reco...").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("button", { name: /Send/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("displays voice mode toggle when audio is supported", () => {
    vi.stubGlobal("navigator", { mediaDevices: {} });
    vi.stubGlobal("AudioContext", class {});
    render(
      <RicoChat
        userName=""
        context={{}}
        isOpen={true}
        onClose={() => {}}
      />
    );
    const voiceBtn = screen.queryByTitle(/Switch to voice/i) ?? screen.queryByTitle(/Switch to text/i);
    expect(voiceBtn).toBeInTheDocument();
  });

  it("renders close button", () => {
    render(
      <RicoChat
        userName=""
        context={{}}
        isOpen={true}
        onClose={() => {}}
      />
    );
    const closeBtns = screen.getAllByRole("button", { name: "Close" });
    expect(closeBtns.length).toBeGreaterThanOrEqual(1);
  });
});
