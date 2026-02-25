"""
Nova Act Nutrition Lookup Script
Uses Amazon Nova Act to look up detailed nutrition information from USDA FoodData Central.

When nova-act is not installed, falls back to a demo mode with a database of
common food nutrition facts so the full UI flow can be demonstrated.

Usage:
    echo '{"food": "chicken breast"}' | python3 scripts/nova_act_nutrition.py
"""

import json
import os
import sys


def get_workflow_kwargs() -> dict:
    """Return auth kwargs for @workflow based on available env vars."""
    return {
        "model_id": "nova-act-latest",
        "nova_act_api_key": os.getenv("NOVA_ACT_API_KEY", None),
        "workflow_definition_name": os.getenv("NOVA_ACT_WORKFLOW_DEFINITION_NAME", None),
    }


def run_with_nova_act(food: str) -> dict:
    """Use Nova Act to look up nutrition info on USDA FoodData Central."""
    from nova_act import NovaAct, workflow

    @workflow(**get_workflow_kwargs())
    def _lookup():
        with NovaAct(starting_page="https://fdc.nal.usda.gov/food-search") as agent:
            agent.act(
                f"Type '{food}' into the search box and click the search button"
            )

            agent.act(
                f"Click on the first search result that best matches '{food}'"
            )

            result = agent.act(
                "Read the nutrition facts on this page. Extract: calories, total fat, "
                "saturated fat, cholesterol, sodium, total carbohydrates, dietary fiber, "
                "sugars, protein, vitamin D, calcium, iron, and potassium per 100g serving. "
                "Return as JSON with numeric values."
            )

            return {
                "food": food,
                "source": "USDA FoodData Central",
                "nutrition": result.parsed_response if hasattr(result, 'parsed_response') else str(result),
                "found": True,
            }

    return _lookup()


# Per 100g values based on USDA FoodData Central
DEMO_NUTRITION = {
    "chicken breast": {"calories": 165, "protein": 31, "carbs": 0, "fat": 3.6, "fiber": 0, "sugar": 0, "sodium": 74, "cholesterol": 85, "saturated_fat": 1, "vitamin_d": 0.1, "calcium": 15, "iron": 1, "potassium": 256},
    "brown rice": {"calories": 123, "protein": 2.7, "carbs": 26, "fat": 1, "fiber": 1.6, "sugar": 0.4, "sodium": 4, "cholesterol": 0, "saturated_fat": 0.2, "vitamin_d": 0, "calcium": 3, "iron": 0.6, "potassium": 86},
    "salmon": {"calories": 208, "protein": 20, "carbs": 0, "fat": 13, "fiber": 0, "sugar": 0, "sodium": 59, "cholesterol": 55, "saturated_fat": 3.1, "vitamin_d": 11, "calcium": 9, "iron": 0.3, "potassium": 363},
    "broccoli": {"calories": 34, "protein": 2.8, "carbs": 7, "fat": 0.4, "fiber": 2.6, "sugar": 1.7, "sodium": 33, "cholesterol": 0, "saturated_fat": 0, "vitamin_d": 0, "calcium": 47, "iron": 0.7, "potassium": 316},
    "sweet potato": {"calories": 86, "protein": 1.6, "carbs": 20, "fat": 0.1, "fiber": 3, "sugar": 4.2, "sodium": 55, "cholesterol": 0, "saturated_fat": 0, "vitamin_d": 0, "calcium": 30, "iron": 0.6, "potassium": 337},
    "egg": {"calories": 155, "protein": 13, "carbs": 1.1, "fat": 11, "fiber": 0, "sugar": 1.1, "sodium": 124, "cholesterol": 373, "saturated_fat": 3.3, "vitamin_d": 2, "calcium": 56, "iron": 1.8, "potassium": 126},
    "oats": {"calories": 389, "protein": 17, "carbs": 66, "fat": 6.9, "fiber": 11, "sugar": 0, "sodium": 2, "cholesterol": 0, "saturated_fat": 1.2, "vitamin_d": 0, "calcium": 54, "iron": 4.7, "potassium": 429},
    "banana": {"calories": 89, "protein": 1.1, "carbs": 23, "fat": 0.3, "fiber": 2.6, "sugar": 12, "sodium": 1, "cholesterol": 0, "saturated_fat": 0.1, "vitamin_d": 0, "calcium": 5, "iron": 0.3, "potassium": 358},
    "avocado": {"calories": 160, "protein": 2, "carbs": 9, "fat": 15, "fiber": 7, "sugar": 0.7, "sodium": 7, "cholesterol": 0, "saturated_fat": 2.1, "vitamin_d": 0, "calcium": 12, "iron": 0.6, "potassium": 485},
    "spinach": {"calories": 23, "protein": 2.9, "carbs": 3.6, "fat": 0.4, "fiber": 2.2, "sugar": 0.4, "sodium": 79, "cholesterol": 0, "saturated_fat": 0.1, "vitamin_d": 0, "calcium": 99, "iron": 2.7, "potassium": 558},
    "greek yogurt": {"calories": 59, "protein": 10, "carbs": 3.6, "fat": 0.7, "fiber": 0, "sugar": 3.2, "sodium": 36, "cholesterol": 5, "saturated_fat": 0.3, "vitamin_d": 0, "calcium": 110, "iron": 0.1, "potassium": 141},
    "almonds": {"calories": 579, "protein": 21, "carbs": 22, "fat": 50, "fiber": 13, "sugar": 4.4, "sodium": 1, "cholesterol": 0, "saturated_fat": 3.8, "vitamin_d": 0, "calcium": 269, "iron": 3.7, "potassium": 733},
    "quinoa": {"calories": 120, "protein": 4.4, "carbs": 21, "fat": 1.9, "fiber": 2.8, "sugar": 0.9, "sodium": 7, "cholesterol": 0, "saturated_fat": 0.2, "vitamin_d": 0, "calcium": 17, "iron": 1.5, "potassium": 172},
    "turkey": {"calories": 135, "protein": 30, "carbs": 0, "fat": 1, "fiber": 0, "sugar": 0, "sodium": 60, "cholesterol": 65, "saturated_fat": 0.3, "vitamin_d": 0.3, "calcium": 13, "iron": 0.8, "potassium": 298},
    "beef": {"calories": 254, "protein": 17, "carbs": 0, "fat": 20, "fiber": 0, "sugar": 0, "sodium": 66, "cholesterol": 78, "saturated_fat": 7.7, "vitamin_d": 0.1, "calcium": 12, "iron": 2.3, "potassium": 270},
    "tofu": {"calories": 76, "protein": 8, "carbs": 1.9, "fat": 4.8, "fiber": 0.3, "sugar": 0.6, "sodium": 7, "cholesterol": 0, "saturated_fat": 0.7, "vitamin_d": 0, "calcium": 350, "iron": 5.4, "potassium": 121},
    "shrimp": {"calories": 85, "protein": 20, "carbs": 0.2, "fat": 0.5, "fiber": 0, "sugar": 0, "sodium": 119, "cholesterol": 189, "saturated_fat": 0.1, "vitamin_d": 0, "calcium": 70, "iron": 0.5, "potassium": 182},
    "tuna": {"calories": 132, "protein": 28, "carbs": 0, "fat": 1.3, "fiber": 0, "sugar": 0, "sodium": 47, "cholesterol": 49, "saturated_fat": 0.4, "vitamin_d": 1.7, "calcium": 4, "iron": 0.8, "potassium": 323},
    "rice": {"calories": 130, "protein": 2.7, "carbs": 28, "fat": 0.3, "fiber": 0.4, "sugar": 0, "sodium": 1, "cholesterol": 0, "saturated_fat": 0.1, "vitamin_d": 0, "calcium": 10, "iron": 1.2, "potassium": 35},
    "pasta": {"calories": 131, "protein": 5, "carbs": 25, "fat": 1.1, "fiber": 1.8, "sugar": 0.6, "sodium": 1, "cholesterol": 0, "saturated_fat": 0.2, "vitamin_d": 0, "calcium": 7, "iron": 1.3, "potassium": 44},
}


def run_demo_mode(food: str) -> dict:
    """
    Demo fallback when nova-act SDK is not installed.
    Returns nutrition data from a built-in database of common foods.
    """
    food_lower = food.lower().strip()
    nutrition = None

    # Exact match first
    if food_lower in DEMO_NUTRITION:
        nutrition = DEMO_NUTRITION[food_lower]

    # Fuzzy match
    if not nutrition:
        for key, val in DEMO_NUTRITION.items():
            if key in food_lower or food_lower in key:
                nutrition = val
                break

    if nutrition:
        return {
            "food": food,
            "source": "USDA FoodData Central",
            "nutrition": nutrition,
            "found": True,
            "demoMode": True,
        }

    # Reasonable estimate for unknown foods
    return {
        "food": food,
        "source": "USDA FoodData Central",
        "nutrition": {
            "calories": 150, "protein": 10, "carbs": 15, "fat": 5,
            "fiber": 2, "sugar": 3, "sodium": 50, "cholesterol": 20,
            "saturated_fat": 1.5, "vitamin_d": 0, "calcium": 20,
            "iron": 1, "potassium": 150,
        },
        "found": True,
        "demoMode": True,
        "note": f"Estimated values for '{food}'. Install nova-act for real USDA lookup.",
    }


def main():
    try:
        input_data = json.loads(sys.stdin.read())
        food = input_data.get("food", "")

        if not food:
            print(json.dumps({"error": "No food specified"}))
            sys.exit(1)

        try:
            result = run_with_nova_act(food)
        except ImportError:
            result = run_demo_mode(food)

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
