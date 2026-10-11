import { defineConfig } from "vite-plus";

export default defineConfig({
    staged: { "*": "vp check --fix" },
    pack: {
        entry: { index: "./src/index.ts", loader: "./src/loader.ts" },
        copy: [{ from: "src/admin.astro", to: "dist" }],
        dts: { tsgo: true },
        exports: { customExports: { "./admin.astro": "./dist/admin.astro" } },
    },
    lint: {
        ignorePatterns: ["dist/**", "example/**"],
        rules: { curly: ["error", "all"], "no-nested-ternary": "error" },
        options: { typeAware: true, typeCheck: true },
    },
    fmt: {
        ignorePatterns: ["pnpm-lock.yaml", "example/src/content/**"],
        tabWidth: 4,
        useTabs: false,
        printWidth: 88,
        endOfLine: "lf",
        insertFinalNewline: true,
        trailingComma: "all",
        objectWrap: "collapse",
        bracketSameLine: false,
        htmlWhitespaceSensitivity: "css",
        proseWrap: "preserve",
        jsdoc: false,
        sortPackageJson: false,
        sortImports: {
            groups: [
                "builtin",
                "external",
                ["internal", "subpath"],
                ["parent", "sibling", "index"],
                "unknown",
            ],
            ignoreCase: false,
            order: "asc",
            newlinesBetween: true,
            sortSideEffects: false,
        },
    },
});
