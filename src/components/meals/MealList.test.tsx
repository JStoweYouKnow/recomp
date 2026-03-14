import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MealList } from "./MealList";
import type { MealEntry } from "@/lib/types";

const makeMeal = (overrides: Partial<MealEntry> = {}): MealEntry => ({
  id: "m1",
  name: "Grilled Chicken Bowl",
  date: "2026-03-13",
  mealType: "lunch",
  macros: { calories: 520, protein: 40, carbs: 45, fat: 18 },
  loggedAt: "2026-03-13T12:00:00Z",
  ...overrides,
});

const baseProps = () => ({
  dateLabel: "Today",
  isViewingToday: true,
  displayMeals: [] as MealEntry[],
  mealsByCategory: [] as { category: MealEntry["mealType"]; meals: MealEntry[] }[],
  onEditMeal: vi.fn(),
  onDeleteMeal: vi.fn(),
  onShowAdd: vi.fn(),
  onVoiceLog: vi.fn(),
  onPhotoLog: vi.fn(),
  voiceLoading: false,
  photoLoading: false,
});

describe("MealList", () => {
  it("renders empty state with action buttons when viewing today", () => {
    render(<MealList {...baseProps()} />);
    expect(screen.getByText("Log your first meal")).toBeInTheDocument();
    expect(screen.getByText("Add manually")).toBeInTheDocument();
    expect(screen.getByText("Voice log")).toBeInTheDocument();
    expect(screen.getByText("Snap plate")).toBeInTheDocument();
  });

  it("renders past-date empty message without action buttons", () => {
    render(<MealList {...baseProps()} isViewingToday={false} dateLabel="Yesterday" />);
    expect(screen.getByText("No meals for this date")).toBeInTheDocument();
    // Action buttons should not appear for past dates
    expect(screen.queryByText("Add manually")).not.toBeInTheDocument();
  });

  it("renders meals grouped by category", () => {
    const meal = makeMeal();
    render(
      <MealList
        {...baseProps()}
        displayMeals={[meal]}
        mealsByCategory={[{ category: "lunch", meals: [meal] }]}
      />
    );
    expect(screen.getByText("Grilled Chicken Bowl")).toBeInTheDocument();
    expect(screen.getByText("520 cal · 40g P")).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
  });

  it("calls onShowAdd when Add manually is clicked", async () => {
    const props = baseProps();
    const user = userEvent.setup();
    render(<MealList {...props} />);
    const addButtons = screen.getAllByText("Add manually");
    await user.click(addButtons[0]);
    expect(props.onShowAdd).toHaveBeenCalledOnce();
  });

  it("calls onDeleteMeal when Del is clicked", async () => {
    const props = baseProps();
    const user = userEvent.setup();
    const meal = makeMeal();
    render(
      <MealList
        {...props}
        displayMeals={[meal]}
        mealsByCategory={[{ category: "lunch", meals: [meal] }]}
      />
    );
    const delButtons = screen.getAllByText("Del");
    await user.click(delButtons[0]);
    expect(props.onDeleteMeal).toHaveBeenCalledWith("m1");
  });

  it("shows inline edit form when Edit is clicked", async () => {
    const user = userEvent.setup();
    const meal = makeMeal();
    render(
      <MealList
        {...baseProps()}
        displayMeals={[meal]}
        mealsByCategory={[{ category: "lunch", meals: [meal] }]}
      />
    );
    // There's only one Edit button for a single meal
    const editButtons = screen.getAllByText("Edit");
    await user.click(editButtons[0]);
    expect(screen.getByText("Edit meal")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("shows loading states for voice and photo", () => {
    render(<MealList {...baseProps()} voiceLoading={true} photoLoading={true} />);
    expect(screen.getByText("Listening…")).toBeInTheDocument();
    expect(screen.getByText("Analyzing…")).toBeInTheDocument();
  });

  it("calls onEditMeal when Save is clicked in edit form", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    const meal = makeMeal();
    render(
      <MealList
        {...props}
        displayMeals={[meal]}
        mealsByCategory={[{ category: "lunch", meals: [meal] }]}
      />
    );
    const editButtons = screen.getAllByText("Edit");
    await user.click(editButtons[0]);
    await user.click(screen.getByText("Save"));
    expect(props.onEditMeal).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", name: "Grilled Chicken Bowl" }));
  });

  it("calls onVoiceLog when Voice log is clicked", async () => {
    const props = baseProps();
    const user = userEvent.setup();
    render(<MealList {...props} />);
    const voiceButtons = screen.getAllByText("Voice log");
    await user.click(voiceButtons[0]);
    expect(props.onVoiceLog).toHaveBeenCalledOnce();
  });
});
