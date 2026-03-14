# The Ref on the Go

Users can reach The Ref via SMS, Siri Shortcuts, and push deep-links without opening the full app.

---

## 1. SMS (Twilio)

Users link their phone in **Profile → The Ref on the go** and text your Twilio number to chat with The Ref.

### Setup

1. Create a [Twilio](https://www.twilio.com/) account and buy a phone number.
2. Set environment variables:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
3. In Twilio Console → Phone Numbers → [Your number] → Messaging:
   - **A MESSAGE COMES IN**: Webhook → `https://your-domain.com/api/twilio/sms`
   - HTTP POST

### Flow

- Incoming SMS → Twilio webhook → lookup user by `From` → invoke The Ref → reply via Twilio
- If the number isn’t linked, the user gets instructions to link it in the app

---

## 2. Siri Shortcuts

Users generate an API token in **Profile → The Ref on the go** and create a Shortcut that calls the endpoint.

### Endpoint

```
POST /api/rico/shortcut
Authorization: Bearer <api-token>
Content-Type: application/json
Body: { "message": "How many calories do I need today?" }
Response: { "reply": "..." }
```

### Shortcut setup (user-facing)

1. Create API token in Profile → The Ref on the go.
2. In Shortcuts, add **Get Contents of URL**:
   - URL: `https://your-domain.com/api/rico/shortcut`
   - Method: POST
   - Headers: `Authorization: Bearer <token>`
   - Request Body: JSON `{ "message": "<ask for input>" }`
3. Parse JSON from the response and speak or show `reply`.

---

## 3. Mobile / Push

### Deep-link to The Ref

Use `/?open=rico` or `/rico` (redirects to `/?open=rico`). The app opens with The Ref chat focused.

**Push notifications:** When sending a "Chat with The Ref" reminder, set:

```ts
import { sendPushToUser, ricoReminderPayload } from "@/lib/push";

await sendPushToUser(userId, ricoReminderPayload("https://your-domain.com"));
```

Tapping the notification opens the app with The Ref chat open.

### PWA manifest

`/manifest.json` is configured for “Add to Home Screen.” Users can add a shortcut to `/rico` for one-tap access to The Ref.
