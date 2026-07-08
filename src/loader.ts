import { glob } from "astro/loaders";
import type { Loader, LoaderContext } from "astro/loaders";
import type { CmsConfig, EntryCollection, Field } from "@sveltia/cms";
import { readCmsConfig, resolveCollection } from "./config.js";
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

export function sveltiaLoader(collectionOrName: string | EntryCollection): SveltiaLoader {
  const getCollection = () =>
    typeof collectionOrName === "string"
      ? resolveCollection(readCmsConfig(), collectionOrName)
      : collectionOrName;

  return {
    name: "sveltia-cms",
    createSchema: async () => buildCollectionSchema(getCollection()),
    load: async (context) => {
      const collection = getCollection();
      const extension = collection.extension ?? "md";
      return glob({ pattern: `**/*.${extension}`, base: collection.folder }).load(
        wrapContextWithTransforms(context, collection),
      );
    },
  } satisfies SveltiaLoader;
}
