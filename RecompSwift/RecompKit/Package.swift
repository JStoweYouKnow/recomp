// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "RecompKit",
    platforms: [
        .iOS(.v17),
        .watchOS(.v10)
    ],
    products: [
        .library(name: "RecompKit", targets: ["RecompKit"])
    ],
    targets: [
        .target(
            name: "RecompKit",
            path: "Sources"
        ),
        .testTarget(
            name: "RecompKitTests",
            dependencies: ["RecompKit"],
            path: "Tests"
        )
    ]
)
