import { existsSync } from "node:fs";

import type { CmsConfig, EntryCollection, Field } from "@sveltia/cms";
import { glob } from "astro/loaders";
import type { Loader, LoaderContext } from "astro/loaders";

import { isEntryCollection, readCmsConfig, resolveCollection } from "./config.js";
import { resolveStorage } from "./storage.js";
import { transformFieldValues } from "./transforms.js";
import { buildCollectionSchema } from "./type-gen.js";

const COLLECTION_DIGEST_KEY = "sveltia-collection-config-digest";
// Bump when loader changes require reparsing otherwise unchanged files.
const STORE_VERSION = 2;

export type SveltiaLoader = Loader & {
    createSchema: () => ReturnType<typeof buildCollectionSchema>;
};
export type SveltiaEntryCollection = EntryCollection;
export type SveltiaField = Field;
export type SveltiaConfig = CmsConfig;

/** Augmented by the integration with the names of its folder collections. */
export interface SveltiaCollections {}

type SveltiaCollectionName = keyof SveltiaCollections extends never
    ? string
    : Extract<keyof SveltiaCollections, string>;

function wrapContextWithTransforms(
    context: LoaderContext,
    fields: Field[],
): LoaderContext {
    return {
        ...context,
        parseData: <TData extends Record<string, unknown>>(opts: {
            id: string;
            data: TData;
            filePath?: string;
        }) => {
            if (
                !opts.data ||
                typeof opts.data !== "object" ||
                Array.isArray(opts.data)
            ) {
                throw new Error(
                    `[sveltiaLoader] Entry "${opts.filePath ?? opts.id}" must contain a data object.`,
                );
            }
            const transformed = transformFieldValues(
                opts.data,
                fields,
                false,
                context.config && {
                    root: context.config.root,
                    publicDir: context.config.publicDir,
                    filePath: opts.filePath,
                },
            );
            return context.parseData({ ...opts, data: transformed as TData });
        },
    };
}

export function sveltiaLoader(
    collectionOrName: SveltiaCollectionName | EntryCollection,
    cmsConfig?: CmsConfig,
): SveltiaLoader {
    const getCollection = (root?: URL) => {
        const collection =
            typeof collectionOrName === "string"
                ? resolveCollection(cmsConfig ?? readCmsConfig(root), collectionOrName)
                : collectionOrName;
        if (!isEntryCollection(collection)) {
            throw new Error(
                `[sveltiaLoader] Collection "${collection.name}" must have a non-empty folder and a fields array. File-backed collections are not supported.`,
            );
        }
        return collection;
    };

    return {
        name: "sveltia-cms",
        createSchema: async () => {
            const collection = getCollection();
            const { fields } = resolveStorage(collection);
            return buildCollectionSchema(fields);
        },
        load: async (context) => {
            const collection = getCollection(context.config?.root);
            const { base, pattern, fields, idForEntry } = resolveStorage(collection);
            const digest = context.generateDigest({
                collection,
                version: STORE_VERSION,
            });
            const configChanged = context.meta.get(COLLECTION_DIGEST_KEY) !== digest;
            if (configChanged) {
                // Astro's glob cache only tracks file contents, not the CMS config.
                context.meta.delete(COLLECTION_DIGEST_KEY);
                context.store.clear();
            }

            const pathsById = new Map<string, string>();
            await glob({
                pattern,
                base,
                generateId: ({ entry, base }) => {
                    const id = idForEntry(entry);
                    const previous = pathsById.get(id);
                    const previousUrl =
                        previous &&
                        new URL(
                            `./${previous.split("/").map(encodeURIComponent).join("/")}`,
                            base,
                        );
                    if (
                        previous &&
                        previous !== entry &&
                        previousUrl &&
                        existsSync(previousUrl)
                    ) {
                        throw new Error(
                            `[sveltiaLoader] Collection "${collection.name}" has duplicate entry ID "${id}" in "${previous}" and "${entry}".`,
                        );
                    }
                    pathsById.set(id, entry);
                    return id;
                },
            }).load(wrapContextWithTransforms(context, fields));

            // Astro 7.0's glob returns early for an empty directory instead of
            // removing the last cached entry. Keep the same result across Astro 7.
            for (const id of context.store.keys()) {
                if (!pathsById.has(id)) {
                    context.store.delete(id);
                }
            }

            if (configChanged) {
                context.meta.set(COLLECTION_DIGEST_KEY, digest);
            }
        },
    } satisfies SveltiaLoader;
}
