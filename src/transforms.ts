import { statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Field, ImageField, RelationField } from "@sveltia/cms";

import { getWidget, isBodyField, isOptionalField } from "./schema.js";
import type { LooseListField, LooseObjectField } from "./schema.js";

export const IMAGE_IMPORT_PREFIX = "__ASTRO_IMAGE_";

export type ImagePathContext = { root: URL; publicDir: URL; filePath?: string };

function isBlankString(value: unknown): boolean {
    return typeof value === "string" && value.trim().length === 0;
}

function relativeInside(dir: string, file: string): string | undefined {
    const path = relative(dir, file);
    if (path && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)) {
        return path.split(sep).join("/");
    }
}

function isFile(path: string): boolean {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

function publicImageUrl(publicDir: string, file: string): string | undefined {
    const path = relativeInside(publicDir, file);
    if (path) {
        return `/${path.split("/").map(encodeURIComponent).join("/")}`;
    }
}

function transformImagePath(value: string, ctx?: ImagePathContext): string {
    if (
        isBlankString(value) ||
        value.startsWith("//") ||
        /^[a-z][\da-z+.-]*:/i.test(value) ||
        value.startsWith(IMAGE_IMPORT_PREFIX)
    ) {
        return value;
    }
    if (value.startsWith("@") || value.startsWith("~")) {
        return `${IMAGE_IMPORT_PREFIX}${value}`;
    }

    if (ctx) {
        const root = fileURLToPath(ctx.root);
        const publicDir = fileURLToPath(ctx.publicDir);
        const suffixIndex = value.search(/[?#]/);
        const pathname = suffixIndex < 0 ? value : value.slice(0, suffixIndex);
        const suffix = value.slice(pathname.length);
        if (value.startsWith("/")) {
            // Keep public URLs when both the public directory and project root have this path.
            const publicPath = resolve(publicDir, `.${pathname}`);
            if (relativeInside(publicDir, publicPath) && isFile(publicPath)) {
                return value;
            }
            const projectPath = resolve(root, `.${pathname}`);
            const projectRelative = relativeInside(root, projectPath);
            if (projectRelative && isFile(projectPath)) {
                const publicUrl = publicImageUrl(publicDir, projectPath);
                if (publicUrl) {
                    return `${publicUrl}${suffix}`;
                }
                if (suffixIndex < 0) {
                    return `${IMAGE_IMPORT_PREFIX}/${projectRelative}`;
                }
            }
        } else if (ctx.filePath) {
            const entryDir = dirname(resolve(root, ctx.filePath));
            const entryRelative = resolve(entryDir, pathname);
            const publicUrl = publicImageUrl(publicDir, entryRelative);
            if (publicUrl && isFile(entryRelative)) {
                return `${publicUrl}${suffix}`;
            }
        }
    }
    if (value.startsWith("/")) {
        return value;
    }
    const path =
        value.startsWith("./") || value.startsWith("../") ? value : `./${value}`;
    return `${IMAGE_IMPORT_PREFIX}${path}`;
}

function transformImageValue(
    value: unknown,
    field: ImageField,
    ctx?: ImagePathContext,
): unknown {
    if (field.multiple && Array.isArray(value)) {
        return value
            .filter((item) => item !== null && !isBlankString(item))
            .map((item) =>
                typeof item === "string" ? transformImagePath(item, ctx) : item,
            );
    }
    return typeof value === "string" ? transformImagePath(value, ctx) : value;
}

function transformRelationValue(
    value: unknown,
    collection: string,
    isMultiple: boolean | undefined,
): unknown {
    if (isMultiple && Array.isArray(value)) {
        return value.map((v) =>
            typeof v === "string" && v ? { collection, id: v } : v,
        );
    }
    if (typeof value === "string" && value) {
        return { collection, id: value };
    }
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object") {
        return false;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === null || prototype === Object.prototype;
}

function transformNestedObject(
    value: unknown,
    field: LooseObjectField,
    ctx?: ImagePathContext,
): unknown {
    if (!isRecord(value)) {
        return value;
    }
    const { fields, types, typeKey = "type" } = field;
    const subFields = types
        ? types.find((type) => type.name === value[typeKey])?.fields
        : fields;
    return subFields ? transformFieldValues(value, subFields, false, ctx) : value;
}

function transformFieldValue(
    value: unknown,
    field: Field,
    ctx?: ImagePathContext,
): unknown {
    const widget = getWidget(field);
    if (isOptionalField(field)) {
        if (
            (widget === "image" || widget === "number") &&
            (value === null || isBlankString(value))
        ) {
            return undefined;
        }
        if (widget === "datetime" && isBlankString(value)) {
            return undefined;
        }
    }

    switch (widget) {
        case "image":
            return transformImageValue(value, field as ImageField, ctx);

        case "relation": {
            const { collection, multiple } = field as RelationField;
            return transformRelationValue(value, collection, multiple);
        }

        case "object":
            return transformNestedObject(value, field as LooseObjectField, ctx);

        case "list": {
            const list = field as LooseListField;
            if (list.types || list.fields) {
                const keyField = list.map_key_field;
                if (keyField && isRecord(value)) {
                    const entries = Object.entries(value);
                    if (
                        !entries.every(
                            (
                                entry,
                            ): entry is [string, Record<string, unknown> | null] =>
                                entry[1] === null || isRecord(entry[1]),
                        )
                    ) {
                        return value; // Let the array schema reject malformed maps.
                    }
                    return entries.map(([key, item]) =>
                        // Like Sveltia, restore the key before processing the item's fields.
                        transformNestedObject({ ...item, [keyField]: key }, list, ctx),
                    );
                }
                return Array.isArray(value)
                    ? value.map((item) => transformNestedObject(item, list, ctx))
                    : value;
            }
            const itemField = list.field;
            return itemField && Array.isArray(value)
                ? value.map((item) => transformFieldValue(item, itemField, ctx))
                : value;
        }

        default:
            return value;
    }
}

export function transformFieldValues(
    data: Record<string, unknown>,
    fields: Field[],
    excludeBody: boolean,
    ctx?: ImagePathContext,
): Record<string, unknown> {
    const result = { ...data };

    for (const field of fields) {
        if (excludeBody && isBodyField(field)) {
            continue;
        }
        if (!Object.hasOwn(result, field.name)) {
            continue;
        }
        const value = transformFieldValue(result[field.name], field, ctx);
        if (value === undefined) {
            delete result[field.name];
        } else {
            result[field.name] = value;
        }
    }

    return result;
}
