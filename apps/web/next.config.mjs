import { createRequire } from "module";

// Resolve the absolute path to the types package once at startup.
// Node follows the file: symlink correctly on all platforms.
const require = createRequire(import.meta.url);
const typesEntry = require.resolve("@auditsimple/types");

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Tells webpack's SWC loader to transpile this package's .ts source
    // instead of skipping it as a pre-compiled node_module.
    transpilePackages: ["@auditsimple/types"],

    // Provides webpack an explicit absolute-path alias so it never has to
    // follow the file: symlink itself — resolving .ts entry points through
    // symlinks is where webpack can stumble on Windows.
    webpack(config) {
        config.resolve.alias["@auditsimple/types"] = typesEntry;
        return config;
    },
};

export default nextConfig;
