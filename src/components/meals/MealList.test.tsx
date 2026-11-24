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
  it("renders empty state with a single primary Log a meal CTA", () => {
    render(<MealList {...baseProps()} />);
    expect(screen.getByText("Nothing logged yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log a meal" })).toBeInTheDocument();
    expect(screen.queryByText("Voice log")).not.toBeInTheDocument();
    expect(screen.queryByText("Snap plate")).not.toBeInTheDocument();
  });

  it("renders past-date empty message without action buttons", () => {
    render(<MealList {...baseProps()} isViewingToday={false} dateLabel="Yesterday" />);
    expect(screen.getByText("No meals for this date")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log a meal" })).not.toBeInTheDocument();
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

  it("calls onShowAdd when Log a meal is clicked", async () => {
    const props = baseProps();
    const user = userEvent.setup();
    render(<MealList {...props} />);
    await user.click(screen.getByRole("button", { name: "Log a meal" }));
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
    await user.click(screen.getByText("Del"));
    expect(props.onDeleteMeal).toHaveBeenCalledWith(meal.date, meal.id);
  });
});
