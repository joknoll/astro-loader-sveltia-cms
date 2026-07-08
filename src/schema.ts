import { z } from "astro/zod";
import type {
  CodeField,
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
import type { ImageFunction } from "astro/content/config";

// Upstream ObjectField/ListField are unions whose variant-specific props can't
// be read without narrowing; these loose shapes cover all variants at once.
export type LooseObjectField = {
  fields?: Field[];
  types?: VariableFieldType[];
  typeKey?: string;
};
export type LooseListField = LooseObjectField & { field?: Field };

export type SchemaContext = {
  image?: ImageFunction;
  imageSchemas: z.ZodType[];
  /** Maps each relation Zod schema instance to its target collection name. */
  relationSchemas: Map<z.ZodType, string>;
};

/**
 * File formats that store the document body separately from frontmatter.
 * The default format (undefined) is yaml-frontmatter; "frontmatter" is the
 * extension-based auto-detect variant.
 */
export const frontmatterFormats = new Set([
  "frontmatter",
  "yaml-frontmatter",
  "toml-frontmatter",
  "json-frontmatter",
  undefined,
]);

export function getWidget(field: Field): string {
  return "widget" in field && field.widget ? field.widget : "string";
}

export function isBodyField(field: Field): boolean {
  const widget = getWidget(field);
  return field.name === "body" && (widget === "markdown" || widget === "richtext");
}

export function isOptionalField(field: Field): boolean {
  if (!("required" in field)) return false;
  // `required` can be boolean or LocaleCode[].
  // An empty locale array means "required in no locale", which is treated as optional.
  if (Array.isArray(field.required)) return field.required.length === 0;
  return field.required === false;
}

function applyOptional(schema: z.ZodType, field: Field): z.ZodType {
  return isOptionalField(field) ? schema.optional() : schema;
}

function fieldsToShape(fields: Field[], ctx?: SchemaContext): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    shape[field.name] = applyOptional(fieldToZod(field, ctx), field);
  }
  return shape;
}

export function getSelectValues(
  options: SelectFieldValue[] | { label: string; value: SelectFieldValue }[],
): SelectFieldValue[] {
  if (options.length === 0) return [];
  const first = options[0];
  if (typeof first === "object" && first !== null && "value" in first) {
    return (options as { label: string; value: SelectFieldValue }[]).map((o) => o.value);
  }
  return options as SelectFieldValue[];
}

export function selectValuesToZod(values: SelectFieldValue[]): z.ZodType {
  if (values.length === 0) return z.any();

  const allStrings = values.every((v) => typeof v === "string");
  if (allStrings) {
    if (values.length === 1) return z.literal(values[0] as string);
    return z.enum(values as [string, ...string[]]);
  }

  const literals = values.map((v) => {
    if (v === null) return z.null();
    if (typeof v === "number") return z.literal(v);
    return z.literal(v as string);
  });

  if (literals.length === 1) return literals[0];
  return z.union(literals as z.ZodType[]);
}

type ZodObjectShape = z.ZodObject<Record<string, z.ZodType>>;

function variantsToDiscriminatedUnion(
  variants: VariableFieldType[],
  typeKey: string,
  ctx?: SchemaContext,
): z.ZodType {
  if (variants.length === 0) return z.object({});
  const schemas = variants.map((variant) =>
    z.object({
      [typeKey]: z.literal(variant.name),
      ...fieldsToShape(variant.fields ?? [], ctx),
    }),
  );
  if (schemas.length === 1) return schemas[0];
  return z.discriminatedUnion(typeKey, schemas as [ZodObjectShape, ...ZodObjectShape[]]);
}

function numberFieldToZod(field: Field): z.ZodType {
  const valueType = (field as NumberField).value_type ?? "int";
  if (valueType === "int/string" || valueType === "float/string") {
    return z.union([z.number(), z.string()]);
  }
  return z.number();
}

function imageFieldToZod(field: Field, ctx?: SchemaContext): z.ZodType {
  const isMultiple = (field as ImageField).multiple;
  if (ctx?.image) {
    return isMultiple ? z.array(ctx.image()) : ctx.image();
  }
  const inner = z.string();
  if (ctx) ctx.imageSchemas.push(inner);
  return isMultiple ? z.array(inner) : inner;
}

/**
 * Relation fields are stored as slug strings in frontmatter. The loader
 * pre-transforms them to `{ collection, id }` objects before parseData runs
 * (see transformFieldValues in transforms.ts), so the runtime schema validates
 * objects rather than strings.
 *
 * The TypeScript type is overridden in type-gen.ts to use the specific
 * collection literal: `{ collection: "members"; id: string }`.
 */
function relationFieldToZod(field: Field, ctx?: SchemaContext): z.ZodType {
  const { collection, multiple } = field as RelationField;
  const refSchema = z.object({ collection: z.literal(collection), id: z.string() });
  if (ctx) ctx.relationSchemas.set(refSchema, collection);
  return multiple ? z.array(refSchema) : refSchema;
}

function selectFieldToZod(field: Field): z.ZodType {
  const { options, multiple } = field as SelectField;
  const valueSchema = selectValuesToZod(getSelectValues(options));
  return multiple ? z.array(valueSchema) : valueSchema;
}

function codeFieldToZod(field: Field): z.ZodType {
  const { output_code_only, keys = { code: "code", lang: "lang" } } = field as CodeField;
  if (output_code_only) return z.string();
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
  if (types) return variantsToDiscriminatedUnion(types, typeKey, ctx);
  return z.object(fields ? fieldsToShape(fields, ctx) : {});
}

function listFieldToZod(field: Field, ctx?: SchemaContext): z.ZodType {
  const { field: singleField, fields, types, typeKey = "type" } = field as LooseListField;

  if (types) {
    if (types.length === 0) return z.array(z.any());
    return z.array(variantsToDiscriminatedUnion(types, typeKey, ctx));
  }
  if (fields) return z.array(z.object(fieldsToShape(fields, ctx)));
  if (singleField) return z.array(fieldToZod(singleField, ctx));
  return z.array(z.string());
}

export function fieldToZod(field: Field, ctx?: SchemaContext): z.ZodType {
  switch (getWidget(field)) {
    case "string":
    case "text":
    case "color":
    case "map":
    case "uuid":
    case "compute":
    case "markdown":
    case "richtext":
      return z.string();

    case "number":
      return numberFieldToZod(field);

    case "boolean":
      return z.boolean();

    case "datetime":
      return z.coerce.date();

    case "image":
      return imageFieldToZod(field, ctx);

    case "file":
      return (field as FileField).multiple ? z.array(z.string()) : z.string();

    case "select":
      return selectFieldToZod(field);

    case "relation":
      return relationFieldToZod(field, ctx);

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
  {
    excludeBody = true,
    ctx,
  }: {
    excludeBody?: boolean;
    ctx?: SchemaContext;
  } = {},
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    if (excludeBody && isBodyField(field)) continue;
    shape[field.name] = applyOptional(fieldToZod(field, ctx), field);
  }
  return z.object(shape);
}
