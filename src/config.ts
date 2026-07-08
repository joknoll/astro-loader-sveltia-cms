import { readFileSync } from "node:fs";
import type { CmsConfig, EntryCollection, FileCollection } from "@sveltia/cms";

const CONFIG_PATH = ".astro/integrations/astro-loader-sveltia-cms/config.json";

export function isEntryCollection(c: unknown): c is EntryCollection {
  return (
    typeof c === "object" &&
    c !== null &&
    "name" in c &&
    typeof (c as EntryCollection).name === "string" &&
    "folder" in c &&
    "fields" in c
  );
}

// ponytail: config.json is written once per process by the integration hook,
// so a single module-level cache is enough.
let cachedConfig: CmsConfig | undefined;

export function readCmsConfig(): CmsConfig {
  if (cachedConfig) return cachedConfig;
  const configPath = `${process.cwd()}/${CONFIG_PATH}`;
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error(
        `[sveltiaLoader] CMS config at ${configPath} is not a valid JSON object ` +
          `(got ${parsed === null ? "null" : typeof parsed}).`,
      );
    }
    cachedConfig = parsed as CmsConfig;
    return cachedConfig;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("[sveltiaLoader]")) throw err;
    throw new Error(
      `[sveltiaLoader] Could not read CMS config from ${configPath}. ` +
        `Make sure the astro-loader-sveltia-cms integration is added to your astro.config.mjs.`,
    );
  }
}

export function resolveCollection(config: CmsConfig, name: string): EntryCollection {
  const collections = config.collections ?? [];
  const match = collections.find((c) => "name" in c && c.name === name);

  if (!match) {
    const available = collections
      .filter((c): c is EntryCollection | FileCollection => "name" in c)
      .map((c) => c.name);
    const list = available.length > 0 ? available.join(", ") : "(none)";
    throw new Error(
      `[sveltiaLoader] Collection "${name}" not found in CMS config. ` +
        `Available collections: ${list}`,
    );
  }

  if (!isEntryCollection(match)) {
    throw new Error(
      `[sveltiaLoader] Collection "${name}" is not a folder-based entry collection. ` +
        `Only entry collections (with "folder" and "fields") are supported by sveltiaLoader.`,
    );
  }

  return match;
}
