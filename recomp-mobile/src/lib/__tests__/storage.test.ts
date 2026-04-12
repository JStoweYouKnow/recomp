import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import * as storage from "../storage";
import type { MealEntry, FitnessPlan } from "../types";

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe("storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
    mockAsyncStorage.removeItem.mockResolvedValue(undefined);
  });

  describe("meals", () => {
    it("returns empty array when no meals stored", async () => {
      const meals = await storage.getMeals();
      expect(meals).toEqual([]);
    });

    it("returns parsed meals from storage", async () => {
      const testMeals: MealEntry[] = [
        {
          id: "1",
          date: "2025-01-15",
          mealType: "lunch",
          name: "Salad",
          macros: { calories: 300, protein: 20, carbs: 30, fat: 10 },
          loggedAt: "2025-01-15T12:00:00Z",
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(testMeals));

      const meals = await storage.getMeals();
      expect(meals).toHaveLength(1);
      expect(meals[0].name).toBe("Salad");
    });

    it("handles corrupted JSON gracefully", async () => {
      mockAsyncStorage.getItem.mockResolvedValue("{invalid json");
      const meals = await storage.getMeals();
      expect(meals).toEqual([]);
    });

    it("saves meals to storage", async () => {
      const testMeals: MealEntry[] = [
        {
          id: "1",
          date: "2025-01-15",
          mealType: "lunch",
          name: "Salad",
          macros: { calories: 300, protein: 20, carbs: 30, fat: 10 },
          loggedAt: "2025-01-15T12:00:00Z",
        },
      ];
      await storage.saveMeals(testMeals);
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        "recomp_meals",
        JSON.stringify(testMeals)
      );
    });
  });

  describe("plan", () => {
    it("returns null when no plan stored", async () => {
      const plan = await storage.getPlan();
      expect(plan).toBeNull();
    });

    it("saves and removes plan", async () => {
      await storage.savePlan(null);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith("recomp_plan");
    });
  });

  describe("hasAdjustedPlan", () => {
    it("returns false by default", async () => {
      const result = await storage.getHasAdjustedPlan();
      expect(result).toBe(false);
    });

    it("returns true when set", async () => {
      mockAsyncStorage.getItem.mockResolvedValue("1");
      const result = await storage.getHasAdjustedPlan();
      expect(result).toBe(true);
    });

    it("sets the flag", async () => {
      await storage.setHasAdjustedPlan();
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith("recomp_has_adjusted", "1");
    });
  });

  describe("ricoHistory", () => {
    it("returns empty array by default", async () => {
      const history = await storage.getRicoHistory();
      expect(history).toEqual([]);
    });

    it("saves history", async () => {
      const messages = [{ role: "user" as const, content: "hi", at: "2025-01-01T00:00:00Z" }];
      await storage.saveRicoHistory(messages);
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        "recomp_rico_history",
        JSON.stringify(messages)
      );
    });
  });

  describe("shoppingList", () => {
    it("returns empty array by default", async () => {
      const list = await storage.getShoppingList();
      expect(list).toEqual([]);
    });

    it("filters non-string items", async () => {
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(["eggs", 123, null, "milk"]));
      const list = await storage.getShoppingList();
      expect(list).toEqual(["eggs", "milk"]);
    });
  });

  describe("workoutProgress", () => {
    it("returns empty object by default", async () => {
      const progress = await storage.getWorkoutProgress();
      expect(progress).toEqual({});
    });

    it("handles non-object values", async () => {
      mockAsyncStorage.getItem.mockResolvedValue('"not an object"');
      const progress = await storage.getWorkoutProgress();
      expect(progress).toEqual({});
    });
  });
});
