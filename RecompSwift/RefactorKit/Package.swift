// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "RefactorKit",
    platforms: [
        .iOS(.v17),
        .watchOS(.v10)
    ],
    products: [
        .library(name: "RefactorKit", targets: ["RefactorKit"])
    ],
    targets: [
        .target(
            name: "RefactorKit",
            path: "Sources"
        ),
        .testTarget(
            name: "RefactorKitTests",
            dependencies: ["RefactorKit"],
            path: "Tests"
        )
    ]
)
