import type { AstroIntegration } from "astro";
import type { CmsConfig } from "@sveltia/cms";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isEntryCollection } from "./config.js";

export type { CmsConfig };

export type SveltiaOptions = {
  route?: string;
  title?: string;
  config: CmsConfig;
};

const VIRTUAL_MODULE_ID = "virtual:astro-loader-sveltia-cms/config";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;

function getEntryCollectionNames(config: CmsConfig): string[] {
  return (config.collections ?? []).filter(isEntryCollection).map((c) => c.name);
}

function buildVirtualModuleSource(config: CmsConfig, title: string): string {
  // JSON.stringify is safe here: the config is user-controlled and served as a
  // JS module (not injected into an HTML script tag), so </script> sequences
  // are not a concern. Any unusual Unicode is the user's responsibility.
  return `
    export const config = ${JSON.stringify(config)};
    export const title = ${JSON.stringify(title)};
  `;
}

function buildTypeDeclaration(collectionNames: string[]): string {
  if (collectionNames.length === 0) return "";
  const unionType = collectionNames.map((n) => JSON.stringify(n)).join(" | ");
  return `declare module "astro-loader-sveltia-cms/loader" {
  import type { EntryCollection } from "@sveltia/cms";
  import type { SveltiaLoader } from "astro-loader-sveltia-cms/loader";

  type SveltiaCollectionName = ${unionType};

  export function sveltiaLoader(name: SveltiaCollectionName): SveltiaLoader;
  export function sveltiaLoader(collection: EntryCollection): SveltiaLoader;
}
`;
}

export default function sveltiaCms(options: SveltiaOptions): AstroIntegration {
  const route = options.route ?? "/admin";
  const title = options.title ?? "Sveltia CMS";
  const config: CmsConfig = { ...options.config, load_config_file: false };

  return {
    name: "astro-loader-sveltia-cms",
    hooks: {
      "astro:config:setup": ({ injectRoute, updateConfig, createCodegenDir, logger }) => {
        injectRoute({
          pattern: route,
          entrypoint: fileURLToPath(new URL("./admin.astro", import.meta.url)),
        });

        // Write config to .astro/integrations/astro-loader-sveltia-cms/config.json so
        // the content loader can read it without a live Vite server.
        const codegenDir = createCodegenDir();
        writeFileSync(fileURLToPath(new URL("config.json", codegenDir)), JSON.stringify(config));

        // Register the virtual module used by admin.astro at runtime.
        updateConfig({
          vite: {
            plugins: [
              {
                name: "vite-plugin-astro-loader-sveltia-cms-config",
                resolveId(id) {
                  if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID;
                },
                load(id) {
                  if (id === RESOLVED_VIRTUAL_MODULE_ID) {
                    return buildVirtualModuleSource(config, title);
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
        if (collectionNames.length === 0) return;

        injectTypes({
          filename: "types.d.ts",
          content: buildTypeDeclaration(collectionNames),
        });
      },
    },
  };
}
