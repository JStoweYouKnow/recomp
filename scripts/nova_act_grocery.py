"""
Nova Act Grocery Automation Script
Uses Amazon Nova Act to search for grocery items on Amazon Fresh, Whole Foods,
or main Amazon. Optionally adds items to cart (via click when logged in, or
returns add-to-cart URLs when not).

Reads JSON from stdin:
  {"items": ["chicken breast"], "store": "fresh|wholefoods|amazon", "addToCart": true/false, "includeAddToCartUrls": true}
  includeAddToCartUrls: when true and no Amazon session, returns addToCartUrl per result (user clicks in their browser)

Usage:
    echo '{"items": ["greek yogurt"], "store": "wholefoods", "addToCart": false}' | python3 scripts/nova_act_grocery.py
"""

import json
import os
import re
import sys
import urllib.parse

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


def build_product_url(asin: str) -> str:
    """Product page link—works without AssociateTag. User clicks Add to Cart on the page."""
    return f"https://www.amazon.com/dp/{asin}"


def build_add_to_cart_url(asin: str, qty: int = 1) -> str:
    """Build Amazon add-to-cart URL. Prefer product page (no AssociateTag needed)."""
    tag = os.environ.get("AMAZON_ASSOCIATE_TAG", "").strip()
    if tag:
        params = {"ASIN.1": asin, "Quantity.1": str(qty), "AssociateTag": tag}
        return f"https://www.amazon.com/gp/aws/cart/add.html?{urllib.parse.urlencode(params)}"
    return build_product_url(asin)


def run_with_nova_act(
    items: list[str],
    store: str = "fresh",
    add_to_cart: bool = False,
    include_add_to_cart_urls: bool = False,
) -> list[dict]:
    """Use Nova Act to search (and optionally add to cart) on the chosen store."""
    from nova_act import NovaAct

    results = []
    max_items = 2 if add_to_cart else 3
    search_items = items[:max_items]
    starting_page = STORE_URLS.get(store, STORE_URLS["fresh"])
    source_label = STORE_LABELS.get(store, "Amazon Fresh")

    user_data_dir = os.environ.get("NOVA_ACT_USER_DATA_DIR")
    nova_kwargs = {"starting_page": starting_page}
    has_amazon_session = False
    if user_data_dir:
        expanded = os.path.expanduser(user_data_dir)
        if os.path.isdir(expanded):
            nova_kwargs["user_data_dir"] = expanded
            nova_kwargs["clone_user_data_dir"] = False
            has_amazon_session = True

    # When addToCart requested: get ASIN so we can build add-to-cart links
    want_urls = add_to_cart or include_add_to_cart_urls
    json_fields = '{"name": "product name", "price": "$X.XX", "available": true}'
    if want_urls:
        json_fields = '{"name": "product name", "price": "$X.XX", "available": true, "asin": "B08N5WRWNW"}'

    with NovaAct(**nova_kwargs) as agent:
        for item in search_items:
            try:
                search_term = simplify_ingredient(item)

                agent.act(f"Search for '{search_term}' in the search bar and press enter")

                result = agent.act(
                    f"Look at the search results for '{search_term}'. "
                    f"Find the first relevant product. "
                    + (f"ASIN is the 10-character ID in the product link (e.g. /dp/B08N5WRWNW). " if want_urls else "")
                    + f"Return ONLY valid JSON with no other text: {json_fields}"
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

                asin = None
                if isinstance(parsed, dict):
                    raw = str(parsed.pop("asin", "")).strip()
                    if re.match(r"^[A-Z0-9]{10}$", raw, re.I):
                        asin = raw.upper()
                    elif not asin and parsed.get("url"):
                        # Extract ASIN from product URL (e.g. /dp/B08N5WRWNW or /gp/product/B08N5WRWNW)
                        url = str(parsed.get("url", ""))
                        m = re.search(r"/(?:dp|gp/product)/([A-Z0-9]{10})", url, re.I)
                        if m:
                            asin = m.group(1).upper()
                            parsed.pop("url", None)

                add_to_cart_url = build_add_to_cart_url(asin) if asin else None

                added_to_cart = False
                if add_to_cart and has_amazon_session:
                    try:
                        agent.act(f"Click on the first search result for '{search_term}' to open the product page")
                        agent.act(
                            "Scroll down or up until you see 'Add to Cart' or 'Add to Basket'. "
                            "Click the Add to Cart / Add to Basket button."
                        )
                        added_to_cart = True
                        agent.act("Go back to the previous page or search results")
                    except Exception as cart_err:
                        results.append({
                            "searchTerm": item,
                            "found": True,
                            "product": parsed,
                            "source": source_label,
                            "addedToCart": False,
                            "addToCartError": str(cart_err)[:150],
                            "addToCartUrl": add_to_cart_url,
                        })
                        continue

                out = {
                    "searchTerm": item,
                    "found": True,
                    "product": parsed,
                    "source": source_label,
                    "addedToCart": added_to_cart,
                }
                if add_to_cart_url:
                    out["addToCartUrl"] = add_to_cart_url
                results.append(out)

            except Exception as e:
                results.append({"searchTerm": item, "found": False, "error": str(e)[:200]})

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

        # Always get ASIN/URL when addToCart requested (works in production via user-click link)
        include_urls = add_to_cart or input_data.get("includeAddToCartUrls", False)
        results = run_with_nova_act(
            items, store=store, add_to_cart=add_to_cart, include_add_to_cart_urls=include_urls
        )
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
