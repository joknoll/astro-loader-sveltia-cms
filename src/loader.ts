import type { CmsConfig, EntryCollection, Field } from "@sveltia/cms";
import { glob } from "astro/loaders";
import type { Loader, LoaderContext } from "astro/loaders";

import { isEntryCollection, readCmsConfig, resolveCollection } from "./config.js";
import { frontmatterFormats } from "./schema.js";
import { transformFieldValues } from "./transforms.js";
import { buildCollectionSchema } from "./type-gen.js";

export type SveltiaLoader = Loader & {
    createSchema: () => ReturnType<typeof buildCollectionSchema>;
};
export type SveltiaEntryCollection = EntryCollection;
export type SveltiaField = Field;
export type SveltiaConfig = CmsConfig;

function wrapContextWithTransforms(
    context: LoaderContext,
    collection: EntryCollection,
): LoaderContext {
    const excludeBody = frontmatterFormats.has(collection.format);
    return {
        ...context,
        parseData: <TData extends Record<string, unknown>>(opts: {
            id: string;
            data: TData;
            filePath?: string;
        }) => {
            const transformed = transformFieldValues(
                opts.data as Record<string, unknown>,
                collection.fields,
                excludeBody,
            );
            return context.parseData({ ...opts, data: transformed as TData });
        },
    };
}

function defaultExtension(format: EntryCollection["format"]): string {
    switch (format) {
        case "yaml":
            return "yml";
        case "json":
            return "json";
        case "toml":
            return "toml";
        case "raw":
            return "txt";
        default:
            return "md";
    }
}

export function sveltiaLoader(
    collectionOrName: string | EntryCollection,
): SveltiaLoader {
    const getCollection = () => {
        const collection =
            typeof collectionOrName === "string"
                ? resolveCollection(readCmsConfig(), collectionOrName)
                : collectionOrName;
        if (!isEntryCollection(collection)) {
            throw new Error(
                `[sveltiaLoader] Collection "${collection.name}" must have a non-empty folder and a fields array. File-backed collections are not supported.`,
            );
        }
        if (collection.folder.includes("{{locale}}")) {
            throw new Error(
                `[sveltiaLoader] Collection "${collection.name}" uses a {{locale}} folder placeholder, which is not supported.`,
            );
        }
        return collection;
    };

    return {
        name: "sveltia-cms",
        createSchema: async () => buildCollectionSchema(getCollection()),
        load: async (context) => {
            const collection = getCollection();
            const extension =
                collection.extension ?? defaultExtension(collection.format);
            return glob({ pattern: `**/*.${extension}`, base: collection.folder }).load(
                wrapContextWithTransforms(context, collection),
            );
        },
    } satisfies SveltiaLoader;
}
