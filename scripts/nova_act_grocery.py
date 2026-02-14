"""
Nova Act Grocery Automation Script
Uses Amazon Nova Act to search for grocery items on Amazon Fresh, Whole Foods,
or main Amazon. Optionally adds items to cart.

Reads JSON from stdin:
  {"items": ["chicken breast", "brown rice"], "store": "fresh|wholefoods|amazon", "addToCart": true/false}

For add-to-cart to work, you must be logged into Amazon. Run once:
  NOVA_ACT_USER_DATA_DIR=~/nova-act-amazon-profile python3 scripts/setup_amazon_login.py
Then log in when the browser opens. Set the same env var when running the app.

Usage:
    echo '{"items": ["chicken breast", "brown rice"], "store": "fresh", "addToCart": false}' | python3 scripts/nova_act_grocery.py
"""

import json
import os
import sys

STORE_URLS = {
    "fresh": "https://www.amazon.com/alm/storefront?almBrandId=QW1hem9uIEZyZXNo",
    "wholefoods": "https://wholefoods.amazon.com",
    "amazon": "https://www.amazon.com",
}

STORE_LABELS = {
    "fresh": "Amazon Fresh",
    "wholefoods": "Whole Foods",
    "amazon": "Amazon.com",
}


def run_with_nova_act(items: list[str], store: str = "fresh", add_to_cart: bool = False) -> list[dict]:
    """Use Nova Act to search (and optionally add to cart) on the chosen store."""
    from nova_act import NovaAct

    results = []
    # Fewer items when adding to cart (~4 acts per item vs ~2)
    max_items = 2 if add_to_cart else 3
    search_items = items[:max_items]
    starting_page = STORE_URLS.get(store, STORE_URLS["fresh"])
    source_label = STORE_LABELS.get(store, "Amazon Fresh")

    # Use persisted Chrome profile if set (enables add-to-cart with existing login)
    user_data_dir = os.environ.get("NOVA_ACT_USER_DATA_DIR")
    nova_kwargs = {"starting_page": starting_page}
    if user_data_dir:
        user_data_dir = os.path.expanduser(user_data_dir)
        if os.path.isdir(user_data_dir):
            nova_kwargs["user_data_dir"] = user_data_dir
            nova_kwargs["clone_user_data_dir"] = False

    with NovaAct(**nova_kwargs) as agent:
        for item in search_items:
            try:
                search_term = simplify_ingredient(item)

                agent.act(
                    f"Search for '{search_term}' in the search bar and press enter"
                )

                result = agent.act(
                    f"Look at the search results for '{search_term}'. "
                    f"Find the first relevant product. Return ONLY valid JSON with no other text: "
                    f'{{"name": "product name", "price": "$X.XX", "available": true}}'
                )

                parsed = None
                if hasattr(result, "parsed_response") and result.parsed_response:
                    parsed = result.parsed_response
                elif hasattr(result, "response") and result.response:
                    resp_text = str(result.response)
                    try:
                        start = resp_text.index("{")
                        end = resp_text.rindex("}") + 1
                        parsed = json.loads(resp_text[start:end])
                    except (ValueError, json.JSONDecodeError):
                        parsed = {"name": search_term, "price": "N/A", "available": True}

                if parsed is None:
                    parsed = {"name": search_term, "price": "N/A", "available": True}

                added_to_cart = False
                if add_to_cart:
                    try:
                        agent.act(
                            f"Click on the first search result for '{search_term}' to open the product page"
                        )
                        agent.act(
                            "Scroll down or up until you see 'Add to Cart' or 'Add to Basket'. "
                            "Click the Add to Cart / Add to Basket button."
                        )
                        added_to_cart = True
                        # Go back to search for next item (or stay on cart page—Nova may handle navigation)
                        agent.act("Go back to the previous page or search results")
                    except Exception as cart_err:
                        results.append({
                            "searchTerm": item,
                            "found": True,
                            "product": parsed,
                            "source": source_label,
                            "addedToCart": False,
                            "addToCartError": str(cart_err)[:150],
                        })
                        continue

                results.append({
                    "searchTerm": item,
                    "found": True,
                    "product": parsed,
                    "source": source_label,
                    "addedToCart": added_to_cart,
                })

            except Exception as e:
                results.append({
                    "searchTerm": item,
                    "found": False,
                    "error": str(e)[:200],
                })

    return results


def simplify_ingredient(item: str) -> str:
    """Strip quantities and preparation details to get a cleaner search term."""
    import re
    cleaned = re.sub(r"\([^)]*\)", "", item)
    cleaned = re.sub(r"^\d+[\s]*(g|ml|oz|lb|lbs|cups?|tbsp|tsp|pieces?)\b[\s]*", "", cleaned, flags=re.IGNORECASE)
    for phrase in ["cooked with", "mixed with", "topped with", "served with", "diced", "chopped", "sliced", "grilled", "baked"]:
        idx = cleaned.lower().find(phrase)
        if idx > 0:
            cleaned = cleaned[:idx]
    return cleaned.strip() or item


def main():
    try:
        input_data = json.loads(sys.stdin.read())
        items = input_data.get("items", [])
        store = input_data.get("store", "fresh")
        add_to_cart = input_data.get("addToCart", False)

        if store not in STORE_URLS:
            store = "fresh"

        if not items:
            json.dump({"error": "No items provided", "results": []}, sys.stdout)
            sys.exit(1)

        results = run_with_nova_act(items, store=store, add_to_cart=add_to_cart)
        json.dump({
            "results": results,
            "itemCount": len(results),
            "store": store,
            "addToCart": add_to_cart,
        }, sys.stdout)

    except ImportError:
        json.dump({"error": "nova-act package not installed", "results": []}, sys.stdout)
        sys.exit(1)
    except Exception as e:
        json.dump({"error": str(e), "results": []}, sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
