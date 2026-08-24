// swift-tools-version: 5.9
import PackageDescription

// Capacitor generates this file, but on-device inference needs a native
// dependency and this is where SPM dependencies go. `npx cap sync` may rewrite
// it — if the MLX entries below disappear, that is why. See TG-221.
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v17)],   // MLXLLM requires iOS 17+
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0"),
        // On-device models: Apple's MLX, the same engine the Locally app uses.
        // ⚠️ The LLM libraries are NOT in mlx-swift-examples any more — that repo
        // now ships only MNIST and StableDiffusion. They live in mlx-swift-lm,
        // which also provides MLXFoundationModels (Apple's built-in model).
        .package(url: "https://github.com/ml-explore/mlx-swift-lm.git", branch: "main"),
        // the downloader + tokenizer the MLXHuggingFace macros expect
        .package(url: "https://github.com/huggingface/swift-huggingface.git", branch: "main"),
        .package(url: "https://github.com/huggingface/swift-transformers.git", branch: "main")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "MLXLLM", package: "mlx-swift-lm"),
                .product(name: "MLXLMCommon", package: "mlx-swift-lm"),
                .product(name: "MLXHuggingFace", package: "mlx-swift-lm"),
                .product(name: "HuggingFace", package: "swift-huggingface"),
                .product(name: "Tokenizers", package: "swift-transformers")
            ]
        )
    ]
)
