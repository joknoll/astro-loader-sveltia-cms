import type { Field } from "@sveltia/cms";
import type { z } from "astro/zod";
import type { TypeOverrideMap } from "zod-to-ts";
import {
    createAuxiliaryTypeStore,
    createTypeAlias,
    printNode,
    zodToTs,
} from "zod-to-ts";

import { sveltiaSchema } from "./schema.js";
import type { SchemaContext } from "./schema.js";

type TypeOverrideFunction = TypeOverrideMap extends Map<unknown, infer V> ? V : never;

const imageOverride: TypeOverrideFunction = ({ factory, SyntaxKind }) =>
    factory.createUnionTypeNode([
        factory.createTypeReferenceNode("ImageMetadata"),
        factory.createKeywordTypeNode(SyntaxKind.StringKeyword),
    ]);

export async function buildCollectionSchema(
    fields: Field[],
): Promise<{ schema: z.ZodType; types: string }> {
    const ctx: SchemaContext = { imageSchemas: [] };
    const schema = sveltiaSchema(fields, { excludeBody: false, ctx }).describe(
        "Describes the data passed to Astro validation after Sveltia loader transforms, not the raw CMS file or the final entry data returned by Astro. This is not a Sveltia CMS configuration or editor validation schema.",
    );

    const overrides: TypeOverrideMap = new Map();
    for (const s of ctx.imageSchemas) {
        overrides.set(s, imageOverride);
    }

    const auxiliaryTypeStore = createAuxiliaryTypeStore();
    const { node } = zodToTs(schema, {
        auxiliaryTypeStore,
        unrepresentable: "any",
        overrides,
    });
    const typeAlias = createTypeAlias(node, "Entry");
    const importLine =
        ctx.imageSchemas.length > 0
            ? 'import type { ImageMetadata } from "astro";\n'
            : "";
    return { schema, types: `${importLine}export ${printNode(typeAlias)}` };
}
