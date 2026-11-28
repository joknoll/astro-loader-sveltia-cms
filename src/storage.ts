import { posix } from "node:path";

import type { Field, RelationField } from "@sveltia/cms";

import type { FolderCollection } from "./config.js";

const markdownExtensions = new Set([
    "md",
    "markdown",
    "mdown",
    "mkdn",
    "mkd",
    "mdwn",
    "mdx",
]);
const defaultDataExtensions = new Map([
    ["yaml", "yml"],
    ["json", "json"],
    ["toml", "toml"],
]);

function dataFormat(extension: string): string | undefined {
    if (extension === "yaml" || extension === "yml") {
        return "yaml";
    }
    return extension === "json" || extension === "toml" ? extension : undefined;
}

function storageError(collection: string, reason: string): never {
    throw new Error(
        `[sveltiaLoader] Collection "${collection}" ${reason}. Use a native Astro loader for this storage layout.`,
    );
}

function checkRelations(collection: string, fields: Field[], prefix = ""): void {
    for (const field of fields) {
        const path = `${prefix}${field.name}`;
        if (field.widget === "relation") {
            const { value_field } = field as RelationField;
            if (value_field !== undefined && value_field !== "{{slug}}") {
                throw new Error(
                    `[sveltiaLoader] Collection "${collection}", field "${path}": only slug-based relations are supported. Omit value_field or use "{{slug}}".`,
                );
            }
        }
        if ("fields" in field && field.fields) {
            checkRelations(collection, field.fields, `${path}.`);
        }
        if ("field" in field && field.field) {
            checkRelations(collection, [field.field], `${path}.`);
        }
        if ("types" in field && field.types) {
            for (const variant of field.types) {
                checkRelations(collection, variant.fields, `${path}.${variant.name}.`);
            }
        }
    }
}

export function resolveStorage(collection: FolderCollection) {
    const { name, body_field, frontmatter_delimiter, nested, path } = collection;
    if (collection.folder.includes("{{locale}}") || collection.i18n) {
        storageError(name, "uses an i18n layout or a {{locale}} folder placeholder");
    }
    if (collection.filter !== undefined) {
        storageError(name, 'uses unsupported "filter" membership');
    }
    if (collection.index_file) {
        storageError(name, 'uses unsupported "index_file" inclusion');
    }

    const folder = posix.normalize(collection.folder.replace(/^\/+/, ""));
    if (
        folder === ".." ||
        folder.startsWith("../") ||
        /[\\\0]/.test(folder) ||
        /^[A-Za-z]:/.test(folder)
    ) {
        storageError(name, 'must use a repository-relative "folder"');
    }
    const base = `./${folder.split("/").map(encodeURIComponent).join("/")}`;

    const explicitFormat = collection.format === "yml" ? "yaml" : collection.format;
    const extension =
        collection.extension ?? defaultDataExtensions.get(explicitFormat ?? "") ?? "md";
    const extensionFormat = dataFormat(extension);
    const format = explicitFormat ?? extensionFormat ?? "frontmatter";
    const markdown = markdownExtensions.has(extension);
    const compatible = markdown
        ? ["frontmatter", "yaml-frontmatter", "toml-frontmatter"].includes(format)
        : extensionFormat !== undefined && format === extensionFormat;
    if (!compatible) {
        storageError(
            name,
            `uses unsupported format "${format}" with extension "${extension}"`,
        );
    }
    if (frontmatter_delimiter !== undefined) {
        const expected = format === "toml-frontmatter" ? "+++" : "---";
        const delimiters = Array.isArray(frontmatter_delimiter)
            ? frontmatter_delimiter
            : [frontmatter_delimiter, frontmatter_delimiter];
        if (
            !markdown ||
            delimiters.length !== 2 ||
            delimiters.some((value) => value !== expected)
        ) {
            storageError(name, 'uses unsupported "frontmatter_delimiter"');
        }
    }

    // Sveltia matches regular collections directly under the folder, unless a
    // supported path template or the nested-entries option says otherwise.
    const bundle =
        path === "{{slug}}/index" || (path === "{{slug}}/_index" && extension === "md");
    if (
        (path !== undefined && path !== "{{slug}}" && !bundle) ||
        (nested && path !== undefined)
    ) {
        storageError(name, `uses unsupported "path" template ${JSON.stringify(path)}`);
    }
    const sharedIndex =
        nested?.subfolders === false ? undefined : collection.meta?.path?.index_file;
    if (collection.meta?.path?.index_file && !nested) {
        storageError(name, 'uses "meta.path.index_file" without nested entries');
    }

    const allowHugoIndex = collection.meta?.path?.index_file === "_index";
    const filename =
        extension === "md" && !allowHugoIndex
            ? "!(_index|_index.+([a-zA-Z0-9_-])).md"
            : `*.${extension}`;
    let pattern: string | string[] = filename;
    if (bundle) {
        pattern = `*/${path!.split("/")[1]}.${extension}`;
    } else if (nested) {
        const { depth } = nested;
        if (depth === undefined) {
            pattern = `**/${filename}`;
        } else if (Number.isSafeInteger(depth) && depth > 0 && depth <= 100) {
            pattern = Array.from(
                { length: depth },
                (_, index) => `${"*/".repeat(index)}${filename}`,
            );
        } else {
            storageError(
                name,
                'uses unsupported "nested.depth" (expected an integer from 1 to 100)',
            );
        }
    }

    // A separate body is returned by Astro as entry.body, not entry.data.
    const bodyKey =
        markdown && !body_field?.inline ? (body_field?.key ?? "body") : undefined;
    const fields = collection.fields.filter((field) => field.name !== bodyKey);
    checkRelations(name, fields);

    const idForEntry = (entry: string) => {
        const stem = entry.slice(0, -`.${extension}`.length);
        if (bundle || (sharedIndex && stem.endsWith(`/${sharedIndex}`))) {
            return posix.dirname(stem);
        }
        return stem;
    };
    return { base, pattern, fields, idForEntry };
}
