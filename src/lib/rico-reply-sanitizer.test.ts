import { describe, it, expect } from "vitest";
import { stripRicoDiagnosticMarkup } from "./rico-reply-sanitizer";

describe("stripRicoDiagnosticMarkup", () => {
  it("removes multiline DIAG blocks", () => {
    const input = `James, I've logged cheeseburger for you.

[DIAG today=2026-07-17
freshFetchCount=9
freshFetchProtein=205.0
contextMealsLogged=9
contextProtein=205.0]`;
    expect(stripRicoDiagnosticMarkup(input)).toBe("James, I've logged cheeseburger for you.");
  });

  it("leaves normal replies unchanged", () => {
    const reply = "I've logged bento box with tempura sweet potato for you.";
    expect(stripRicoDiagnosticMarkup(reply)).toBe(reply);
  });
});
