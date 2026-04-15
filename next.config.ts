import type { NextConfig } from "next";
import path from "path";

const projectRoot = __dirname;

const nextConfig: NextConfig = {
  // Use project root so Vercel / local build doesn’t infer parent lockfiles
  turbopack: { root: projectRoot },
  // Prevent bundling issues with Smithy HTTP handler used for Bedrock web grounding
  serverExternalPackages: ["@smithy/node-http-handler"],
  webpack: (config) => {
    // Force resolution from project directory (avoids resolving from parent /Users/v when run in workspace)
    config.context = projectRoot;
    config.resolve ??= {};
    config.resolve.modules = [
      path.join(projectRoot, "node_modules"),
      ...(Array.isArray(config.resolve.modules) ? config.resolve.modules : ["node_modules"]),
    ];
    return config;
  },
};

export default nextConfig;
