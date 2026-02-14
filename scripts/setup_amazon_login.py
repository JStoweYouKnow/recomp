#!/usr/bin/env python3
"""
One-time setup: log into Amazon so Nova Act can add items to cart.

Nova Act uses a Chrome user data directory to persist cookies and login state.
This script opens a browser, lets you log in to Amazon, then saves the session.

Usage:
  1. Set NOVA_ACT_USER_DATA_DIR to a path (e.g. ~/nova-act-amazon-profile)
  2. Run: python3 scripts/setup_amazon_login.py
  3. Log into Amazon (Fresh, Whole Foods, or main site) in the opened browser
  4. Press Enter when done — the session will be saved

For grocery add-to-cart to work, set the same NOVA_ACT_USER_DATA_DIR when
running the app (or in .env) so the grocery script reuses this profile.
"""

import os
import sys

DEFAULT_USER_DATA_DIR = os.path.expanduser("~/nova-act-amazon-profile")


def main():
    user_data_dir = os.environ.get("NOVA_ACT_USER_DATA_DIR", DEFAULT_USER_DATA_DIR)
    user_data_dir = os.path.expanduser(user_data_dir)
    os.makedirs(user_data_dir, exist_ok=True)

    try:
        from nova_act import NovaAct
    except ImportError:
        print("Error: nova-act is not installed. Run: pip install nova-act", file=sys.stderr)
        sys.exit(1)

    print(f"Opening browser with profile at: {user_data_dir}")
    print("Log into Amazon (amazon.com, wholefoods.amazon.com, or Fresh) in the browser.")
    print("When you're done, return here and press Enter to save the session.\n")

    with NovaAct(
        starting_page="https://www.amazon.com",
        user_data_dir=user_data_dir,
        clone_user_data_dir=False,
    ) as nova:
        input("Press Enter when you've finished logging in...")

    print(f"\nSession saved. Set in your environment:")
    print(f"  export NOVA_ACT_USER_DATA_DIR=\"{user_data_dir}\"")
    print("\nOr add to .env:")
    print(f"  NOVA_ACT_USER_DATA_DIR={user_data_dir}")


if __name__ == "__main__":
    main()
