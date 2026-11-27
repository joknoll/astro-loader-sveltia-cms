import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { CmsConfig } from "@sveltia/cms";
import type { AstroIntegration } from "astro";

import { isEntryCollection } from "./config.js";

export type { CmsConfig };

export type SveltiaOptions = { route?: string; title?: string; config: CmsConfig };

const VIRTUAL_MODULE_ID = "virtual:astro-loader-sveltia-cms/config";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;
const LOADER_ID = "astro-loader-sveltia-cms/loader";
const PROJECT_LOADER_ID = "\0virtual:astro-loader-sveltia-cms/project-loader";

function getEntryCollectionNames(config: CmsConfig): string[] {
    return (config.collections ?? []).filter(isEntryCollection).map((c) => c.name);
}

function jsonValueSource(value: unknown): string {
    // Parse JSON rather than creating a JS object literal with special keys.
    return `JSON.parse(${JSON.stringify(JSON.stringify(value))})`;
}

function buildTypeDeclaration(collectionNames: string[]): string {
    if (collectionNames.length === 0) {
        return "";
    }
    const properties = [...new Set(collectionNames)]
        .map((name) => `    ${JSON.stringify(name)}: true;`)
        .join("\n");
    return `export {};

declare module "astro-loader-sveltia-cms/loader" {
  interface SveltiaCollections {
${properties}
  }
}
`;
}

export default function sveltiaCms(options: SveltiaOptions): AstroIntegration {
    const route = options.route ?? "/admin";
    const title = options.title ?? options.config.app_title ?? "Sveltia CMS";
    const config: CmsConfig = { ...options.config, load_config_file: false };

    return {
        name: "astro-loader-sveltia-cms",
        hooks: {
            "astro:config:setup": ({
                injectRoute,
                updateConfig,
                createCodegenDir,
                logger,
            }) => {
                injectRoute({
                    pattern: route,
                    entrypoint: fileURLToPath(
                        new URL("./admin.astro", import.meta.url),
                    ),
                });

                // Write config to .astro/integrations/astro-loader-sveltia-cms/config.json so
                // the content loader can read it without a live Vite server.
                const codegenDir = createCodegenDir();
                writeFileSync(
                    fileURLToPath(new URL("config.json", codegenDir)),
                    JSON.stringify(config),
                );

                // Register the virtual module used by admin.astro at runtime.
                updateConfig({
                    vite: {
                        plugins: [
                            {
                                name: "vite-plugin-astro-loader-sveltia-cms-config",
                                enforce: "pre",
                                resolveId(id, importer, options) {
                                    if (id === VIRTUAL_MODULE_ID) {
                                        return RESOLVED_VIRTUAL_MODULE_ID;
                                    }
                                    if (
                                        id === LOADER_ID &&
                                        options.ssr &&
                                        importer !== PROJECT_LOADER_ID
                                    ) {
                                        return PROJECT_LOADER_ID;
                                    }
                                },
                                load(id) {
                                    if (id === RESOLVED_VIRTUAL_MODULE_ID) {
                                        return `
                                            export const config = ${jsonValueSource(config)};
                                            export const title = ${JSON.stringify(title)};
                                        `;
                                    }
                                    if (id === PROJECT_LOADER_ID) {
                                        // Astro's createSchema() has no loader context. Bind the
                                        // config at module resolution, where Vite knows the project.
                                        return `
                                            export * from "${LOADER_ID}";
                                            import { sveltiaLoader as loader } from "${LOADER_ID}";
                                            const config = ${jsonValueSource(config)};
                                            export const sveltiaLoader = (collection, cmsConfig = config) =>
                                                loader(collection, cmsConfig);
                                        `;
                                    }
                                },
                            },
                        ],
                    },
                });

                logger.info(`Sveltia CMS injected at ${route}`);
            },

            "astro:config:done": ({ injectTypes }) => {
                const collectionNames = getEntryCollectionNames(config);
                if (collectionNames.length === 0) {
                    return;
                }

                injectTypes({
                    filename: "types.d.ts",
                    content: buildTypeDeclaration(collectionNames),
                });
            },
        },
    };
}
