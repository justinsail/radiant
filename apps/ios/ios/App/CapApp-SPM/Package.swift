// swift-tools-version: 5.9
import PackageDescription

// ⚠️ Capacitor generates this file and `npx cap sync` REWRITES IT, silently
// dropping everything below that it did not put there. On-device inference
// needs MLX, and this is where SPM dependencies go, so the MLX entries must be
// restored by hand after every sync. If the build suddenly cannot resolve
// 'Cmlx' or 'yyjson', this is why — a sync ate them. See TG-221.
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v17)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "7.6.8"),
        // On-device models: Apple's MLX, the same engine the Locally app uses.
        // ⚠️ The LLM libraries are NOT in mlx-swift-examples any more — that repo
        // now ships only MNIST and StableDiffusion. They live in mlx-swift-lm,
        // which also provides MLXFoundationModels (Apple's built-in model).
        .package(url: "https://github.com/ml-explore/mlx-swift-lm.git", branch: "main"),
        // the downloader + tokenizer the MLXHuggingFace macros expect
        .package(url: "https://github.com/huggingface/swift-huggingface.git", branch: "main"),
        .package(url: "https://github.com/huggingface/swift-transformers.git", branch: "main"),
        .package(name: "CapacitorDevice", path: "../../../node_modules/@capacitor/device"),
        .package(name: "CapacitorHaptics", path: "../../../node_modules/@capacitor/haptics"),
        .package(name: "CapacitorKeyboard", path: "../../../node_modules/@capacitor/keyboard"),
        .package(name: "CapacitorStatusBar", path: "../../../node_modules/@capacitor/status-bar")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorDevice", package: "CapacitorDevice"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar"),
                .product(name: "MLXLLM", package: "mlx-swift-lm"),
                .product(name: "MLXLMCommon", package: "mlx-swift-lm"),
                .product(name: "MLXHuggingFace", package: "mlx-swift-lm"),
                .product(name: "HuggingFace", package: "swift-huggingface"),
                .product(name: "Tokenizers", package: "swift-transformers")
            ]
        )
    ]
)
