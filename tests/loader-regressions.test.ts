import { existsSync, readFileSync } from "node:fs";

import type { EntryCollection, Field } from "@sveltia/cms";
import type { LoaderContext } from "astro/loaders";
import { glob } from "astro/loaders";
import { describe, expect, it, vi } from "vite-plus/test";

import { isEntryCollection, readCmsConfig } from "../src/config.ts";
import { sveltiaLoader } from "../src/loader.ts";
import { sveltiaSchema } from "../src/schema.ts";
import { transformFieldValues } from "../src/transforms.ts";
import { mockLoadContext } from "./load-context.ts";

vi.mock("astro/loaders", () => ({ glob: vi.fn(() => ({ load: vi.fn() })) }));
vi.mock("node:fs", async (importOriginal) => ({
    ...(await importOriginal<typeof import("node:fs")>()),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
}));

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
        ["yaml", "yml"],
        ["yml", "yml"],
        ["json", "json"],
        ["toml", "toml"],
    ])("infers the extension for %s", async (format, extension) => {
        await sveltiaLoader({
            name: "posts",
            folder: "/content",
            fields: [],
            format,
        }).load(mockLoadContext().context);
        expect(glob).toHaveBeenCalledWith(
            expect.objectContaining({ pattern: `*.${extension}`, base: "./content" }),
        );
    });

    it.each([
        [{ folder: "../content" }, /repository-relative/],
        [{ format: "raw" }, /unsupported format "raw"/],
        [{ format: "json-frontmatter" }, /unsupported format "json-frontmatter"/],
        [
            { format: "yaml-frontmatter", frontmatter_delimiter: "~~~" },
            /frontmatter_delimiter/,
        ],
        [{ format: "yaml", extension: "json" }, /unsupported format/],
        [{ i18n: true }, /i18n layout/],
        [{ path: "{{year}}/{{slug}}" }, /unsupported "path"/],
        [{ index_file: { name: "_index", fields: [] } }, /"index_file"/],
        [{ filter: { field: "lang", value: "en" } }, /"filter"/],
        [
            {
                fields: [
                    {
                        name: "author",
                        widget: "relation",
                        collection: "authors",
                        value_field: "id",
                    },
                ],
            },
            /field "author".*slug-based/,
        ],
    ] satisfies [Partial<EntryCollection>, RegExp][])(
        "rejects unsupported configuration %o",
        async (changes, error) => {
            const loader = sveltiaLoader({
                name: "posts",
                folder: "content",
                fields: [],
                ...changes,
            });
            await expect(loader.createSchema()).rejects.toThrow(error);
            await expect(loader.load(mockLoadContext().context)).rejects.toThrow(error);
            expect(glob).not.toHaveBeenCalled();
        },
    );
});

describe("collection IDs", () => {
    it("rejects an ordinary path and a shared index path with the same ID", async () => {
        vi.mocked(existsSync).mockReturnValueOnce(true);
        vi.mocked(glob).mockImplementationOnce(({ generateId }) => ({
            name: "glob",
            load: async () => {
                const base = new URL("file:///site/content/");
                const data = {};
                expect(generateId!({ entry: "company.md", base, data })).toBe(
                    "company",
                );
                generateId!({ entry: "company/index.md", base, data });
            },
        }));
        await expect(
            sveltiaLoader({
                name: "pages",
                folder: "content",
                nested: {},
                meta: { path: { index_file: "index" } },
                fields: [],
            }).load(mockLoadContext().context),
        ).rejects.toThrow(
            /duplicate entry ID "company".*company\.md.*company\/index\.md/,
        );
    });
});

describe("collection cache", () => {
    const posts: EntryCollection = {
        name: "posts",
        folder: "content/posts",
        fields: [{ name: "author", widget: "string" }],
    };

    it("clears unknown or changed collections but keeps unchanged entries cached", async () => {
        const { context, clear } = mockLoadContext();
        await sveltiaLoader(posts).load(context);
        await sveltiaLoader({ ...posts }).load(context);
        expect(clear).toHaveBeenCalledTimes(1);

        await sveltiaLoader({ ...posts, folder: "archive/posts" }).load(context);
        expect(clear).toHaveBeenCalledTimes(2);
    });

    it("invalidates the cache on retry even if the failed configuration is reverted", async () => {
        const { context, clear } = mockLoadContext();
        await sveltiaLoader(posts).load(context);
        vi.mocked(glob).mockReturnValueOnce({
            name: "glob",
            load: vi.fn().mockRejectedValue(new Error("could not load collection")),
        });

        await expect(
            sveltiaLoader({ ...posts, folder: "archive/posts" }).load(context),
        ).rejects.toThrow("could not load collection");
        await sveltiaLoader(posts).load(context);
        expect(clear).toHaveBeenCalledTimes(3);
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
