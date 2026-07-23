import { describe, it, expect } from "vitest";
import { isMealLogIntent, replyClaimsMealLogged } from "./rico";

describe("rico meal logging helpers", () => {
  it("detects common meal log phrases", () => {
    expect(isMealLogIntent("I had a cheeseburger")).toBe(true);
    expect(isMealLogIntent("cheeseburger")).toBe(true);
    expect(isMealLogIntent("2 eggs scrambled")).toBe(true);
    expect(isMealLogIntent("bunch of grapes")).toBe(true);
    expect(isMealLogIntent("I ate a bunch of grapes for snack")).toBe(true);
    expect(isMealLogIntent("log my lunch: chicken salad")).toBe(true);
    expect(isMealLogIntent("what should I eat for dinner?")).toBe(false);
  });

  it("detects when reply claims a meal was logged", () => {
    expect(replyClaimsMealLogged("James, I've logged cheeseburger for you.")).toBe(true);
    expect(replyClaimsMealLogged("Here are some dinner ideas.")).toBe(false);
  });
});
