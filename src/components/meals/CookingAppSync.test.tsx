import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CookingAppSync } from "./CookingAppSync";

// Mock storage functions
vi.mock("@/lib/storage", () => ({
  getCookingAppRecipes: () => [],
  saveCookingAppRecipes: vi.fn(),
}));

// Mock Toast context
vi.mock("@/components/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const defaultProps = {
  meals: [],
  onAddMeal: vi.fn(),
  onEmbedMeal: vi.fn(),
};

describe("CookingAppSync", () => {
  it("renders the component title", () => {
    render(<CookingAppSync {...defaultProps} />);
    expect(screen.getByText("Cooking App Sync")).toBeInTheDocument();
  });

  it("renders all four tab buttons", () => {
    render(<CookingAppSync {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const tabLabels = buttons.map((b) => b.textContent);
    expect(tabLabels).toContain("Connect");
    expect(tabLabels).toContain("Import");
    expect(tabLabels).toContain("Recipes");
    expect(tabLabels).toContain("History");
  });

  it("does not show tab content initially", () => {
    render(<CookingAppSync {...defaultProps} />);
    expect(screen.queryByText(/Upload a CSV or JSON export/)).not.toBeInTheDocument();
  });

  it("shows Import tab content when Import is clicked", async () => {
    const user = userEvent.setup();
    render(<CookingAppSync {...defaultProps} />);
    const importButtons = screen.getAllByRole("button", { name: "Import" });
    await user.click(importButtons[0]);
    expect(screen.getByText(/Upload a CSV or JSON export/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste exported data/)).toBeInTheDocument();
  });

  it("shows Recipes tab with empty state", async () => {
    const user = userEvent.setup();
    render(<CookingAppSync {...defaultProps} />);
    const recipeButtons = screen.getAllByRole("button", { name: "Recipes" });
    await user.click(recipeButtons[0]);
    expect(screen.getByText(/No recipes yet/)).toBeInTheDocument();
  });

  it("shows History tab with empty state", async () => {
    const user = userEvent.setup();
    render(<CookingAppSync {...defaultProps} />);
    const historyButtons = screen.getAllByRole("button", { name: "History" });
    await user.click(historyButtons[0]);
    expect(screen.getByText(/No imported meals yet/)).toBeInTheDocument();
  });

  it("toggles tab off when clicked again", async () => {
    const user = userEvent.setup();
    render(<CookingAppSync {...defaultProps} />);
    const importButtons = screen.getAllByRole("button", { name: "Import" });
    await user.click(importButtons[0]);
    expect(screen.getByText(/Upload a CSV or JSON export/)).toBeInTheDocument();
    await user.click(importButtons[0]);
    expect(screen.queryByText(/Upload a CSV or JSON export/)).not.toBeInTheDocument();
  });

  it("shows Connect tab with provider select and test button", async () => {
    const user = userEvent.setup();
    render(<CookingAppSync {...defaultProps} />);
    const connectButtons = screen.getAllByRole("button", { name: "Connect" });
    await user.click(connectButtons[0]);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("Test connection")).toBeInTheDocument();
  });

  it("renders with meals prop", () => {
    const meals = [{ id: "m1", name: "Pasta", date: "2026-03-13", mealType: "dinner", macros: { calories: 400, protein: 15, carbs: 55, fat: 12 }, loggedAt: "2026-03-13T19:00:00Z", notes: "Imported from" }];
    render(<CookingAppSync {...defaultProps} meals={meals} />);
    expect(screen.getByText("Cooking App Sync")).toBeInTheDocument();
  });
});
