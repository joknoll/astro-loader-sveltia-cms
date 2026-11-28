import type {
    CodeField,
    ComputeField,
    Field,
    FileField,
    HiddenField,
    ImageField,
    NumberField,
    RelationField,
    SelectField,
    SelectFieldValue,
    VariableFieldType,
} from "@sveltia/cms";
import { z } from "astro/zod";

// Upstream ObjectField/ListField are unions whose variant-specific props can't
// be read without narrowing; these loose shapes cover all variants at once.
export type LooseObjectField = {
    fields?: Field[];
    types?: VariableFieldType[];
    typeKey?: string;
};
export type LooseListField = LooseObjectField & {
    field?: Field;
    map_key_field?: string;
};

export type SchemaContext = { imageSchemas: z.ZodType[] };

export function getWidget(field: Field): string {
    return "widget" in field && field.widget ? field.widget : "string";
}

export function isBodyField(field: Field): boolean {
    const widget = getWidget(field);
    return field.name === "body" && (widget === "markdown" || widget === "richtext");
}

export function isOptionalField(field: Field): boolean {
    if (!("required" in field)) {
        return false;
    }
    // `required` can be boolean or LocaleCode[].
    // An empty locale array means "required in no locale", which is treated as optional.
    if (Array.isArray(field.required)) {
        return field.required.length === 0;
    }
    return field.required === false;
}

function applyOptional(schema: z.ZodType, field: Field): z.ZodType {
    return isOptionalField(field) ? schema.optional() : schema;
}

function fieldsToShape(
    fields: Field[],
    ctx?: SchemaContext,
    excludeBody = false,
): Record<string, z.ZodType> {
    const shape: Record<string, z.ZodType> = {};
    for (const field of fields) {
        if (excludeBody && isBodyField(field)) {
            continue;
        }
        shape[field.name] = applyOptional(fieldToZod(field, ctx), field);
    }
    return shape;
}

export function getSelectValues(options: SelectField["options"]): SelectFieldValue[] {
    return options.map((option) =>
        typeof option === "object" && option !== null ? option.value : option,
    );
}

export function selectValuesToZod(values: SelectFieldValue[]): z.ZodType {
    return values.length === 0 ? z.any() : z.literal(values);
}

type ZodObjectShape = z.ZodObject<Record<string, z.ZodType>>;

function variantsToDiscriminatedUnion(
    fieldName: string,
    variants: VariableFieldType[],
    typeKey: string,
    ctx?: SchemaContext,
): z.ZodType {
    if (variants.length === 0) {
        return z.object({});
    }
    const names = new Set<string>();
    const schemas = variants.map(({ name, fields = [] }) => {
        if (names.has(name)) {
            throw new Error(
                `[sveltiaLoader] Field "${fieldName}" has duplicate variant "${name}".`,
            );
        }
        if (fields.some((field) => field.name === typeKey)) {
            throw new Error(
                `[sveltiaLoader] Field "${fieldName}" variant "${name}" has a subfield named "${typeKey}", which is reserved for the type discriminator. Set typeKey to a different name.`,
            );
        }
        names.add(name);
        return z.object({ [typeKey]: z.literal(name), ...fieldsToShape(fields, ctx) });
    });
    if (schemas.length === 1) {
        return schemas[0];
    }
    return z.discriminatedUnion(
        typeKey,
        schemas as [ZodObjectShape, ...ZodObjectShape[]],
    );
}

function numberFieldToZod(field: Field): z.ZodType {
    const valueType = (field as NumberField).value_type ?? "int";
    if (valueType === "int/string" || valueType === "float/string") {
        return z.union([z.number(), z.string()]);
    }
    return z.number();
}

function computeFieldToZod(field: ComputeField): z.ZodType {
    switch (field.value_type) {
        case "int":
            return z.int().nullable();
        case "float":
            return z.number().nullable();
        case "int/string":
        case "float/string":
            return z.string();
        default:
            return field.value === "{{index}}"
                ? z.union([z.int().nonnegative(), z.literal("")])
                : z.string();
    }
}

function dateFieldToZod(): z.ZodType {
    return z
        .union(
            [
                z.date(),
                z.iso.date(),
                z.iso.datetime({ local: true, offset: true }),
                z.number(),
            ],
            {
                error: "Expected an ISO date or timestamp, a Date, or epoch milliseconds",
            },
        )
        .transform((value) => {
            if (
                typeof value === "string" &&
                value.includes("T") &&
                !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)
            ) {
                return new Date(`${value}Z`);
            }
            // Return a plain Date even when a parser supplied a Date subclass.
            return new Date(value);
        })
        .pipe(z.date());
}

function imageFieldToZod(field: ImageField, ctx?: SchemaContext): z.ZodType {
    // Astro resolves marked local image strings to ImageMetadata after Zod parsing.
    const inner = z.string().regex(/\S/, "Expected a non-blank image path");
    ctx?.imageSchemas.push(inner);
    return field.multiple ? z.array(inner) : inner;
}

/**
 * Relation fields are stored as slug strings in frontmatter. The loader
 * pre-transforms them to `{ collection, id }` objects before parseData runs
 * (see transformFieldValues in transforms.ts), so the runtime schema validates
 * objects rather than strings.
 */
function relationFieldToZod(field: Field): z.ZodType {
    const { collection, multiple } = field as RelationField;
    const refSchema = z.object({ collection: z.literal(collection), id: z.string() });
    return multiple ? z.array(refSchema) : refSchema;
}

function selectFieldToZod(field: Field): z.ZodType {
    const { options, multiple } = field as SelectField;
    const valueSchema = selectValuesToZod(getSelectValues(options));
    return multiple ? z.array(valueSchema) : valueSchema;
}

function codeFieldToZod(field: Field): z.ZodType {
    const { output_code_only, keys = { code: "code", lang: "lang" } } =
        field as CodeField;
    if (output_code_only) {
        return z.string();
    }
    return z.object({ [keys.code]: z.string(), [keys.lang]: z.string() });
}

/**
 * Infers the Zod type for a `hidden` field from its `default` value's JS type.
 * Falls back to `z.any()` when no default is provided, since a hidden field
 * without a default has no statically known type. This is a best-effort
 * approximation: it assumes the stored value always matches the default's type.
 */
function hiddenFieldToZod(field: Field): z.ZodType {
    const { default: defaultValue } = field as HiddenField;
    switch (typeof defaultValue) {
        case "string":
            return z.string();
        case "number":
            return z.number();
        case "boolean":
            return z.boolean();
        default:
            return z.any();
    }
}

function objectFieldToZod(field: Field, ctx?: SchemaContext): z.ZodType {
    const { fields, types, typeKey = "type" } = field as LooseObjectField;
    if (types) {
        return variantsToDiscriminatedUnion(field.name, types, typeKey, ctx);
    }
    return z.object(fields ? fieldsToShape(fields, ctx) : {});
}

function listFieldToZod(field: Field, ctx?: SchemaContext): z.ZodType {
    const {
        field: singleField,
        fields,
        types,
        typeKey = "type",
        map_key_field: mapKeyField,
    } = field as LooseListField;

    if (types) {
        if (mapKeyField === typeKey) {
            throw new Error(
                `[sveltiaLoader] Field "${field.name}" uses "${typeKey}" for both map_key_field and the type discriminator. Set typeKey to a different name.`,
            );
        }
        if (types.length === 0) {
            return z.array(z.any());
        }
        return z.array(variantsToDiscriminatedUnion(field.name, types, typeKey, ctx));
    }
    if (fields) {
        return z.array(z.object(fieldsToShape(fields, ctx)));
    }
    if (singleField) {
        return z.array(applyOptional(fieldToZod(singleField, ctx), singleField));
    }
    return z.array(z.string());
}

export function fieldToZod(field: Field, ctx?: SchemaContext): z.ZodType {
    switch (getWidget(field)) {
        case "string":
        case "text":
        case "color":
        case "map":
        case "uuid":
        case "markdown":
        case "richtext":
            return z.string();

        case "compute":
            return computeFieldToZod(field as ComputeField);

        case "number":
            return numberFieldToZod(field);

        case "boolean":
            return z.boolean();

        case "datetime":
            return dateFieldToZod();

        case "image":
            return imageFieldToZod(field as ImageField, ctx);

        case "file":
            return (field as FileField).multiple ? z.array(z.string()) : z.string();

        case "select":
            return selectFieldToZod(field);

        case "relation":
            return relationFieldToZod(field);

        case "keyvalue":
            return z.record(z.string(), z.string());

        case "code":
            return codeFieldToZod(field);

        case "hidden":
            return hiddenFieldToZod(field);

        case "object":
            return objectFieldToZod(field, ctx);

        case "list":
            return listFieldToZod(field, ctx);

        default:
            return z.any();
    }
}

export function sveltiaSchema(
    fields: Field[],
    { excludeBody = true, ctx }: { excludeBody?: boolean; ctx?: SchemaContext } = {},
): z.ZodObject<Record<string, z.ZodType>> {
    return z.object(fieldsToShape(fields, ctx, excludeBody));
}
