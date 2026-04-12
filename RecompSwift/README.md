# Recomp Swift — iOS + Apple Watch

Native Swift implementation of the Recomp fitness app with full web feature parity and an Apple Watch companion.

## Requirements

- **Xcode 16+** (Swift 5.10+)
- **iOS 17.0+** deployment target
- **watchOS 10.0+** deployment target
- macOS Sonoma or later for development

## Project Setup

### 1. Create the Xcode Project

Open Xcode and create a new **Multiplatform App** or use the following manual setup:

1. **File → New → Project → iOS App**
   - Product Name: `Recomp`
   - Bundle Identifier: `com.recomp.ios`
   - Interface: SwiftUI
   - Storage: SwiftData

2. **Add Watch Target**
   - File → New → Target → watchOS App
   - Product Name: `RecompWatch`
   - Bundle Identifier: `com.recomp.ios.watchkitapp`

3. **Add Widget Extension (for Watch complications)**
   - File → New → Target → Widget Extension
   - Product Name: `RecompWidgets`
   - Check "Include Watch complications"

### 2. Add RecompKit Package

1. In Xcode, select the project root in the navigator
2. Go to **Package Dependencies** tab
3. Click **+** → Add Local → navigate to `RecompSwift/RecompKit/`
4. Add `RecompKit` library to **all three targets** (iOS app, Watch app, Widget extension)

### 3. Add Source Files

Drag the following folders into the corresponding Xcode targets:

| Folder | Target |
|--------|--------|
| `RecompApp/App/Refactor/Refactor/` + `RecompApp/Features/` + `RecompApp/SharedUI/` | **Refactor** iOS target (wired in `Refactor.xcodeproj`) |
| `RecompWatch/Features/` + `RecompWatch/Complications/` | **RecompWatch Watch App** (synced as `../../../RecompWatch/...` in `Refactor.xcodeproj`) |
| `Refactor Watch App/RefactorWatchApp.swift` | Watch `@main` + shared SwiftData via `RefactorKit` |

### 4. Configure Capabilities

#### iOS App Target
- **App Groups**: `group.com.refactor.ios`
- **Push Notifications**: Enable
- **HealthKit**: Enable
- **Background Modes**: Background fetch, Remote notifications

#### Watch App Target
- **App Groups**: `group.com.refactor.ios` (same group)
- **HealthKit**: Enable

### 5. Set Deployment Targets

- iOS app: **iOS 17.0**
- Watch app: **watchOS 10.0**
- Widget extension: **watchOS 10.0**

### 6. Environment Configuration

Set the API base URL via an Xcode scheme environment variable:

```
RECOMP_API_URL = https://your-recomp-instance.vercel.app
```

Or for local development:
```
RECOMP_API_URL = http://localhost:3000
```

## Architecture

```
RecompSwift/
├── RecompKit/          # Shared Swift package (models, networking, services)
│   ├── Models/         # 20 SwiftData models + 30+ enums
│   ├── Networking/     # APIClient actor + 12 endpoint files
│   ├── Services/       # Auth, Meal, Plan, Workout, Group, Coach, Sync, Research
│   ├── Persistence/    # SwiftData container, SyncEngine
│   └── Utilities/      # Keychain, MacroCalculator, DateHelpers, ImageResizer
│
├── RecompApp/          # iOS app (SwiftUI)
│   ├── App/            # Entry point, coordinator, AppDelegate
│   ├── Features/       # 11 feature modules (Onboarding through Research)
│   └── SharedUI/       # Reusable components (MacroRing, Toast, Confetti, etc.)
│
└── RecompWatch/        # watchOS app (SwiftUI)
    ├── App/            # Watch entry point
    ├── Features/       # 7 watch features (Dashboard, Meals, Workout, etc.)
    └── Complications/  # WidgetKit complications (calorie ring, macro bars)
```

## Building

```bash
# Build iOS app
xcodebuild -scheme Recomp -destination 'platform=iOS Simulator,name=iPhone 16'

# Build Watch app
xcodebuild -scheme RecompWatch -destination 'platform=watchOS Simulator,name=Apple Watch Series 9 (45mm)'
```

## Running

1. Select the **Recomp** scheme in Xcode
2. Choose an iOS Simulator (iPhone 15 or newer recommended)
3. Press **Cmd+R** to build and run
4. For the Watch app: select the Watch scheme and a paired Watch simulator

## Testing

The app connects to the same Next.js API backend as the web app. Make sure your backend is running and accessible from the simulator or device.

For local development:
1. Start the web app: `cd .. && npm run dev`
2. Set `RECOMP_API_URL=http://localhost:3000` in your Xcode scheme
3. Run the iOS app in the simulator

## Feature Parity

See `docs/SWIFT_APP_PLAN.md` for the complete 74-feature parity checklist and architecture documentation.
