"""
Nova Act Grocery Automation Script
Uses Amazon Nova Act to search for grocery items on Amazon Fresh, Whole Foods,
or main Amazon. For each item, Nova Act:
  1. Opens the search results page directly
  2. Clicks the first matching product
  3. Clicks "Add to Cart" on the product page

Reads JSON from stdin:
  {"items": ["chicken breast", "greek yogurt"], "store": "fresh|wholefoods|amazon"}

Usage:
    echo '{"items": ["greek yogurt"], "store": "wholefoods"}' | python3 scripts/nova_act_grocery.py
"""

import json
import os
import re
import sys
import urllib.parse


def get_workflow_kwargs() -> dict:
    """Return auth kwargs for @workflow based on available env vars."""
    return {
        "model_id": "nova-act-latest",
        "nova_act_api_key": os.getenv("NOVA_ACT_API_KEY", None),
        "workflow_definition_name": os.getenv("NOVA_ACT_WORKFLOW_DEFINITION_NAME", None),
    }


STORE_LABELS = {
    "fresh": "Amazon Fresh",
    "wholefoods": "Whole Foods",
    "amazon": "Amazon.com",
}


def build_search_url(query: str, store: str) -> str:
    """Build a direct Amazon search results URL — skips storefront navigation."""
    encoded = urllib.parse.quote_plus(query)
    if store == "fresh":
        return f"https://www.amazon.com/s?k={encoded}&i=amazonfresh"
    if store == "wholefoods":
        return f"https://www.amazon.com/s?k={encoded}&i=wholefoods"
    return f"https://www.amazon.com/s?k={encoded}"


def run_with_nova_act(items: list[str], store: str = "fresh") -> list[dict]:
    """Use Nova Act to search for items and add them to the Amazon cart.

    For each item, opens search results directly, clicks the first product,
    then clicks Add to Cart on the product page.
    """
    from nova_act import NovaAct, workflow

    results = []
    search_items = items[:5]
    source_label = STORE_LABELS.get(store, "Amazon Fresh")

    @workflow(**get_workflow_kwargs())
    def _search():
        for item in search_items:
            try:
                search_term = simplify_ingredient(item)
                search_url = build_search_url(search_term, store)

                with NovaAct(starting_page=search_url, tty=False) as agent:
                    # Step 1: click the first relevant product
                    agent.act(
                        f"Click on the title/name link of the first product in the "
                        f"search results that matches '{search_term}'. "
                        f"This should navigate to the product detail page."
                    )

                    # Step 2: read product info
                    info_result = agent.act(
                        "Read the product name and price from this Amazon product page. "
                        "Return ONLY valid JSON: {\"name\": \"product name\", \"price\": \"$X.XX\"}"
                    )

                    # Step 3: click Add to Cart
                    cart_result = agent.act(
                        "Click the 'Add to Cart' button on this page. "
                        "If there are multiple 'Add to Cart' buttons, click the main/primary one. "
                        "If you see 'Add to Fresh Cart' or 'Add to Whole Foods Cart', click that instead."
                    )

                    added = False
                    if hasattr(cart_result, "parsed_response"):
                        added = True
                    elif hasattr(cart_result, "response"):
                        resp = str(cart_result.response).lower()
                        added = "added" in resp or "cart" in resp or not ("error" in resp or "fail" in resp)
                    else:
                        added = True  # assume success if no error

                    # Parse product info
                    parsed = None
                    if hasattr(info_result, "parsed_response") and info_result.parsed_response:
                        parsed = info_result.parsed_response
                    elif hasattr(info_result, "response") and info_result.response:
                        resp_text = str(info_result.response)
                        try:
                            start = resp_text.index("{")
                            end = resp_text.rindex("}") + 1
                            parsed = json.loads(resp_text[start:end])
                        except (ValueError, json.JSONDecodeError):
                            parsed = None

                    if not isinstance(parsed, dict):
                        parsed = {}

                    # Get product URL for reference
                    product_url = ""
                    if hasattr(agent, "page") and agent.page:
                        product_url = agent.page.url or ""

                    results.append({
                        "searchTerm": item,
                        "found": True,
                        "addedToCart": added,
                        "product": {
                            "name": parsed.get("name", search_term),
                            "price": parsed.get("price", "N/A"),
                            "available": True,
                        },
                        "productUrl": product_url,
                        "source": source_label,
                    })

            except Exception as e:
                results.append({
                    "searchTerm": item,
                    "found": False,
                    "addedToCart": False,
                    "error": str(e)[:200],
                })

    _search()
    return results


def simplify_ingredient(item: str) -> str:
    """Strip quantities and preparation details to get a cleaner search term."""
    cleaned = re.sub(r"\([^)]*\)", "", item)
    cleaned = re.sub(
        r"^\d+[\s]*(g|ml|oz|lb|lbs|cups?|tbsp|tsp|pieces?)\b[\s]*",
        "", cleaned, flags=re.IGNORECASE,
    )
    for phrase in [
        "cooked with", "mixed with", "topped with", "served with",
        "diced", "chopped", "sliced", "grilled", "baked",
    ]:
        idx = cleaned.lower().find(phrase)
        if idx > 0:
            cleaned = cleaned[:idx]
    return cleaned.strip() or item


def main():
    try:
        input_data = json.loads(sys.stdin.read())
        items = input_data.get("items", [])
        store = input_data.get("store", "fresh")

        if store not in STORE_LABELS:
            store = "fresh"

        if not items:
            json.dump({"error": "No items provided", "results": []}, sys.stdout)
            sys.exit(1)

        results = run_with_nova_act(items, store=store)

        added_count = sum(1 for r in results if r.get("addedToCart"))

        json.dump({
            "results": results,
            "itemCount": len(results),
            "addedCount": added_count,
            "store": store,
        }, sys.stdout)

    except ImportError:
        json.dump({"error": "nova-act package not installed", "results": []}, sys.stdout)
        sys.exit(1)
    except Exception as e:
        json.dump({"error": str(e), "results": []}, sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
