"""
Nova Act Grocery Automation Script
Uses Amazon Nova Act to search for grocery items on Amazon Fresh, Whole Foods,
or main Amazon. Returns product info with ASINs so the frontend can build
direct add-to-cart URLs that work in the user's browser.

Amazon's cart URL format (no auth/API key needed):
  https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B08XXX&Quantity.1=1&ASIN.2=B07YYY&Quantity.2=1
When the user opens this in their browser (where they're logged into Amazon),
items are added to their cart automatically.

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


def build_single_cart_url(asin: str, qty: int = 1) -> str:
    """Build Amazon add-to-cart URL for a single ASIN. Works without authentication."""
    params = {"ASIN.1": asin, "Quantity.1": str(qty)}
    return f"https://www.amazon.com/gp/aws/cart/add.html?{urllib.parse.urlencode(params)}"


def build_batch_cart_url(asins: list[str]) -> str:
    """Build a single Amazon URL that adds multiple items to cart at once."""
    params = {}
    for i, asin in enumerate(asins, 1):
        params[f"ASIN.{i}"] = asin
        params[f"Quantity.{i}"] = "1"
    return f"https://www.amazon.com/gp/aws/cart/add.html?{urllib.parse.urlencode(params)}"


def build_search_url(query: str, store: str) -> str:
    """Build a direct Amazon search results URL — skips storefront navigation."""
    encoded = urllib.parse.quote_plus(query)
    if store == "fresh":
        return f"https://www.amazon.com/s?k={encoded}&i=amazonfresh"
    if store == "wholefoods":
        return f"https://www.amazon.com/s?k={encoded}&i=wholefoods"
    return f"https://www.amazon.com/s?k={encoded}"


def run_with_nova_act(items: list[str], store: str = "fresh") -> list[dict]:
    """Use Nova Act to search for items and extract ASINs for cart URLs.

    Opens Amazon search results directly (1 URL per item) to avoid
    navigating the storefront which hits Nova Act's max-steps limit.
    """
    from nova_act import NovaAct, workflow

    results = []
    search_items = items[:5]
    source_label = STORE_LABELS.get(store, "Amazon Fresh")

    json_schema = '{"name": "product name", "price": "$X.XX", "asin": "B08N5WRWNW"}'

    @workflow(**get_workflow_kwargs())
    def _search():
        for item in search_items:
            try:
                search_term = simplify_ingredient(item)
                search_url = build_search_url(search_term, store)

                # Open search results page directly, click first result, read ASIN from URL
                with NovaAct(starting_page=search_url, tty=False) as agent:
                    # Step 1: click the first relevant product link
                    agent.act(
                        f"Click on the title/name link of the first product in the search results that matches '{search_term}'. "
                        f"This should navigate to the product detail page."
                    )

                    # Try to get the current URL to extract ASIN directly
                    page_url = ""
                    if hasattr(agent, "page") and agent.page:
                        page_url = agent.page.url or ""
                    elif hasattr(agent, "get_url"):
                        page_url = agent.get_url() or ""
                    # Step 2: on the product page, read name + price
                    result = agent.act(
                        f"You are on an Amazon product page. "
                        f"Read the product name and price. "
                        f"Also look at the current page URL — it should contain /dp/ followed by a 10-character code (the ASIN). "
                        f"Return ONLY valid JSON: {json_schema}"
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
                        parsed = None

                if not isinstance(parsed, dict):
                    parsed = {"name": search_term, "price": "N/A"}

                # Extract and validate ASIN
                asin = None
                raw_asin = str(parsed.pop("asin", "")).strip()
                if re.match(r"^[A-Z0-9]{10}$", raw_asin, re.I):
                    asin = raw_asin.upper()
                if not asin and parsed.get("url"):
                    url = str(parsed.pop("url", ""))
                    m = re.search(r"/(?:dp|gp/product)/([A-Z0-9]{10})", url, re.I)
                    if m:
                        asin = m.group(1).upper()
                # Fallback: extract ASIN from the browser's current page URL
                if not asin and page_url:
                    m = re.search(r"/(?:dp|gp/product)/([A-Z0-9]{10})", page_url, re.I)
                    if m:
                        asin = m.group(1).upper()

                out = {
                    "searchTerm": item,
                    "found": bool(asin),
                    "product": {
                        "name": parsed.get("name", search_term),
                        "price": parsed.get("price", "N/A"),
                        "available": True,
                    },
                    "source": source_label,
                }
                if asin:
                    out["asin"] = asin
                    out["addToCartUrl"] = build_single_cart_url(asin)
                    out["productUrl"] = f"https://www.amazon.com/dp/{asin}"
                results.append(out)

            except Exception as e:
                results.append({
                    "searchTerm": item,
                    "found": False,
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

        if store not in STORE_URLS:
            store = "fresh"

        if not items:
            json.dump({"error": "No items provided", "results": []}, sys.stdout)
            sys.exit(1)

        results = run_with_nova_act(items, store=store)

        # Build a batch cart URL for all found ASINs
        found_asins = [r["asin"] for r in results if r.get("asin")]
        batch_url = build_batch_cart_url(found_asins) if found_asins else None

        json.dump({
            "results": results,
            "itemCount": len(results),
            "store": store,
            "batchCartUrl": batch_url,
        }, sys.stdout)

    except ImportError:
        json.dump({"error": "nova-act package not installed", "results": []}, sys.stdout)
        sys.exit(1)
    except Exception as e:
        json.dump({"error": str(e), "results": []}, sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
