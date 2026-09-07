import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Essentia ships a large WebAssembly runtime and is only used by the
  // server-side processing worker. Loading it through Node keeps normal page
  // compilation fast and prevents it from entering browser bundles.
  serverExternalPackages: ["essentia.js"],
};

export default nextConfig;
