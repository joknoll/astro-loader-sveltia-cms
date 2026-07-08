import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    entry: {
      index: "./src/index.ts",
      loader: "./src/loader.ts",
    },
    copy: [{ from: "src/admin.astro", to: "dist" }],
    dts: {
      tsgo: true,
    },
    exports: {
      customExports: {
        "./admin.astro": "./dist/admin.astro",
      },
    },
  },
  lint: {
    ignorePatterns: ["dist/**", "example/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
