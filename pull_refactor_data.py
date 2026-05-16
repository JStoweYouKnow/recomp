"""
pull_refactor_data.py

Pulls all DynamoDB data for a user by email and writes it to a JSON file.

Usage:
    pip install boto3
    export AWS_PROFILE=...
    export AWS_REGION=us-east-1
    export REFACTOR_TABLE=refactor-prod
    python pull_refactor_data.py --email user@example.com [--out output.json]
"""

import argparse
import json
import os
import sys
import boto3
from boto3.dynamodb.conditions import Key


TABLE_NAME = os.environ.get("REFACTOR_TABLE", "RefactorTable")
REGION = os.environ.get("AWS_REGION", "us-east-1")


def get_table():
    session = boto3.Session()
    dynamodb = session.resource("dynamodb", region_name=REGION)
    return dynamodb.Table(TABLE_NAME)


def query_prefix(table, pk: str, sk_prefix: str | None = None) -> list[dict]:
    kwargs = {
        "KeyConditionExpression": Key("PK").eq(pk)
        if not sk_prefix
        else Key("PK").eq(pk) & Key("SK").begins_with(sk_prefix),
    }
    items = []
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last:
            break
        kwargs["ExclusiveStartKey"] = last
    return items


def get_item(table, pk: str, sk: str) -> dict | None:
    resp = table.get_item(Key={"PK": pk, "SK": sk})
    return resp.get("Item")


def pull_user(email: str) -> dict:
    table = get_table()
    email_key = email.lower().strip()

    # 1. Resolve account → userId
    account_item = get_item(table, f"ACCOUNT#{email_key}", f"ACCOUNT#{email_key}")
    if not account_item:
        print(f"No account found for {email}", file=sys.stderr)
        sys.exit(1)

    account_data = account_item.get("data", {})
    user_id = account_data.get("userId")
    if not user_id:
        print("Account item missing userId", file=sys.stderr)
        sys.exit(1)

    print(f"Found userId: {user_id}")

    result = {
        "userId": user_id,
        "email": email,
        "account": account_data,
    }

    # 2. Pull all USER#{userId} items
    user_pk = f"USER#{user_id}"
    all_user_items = query_prefix(table, user_pk)
    print(f"Found {len(all_user_items)} USER# items")

    # Bucket by SK prefix
    sk_map: dict[str, list | dict] = {}
    for item in all_user_items:
        sk: str = item.get("SK", "")
        data = item.get("data", item)

        if sk == "PROFILE":
            result["profile"] = data
        elif sk == "PLAN":
            result["plan"] = data
        elif sk == "META":
            result["meta"] = data
        elif sk == "WEEKLY_REVIEW":
            result["weeklyReview"] = data
        elif sk == "WORKOUT_PROGRESS":
            result["workoutProgress"] = data
        elif sk == "SOCIAL":
            result["socialSettings"] = data
        elif sk == "PHONE":
            result["phone"] = data
        elif sk == "PANTRY":
            result["pantry"] = data
        elif sk == "SUPPLEMENTS":
            result["supplements"] = data
        elif sk == "METABOLIC_MODEL":
            result["metabolicModel"] = data
        elif sk == "COACH_SCHEDULE":
            result["coachSchedule"] = data
        elif sk.startswith("MEAL#"):
            result.setdefault("meals", []).append(data)
        elif sk.startswith("WCONN#"):
            result.setdefault("wearableConnections", []).append(data)
        elif sk.startswith("WDATA#"):
            result.setdefault("wearableData", []).append(data)
        elif sk.startswith("MILESTONE#"):
            result.setdefault("milestones", []).append(data)
        elif sk.startswith("ACTLOG#"):
            result.setdefault("activityLog", []).append(data)
        elif sk.startswith("PUSH#"):
            result.setdefault("webPushSubscriptions", []).append(data)
        elif sk.startswith("PUSH_EXPO#"):
            result.setdefault("expoPushTokens", []).append(data)
        elif sk.startswith("HYDRATION#"):
            result.setdefault("hydration", []).append(data)
        elif sk.startswith("FASTING#"):
            result.setdefault("fastingSessions", []).append(data)
        elif sk.startswith("BIOFEEDBACK#"):
            result.setdefault("biofeedback", []).append(data)
        elif sk.startswith("BODY_SCAN#"):
            result.setdefault("bodyScans", []).append(data)
        elif sk.startswith("BLOODWORK#"):
            result.setdefault("bloodWork", []).append(data)
        elif sk.startswith("MEAL_PREP#"):
            result.setdefault("mealPrepPlans", []).append(data)
        elif sk.startswith("GROUP#"):
            result.setdefault("groupMemberships", []).append(data)
        elif sk.startswith("CHALLENGE#"):
            result.setdefault("challenges", []).append(data)
        else:
            result.setdefault("_other", []).append(item)

    # 3. Side-channel lookup items
    # Phone reverse lookup
    if "phone" in result:
        phone_raw = result["phone"].get("phone", "")
        digits = phone_raw.replace("+", "").replace("-", "").replace(" ", "")
        phone_item = get_item(table, f"PHONE#{digits}", f"PHONE#{digits}")
        if phone_item:
            result["_phoneIndex"] = phone_item

    # Calendar token
    meta = result.get("meta", {})
    cal_token = meta.get("calendarFeedToken")
    if cal_token:
        cal_item = get_item(table, f"CALENDAR#{cal_token}", f"CALENDAR#{cal_token}")
        if cal_item:
            result["_calendarIndex"] = cal_item

    # API tokens — scan APITOKEN# items that reference this userId
    # (no reverse index exists, so we note this limitation)
    result["_note_api_tokens"] = (
        "API tokens are not indexed by userId — query APITOKEN#{token} directly if needed"
    )

    return result


def decimal_default(obj):
    from decimal import Decimal
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def main():
    parser = argparse.ArgumentParser(description="Pull all Refactor data for a user")
    parser.add_argument("--email", required=True, help="User email address")
    parser.add_argument("--out", default=None, help="Output JSON file (default: <userId>.json)")
    args = parser.parse_args()

    print(f"Table: {TABLE_NAME} | Region: {REGION}")
    data = pull_user(args.email)

    out_path = args.out or f"{data['userId']}.json"
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2, default=decimal_default)

    print(f"\nWrote {out_path}")
    print(f"  meals:           {len(data.get('meals', []))}")
    print(f"  wearable days:   {len(data.get('wearableData', []))}")
    print(f"  activity log:    {len(data.get('activityLog', []))}")
    print(f"  milestones:      {len(data.get('milestones', []))}")
    print(f"  body scans:      {len(data.get('bodyScans', []))}")
    print(f"  blood work:      {len(data.get('bloodWork', []))}")
    print(f"  hydration:       {len(data.get('hydration', []))}")
    print(f"  fasting:         {len(data.get('fastingSessions', []))}")
    print(f"  biofeedback:     {len(data.get('biofeedback', []))}")
    print(f"  group memberships: {len(data.get('groupMemberships', []))}")


if __name__ == "__main__":
    main()
