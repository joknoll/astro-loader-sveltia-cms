import { readFileSync } from "node:fs";

import type { EntryCollection, Field } from "@sveltia/cms";
import type { LoaderContext } from "astro/loaders";
import { glob } from "astro/loaders";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isEntryCollection, readCmsConfig } from "../src/config.ts";
import { sveltiaLoader } from "../src/loader.ts";
import { sveltiaSchema } from "../src/schema.ts";
import { transformFieldValues } from "../src/transforms.ts";

vi.mock("astro/loaders", () => ({ glob: vi.fn(() => ({ load: vi.fn() })) }));
vi.mock("node:fs", async (importOriginal) => ({
    ...(await importOriginal<typeof import("node:fs")>()),
    readFileSync: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("collection storage", () => {
    it.each([undefined, "", "  "])("rejects an invalid folder: %s", async (folder) => {
        const collection: EntryCollection = { name: "posts", folder, fields: [] };
        expect(isEntryCollection(collection)).toBe(false);
        await expect(sveltiaLoader(collection).createSchema()).rejects.toThrow(
            /non-empty folder/,
        );
        await expect(
            sveltiaLoader(collection).load({} as LoaderContext),
        ).rejects.toThrow(/non-empty folder/);
        expect(glob).not.toHaveBeenCalled();
    });

    it("rejects JSON-array collections instead of globbing the project root", async () => {
        const loader = sveltiaLoader({ name: "posts", file: "posts.json", fields: [] });
        await expect(loader.load({} as LoaderContext)).rejects.toThrow(
            /File-backed collections/,
        );
        expect(glob).not.toHaveBeenCalled();
    });

    it("rejects unexpanded locale folders", async () => {
        const loader = sveltiaLoader({
            name: "posts",
            folder: "content/{{locale}}",
            fields: [],
        });
        await expect(loader.createSchema()).rejects.toThrow(/locale/);
    });

    it.each([
        [undefined, "md"],
        ["yaml", "yml"],
        ["json", "json"],
        ["toml", "toml"],
        ["raw", "txt"],
        ["yaml-frontmatter", "md"],
    ])("infers the extension for %s", async (format, extension) => {
        await sveltiaLoader({
            name: "posts",
            folder: "content",
            fields: [],
            format,
        }).load({} as LoaderContext);
        expect(glob).toHaveBeenCalledWith({
            pattern: `**/*.${extension}`,
            base: "content",
        });
    });

    it("preserves an explicit extension", async () => {
        await sveltiaLoader({
            name: "posts",
            folder: "content",
            fields: [],
            format: "yaml",
            extension: "yaml",
        }).load({} as LoaderContext);
        expect(glob).toHaveBeenCalledWith({ pattern: "**/*.yaml", base: "content" });
    });
});

describe("single-field list transformations", () => {
    it.each([false, true])(
        "handles relation multiple: %s per list item",
        (multiple) => {
            const fields: Field[] = [
                {
                    name: "authors",
                    widget: "list",
                    field: {
                        name: "author",
                        widget: "relation",
                        collection: "authors",
                        multiple,
                    },
                },
            ];
            const ref = { collection: "authors", id: "jane" };
            const transformed = transformFieldValues(
                { authors: multiple ? [["jane"]] : ["jane"] },
                fields,
                false,
            );
            expect(transformed.authors).toEqual(multiple ? [[ref]] : [ref]);
            expect(sveltiaSchema(fields).safeParse(transformed).success).toBe(true);
        },
    );

    it("recurses through an object used as the single list field", () => {
        const fields: Field[] = [
            {
                name: "items",
                widget: "list",
                field: {
                    name: "item",
                    widget: "object",
                    fields: [
                        { name: "cover", widget: "image" },
                        { name: "author", widget: "relation", collection: "authors" },
                    ],
                },
            },
        ];
        const transformed = transformFieldValues(
            { items: [{ cover: "photo.jpg", author: "jane" }] },
            fields,
            false,
        );
        expect(transformed.items).toEqual([
            {
                cover: "__ASTRO_IMAGE_./photo.jpg",
                author: { collection: "authors", id: "jane" },
            },
        ]);
        expect(sveltiaSchema(fields).safeParse(transformed).success).toBe(true);
    });
});

describe("CMS configuration reads", () => {
    it("does not retain stale configuration between reads", () => {
        vi.mocked(readFileSync)
            .mockReturnValueOnce('{"collections":[]}')
            .mockReturnValueOnce('{"collections":[{"name":"posts"}]}');
        expect(readCmsConfig().collections).toEqual([]);
        expect(readCmsConfig().collections).toEqual([{ name: "posts" }]);
    });

    it("preserves the underlying read error", () => {
        const cause = new Error("permission denied");
        vi.mocked(readFileSync).mockImplementationOnce(() => {
            throw cause;
        });
        expect(readCmsConfig).toThrow(expect.objectContaining({ cause }));
    });
});
