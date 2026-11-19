import type { Field, ImageField, RelationField } from "@sveltia/cms";

import { getWidget, isBodyField } from "./schema.js";
import type { LooseListField, LooseObjectField } from "./schema.js";

export const IMAGE_IMPORT_PREFIX = "__ASTRO_IMAGE_";

export function normalizeImagePath(val: string): string {
    if (!val) {
        return val;
    }
    if (
        val.includes("://") ||
        val.startsWith("/") ||
        val.startsWith(".") ||
        val.startsWith("~") ||
        val.startsWith("@")
    ) {
        return val;
    }
    return `./${val}`;
}

function prefixImageValue(value: unknown, isMultiple: boolean | undefined): unknown {
    if (isMultiple && Array.isArray(value)) {
        return value.map((v) =>
            typeof v === "string" && v
                ? `${IMAGE_IMPORT_PREFIX}${normalizeImagePath(v)}`
                : v,
        );
    }
    if (typeof value === "string" && value) {
        return `${IMAGE_IMPORT_PREFIX}${normalizeImagePath(value)}`;
    }
    return value;
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

function transformNestedObject(value: unknown, field: LooseObjectField): unknown {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return value;
    }
    const record = value as Record<string, unknown>;
    const { fields, types, typeKey = "type" } = field;
    const subFields = types
        ? types.find((type) => type.name === record[typeKey])?.fields
        : fields;
    return subFields ? transformFieldValues(record, subFields, false) : value;
}

function transformFieldValue(value: unknown, field: Field): unknown {
    switch (getWidget(field)) {
        case "image":
            return prefixImageValue(value, (field as ImageField).multiple);

        case "relation": {
            const { collection, multiple } = field as RelationField;
            return transformRelationValue(value, collection, multiple);
        }

        case "object":
            return transformNestedObject(value, field as LooseObjectField);

        case "list": {
            if (!Array.isArray(value)) {
                return value;
            }
            const list = field as LooseListField;
            if (list.types || list.fields) {
                return value.map((item) => transformNestedObject(item, list));
            }
            const itemField = list.field;
            return itemField
                ? value.map((item) => transformFieldValue(item, itemField))
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
): Record<string, unknown> {
    const result = { ...data };

    for (const field of fields) {
        if (excludeBody && isBodyField(field)) {
            continue;
        }
        const value = result[field.name];
        if (Object.hasOwn(result, field.name) && value != null) {
            result[field.name] = transformFieldValue(value, field);
        }
    }

    return result;
}
