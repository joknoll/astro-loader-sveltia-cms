#!/usr/bin/env bash
set -euo pipefail

# Run from the packed consumer, not from the Astro project under test.
consumer="$PWD"
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
fixtures="$root/fixtures/sveltia-0.269.2"
astro="$consumer/node_modules/.bin/astro"
test -x "$astro"
site=$(mktemp -d "$consumer/content-cache.XXXXXX")
trap 'rm -rf -- "$site"' EXIT
cd "$site"
mkdir -p content/{authors,posts,inline,renamed,inferred,yaml,alias,numbers,keyed,dates,empty} src/{assets,pages} public/images
mkdir -p content/authors/{people,company} content/posts/{one,two,misplaced/deep} content/{browserJson,browserBundle}

tee astro.config.mjs >/dev/null <<'JS'
import { readFileSync } from "node:fs";
import sveltia from "astro-loader-sveltia-cms";

const authorFields = JSON.parse(readFileSync(new URL("./author-fields.json", import.meta.url), "utf8"));
const body = { name: "body", widget: "markdown" };
const title = { name: "title", widget: "string" };
const image = (name, required = true) => ({ name, widget: "image", required });
const dataCollection = (name, storage) => ({ name, folder: `content/${name}`, fields: [title, body], ...storage });
export default {
    integrations: [sveltia({ config: {
        backend: { name: "test-repo" },
        media_folder: "public/images",
        collections: [
            { name: "posts", folder: "/content/posts", path: "{{slug}}/index", fields: authorFields },
            { name: "authors", folder: "content/authors", nested: { depth: 2, subfolders: false }, fields: [{ name: "name", widget: "string" }] },
            dataCollection("inline", {
                body_field: { inline: true },
                fields: [title, body, image("local"), image("publicPath"), image("publicSource"), image("remote"), image("blank", false)],
            }),
            dataCollection("renamed", { body_field: { key: "article" }, fields: [title, body, { name: "article", widget: "markdown" }] }),
            dataCollection("inferred", { extension: "json" }),
            dataCollection("yaml", { extension: "yaml" }),
            dataCollection("alias", { format: "yml" }),
            dataCollection("numbers", { format: "json", fields: [title, { name: "optional", widget: "number", required: false }, { name: "total", widget: "compute", value_type: "int", value: "1 + 2" }] }),
            dataCollection("keyed", { format: "json", fields: [title, { name: "books", widget: "list", map_key_field: "key", fields: [{ name: "key", widget: "string" }, { name: "label", widget: "string" }] }] }),
            dataCollection("dates", { format: "json", fields: [{ name: "date", widget: "datetime" }] }),
            dataCollection("empty", { fields: [] }),
            dataCollection("browserJson", { extension: "json" }),
            dataCollection("browserBundle", { path: "{{slug}}/index", fields: [title, body, image("cover")] }),
        ],
    } })],
};
JS

tee src/content.config.ts >/dev/null <<'TS'
import { sveltiaLoader } from "astro-loader-sveltia-cms/loader";
import { defineCollection } from "astro:content";

export const collections = {
    posts: defineCollection({ loader: sveltiaLoader("posts") }),
    authors: defineCollection({ loader: sveltiaLoader("authors") }),
    inline: defineCollection({ loader: sveltiaLoader("inline") }),
    renamed: defineCollection({ loader: sveltiaLoader("renamed") }),
    inferred: defineCollection({ loader: sveltiaLoader("inferred") }),
    yaml: defineCollection({ loader: sveltiaLoader("yaml") }),
    alias: defineCollection({ loader: sveltiaLoader("alias") }),
    numbers: defineCollection({ loader: sveltiaLoader("numbers") }),
    keyed: defineCollection({ loader: sveltiaLoader("keyed") }),
    dates: defineCollection({ loader: sveltiaLoader("dates") }),
    empty: defineCollection({ loader: sveltiaLoader("empty") }),
    browserJson: defineCollection({ loader: sveltiaLoader("browserJson") }),
    browserBundle: defineCollection({ loader: sveltiaLoader("browserBundle") }),
};
TS

tee src/pages/entries.json.ts >/dev/null <<'TS'
import { getCollection, getEntries, getEntry } from "astro:content";

export async function GET() {
    const posts = (await getCollection("posts")).toSorted((a, b) => a.id.localeCompare(b.id));
    const inline = (await getEntry("inline", "one")).data;
    return Response.json({
        posts: await Promise.all(posts.map(async ({ id, data }) => ({
            id,
            author: data.author,
            editor: data.editor,
            name: typeof data.author === "object" ? (await getEntry(data.author))?.data.name : undefined,
            editors: Array.isArray(data.editor) ? (await getEntries(data.editor)).map((entry) => entry?.data.name) : undefined,
        }))),
        authors: (await getCollection("authors")).map(({ id }) => id).sort(),
        inferred: (await getEntry("inferred", "one")).data.body,
        yaml: (await getEntry("yaml", "one")).data.body,
        alias: (await getEntry("alias", "one")).data.body,
        inline: inline.body,
        images: {
            localFormat: inline.local.format,
            localWidth: inline.local.width,
            publicPath: inline.publicPath,
            publicSource: inline.publicSource,
            remote: inline.remote,
            blank: inline.blank,
        },
        renamedBody: (await getEntry("renamed", "one")).body,
        renamedData: (await getEntry("renamed", "one")).data,
        numbers: (await getEntry("numbers", "one")).data,
        keyed: (await getEntry("keyed", "one")).data.books,
        date: (await getEntry("dates", "one")).data.date,
        empty: (await getCollection("empty")).length,
        browserJson: (await getCollection("browserJson")).toSorted((a, b) => a.id.localeCompare(b.id)).map(({ id, data }) => ({ id, ...data })),
        browserBundle: (await getCollection("browserBundle")).toSorted((a, b) => a.id.localeCompare(b.id)).map(({ id, body, data }) => ({ id, body: body?.trim(), title: data.title, width: data.cover.width })),
    });
}
TS

tee src/pages/renamed.astro >/dev/null <<'ASTRO'
---
import { getEntry, render } from "astro:content";
const { Content } = await render(await getEntry("renamed", "one"));
---
<Content />
ASTRO

printf -- '---\nauthor: people/jane\neditor: [company/jane]\n---\n' > content/posts/one/index.md
cp content/posts/one/index.md content/posts/two/index.md
printf 'not an entry\n' > content/posts/loose.md
printf 'not an entry\n' > content/posts/misplaced/deep/index.md
printf -- '---\nname: Jane\nslug: shared\n---\n' > content/authors/people/jane.md
printf -- '---\nname: Editor Jane\nslug: shared\n---\n' > content/authors/company/jane.md
printf 'not an entry\n' > content/authors/_index.md
cp "$root/example/src/assets/image.webp" src/assets/cover.webp
cp src/assets/cover.webp public/images/cover.webp
tee content/inline/one.md >/dev/null <<'MD'
---
title: Inline
body: Inline Markdown
local: /src/assets/cover.webp
publicPath: /images/cover.webp
publicSource: /public/images/cover.webp
remote: https://example.invalid/cover.webp
blank: ""
---
MD
printf -- '---\ntitle: Renamed\nbody: Other field\n---\n\n**Actual article**\n' > content/renamed/one.md
printf 'title: YAML\nbody: Inferred YAML body\n' > content/yaml/one.yaml
printf 'title: Alias\nbody: YAML alias body\n' > content/alias/one.yml
printf '%s\n' '{"date":"2026-01-02T03:04:05"}' > content/dates/one.json
printf -- '---\n---\n' > content/empty/last.md
cp "$fixtures/inferred.json" content/inferred/one.json
cp "$fixtures/numbers.json" content/numbers/one.json
cp "$fixtures/keyed.json" content/keyed/one.json
for version in 0.269.2 5.0.3; do
    fixture="$root/fixtures/sveltia-$version"
    bundle="content/browserBundle/$version"
    mkdir -p "$bundle"
    cp "$fixture/browser-post.json" "content/browserJson/$version.json"
    cp "$fixture/browser-bundle.md" "$bundle/index.md"
    cp "$fixture/bundle-cover.png" "$bundle/"
done

build() {
    (cd "$consumer" && "$astro" build --root "$site" "$@")
}
printf '%s\n' '[{"name":"author","widget":"string"}]' > author-fields.json
TZ=America/Los_Angeles build
node --input-type=commonjs - <<'JS'
const assert = require("node:assert/strict");
const { posts, empty } = require("./dist/entries.json");
assert.deepEqual(posts, [{ id: "one", author: "people/jane" }, { id: "two", author: "people/jane" }]);
assert.equal(empty, 1);
JS
rm content/empty/last.md

# Only the CMS field definition changes. The Markdown and cache stay in place.
printf '%s\n' '[{"name":"author","widget":"relation","collection":"authors","search_fields":["name"],"value_field":"{{slug}}"},{"name":"editor","widget":"relation","collection":"authors","multiple":true,"search_fields":["name"]}]' > author-fields.json
TZ=America/Los_Angeles build
cp dist/entries.json warm.json
cp .astro/loaders/posts.ts warm-types.ts

# Reparse one file while the other entry still has its cached digest.
printf '\nBody edit.\n' >> content/posts/two/index.md
TZ=America/Los_Angeles build
cmp dist/entries.json warm.json
cmp .astro/loaders/posts.ts warm-types.ts

TZ=Asia/Tokyo build --force
cmp .astro/loaders/posts.ts warm-types.ts
node --input-type=commonjs - <<'JS'
const assert = require("node:assert/strict");
const clean = require("./dist/entries.json");
assert.deepEqual(require("./warm.json"), clean, "Warm build must match a clean build after a CMS field change");
assert.deepEqual(clean.posts, ["one", "two"].map((id) => ({
    id,
    author: { collection: "authors", id: "people/jane" },
    editor: [{ collection: "authors", id: "company/jane" }],
    name: "Jane",
    editors: ["Editor Jane"],
})));
assert.deepEqual(clean.authors, ["company/jane", "people/jane"]);
assert.equal(clean.inferred, "Retain this exact saved body.");
assert.equal(clean.yaml, "Inferred YAML body");
assert.equal(clean.alias, "YAML alias body");
assert.equal(clean.inline, "Inline Markdown");
assert.equal(clean.images.localFormat, "webp");
assert.ok(clean.images.localWidth > 0);
assert.equal(clean.images.publicPath, "/images/cover.webp");
assert.equal(clean.images.publicSource, "/images/cover.webp");
assert.equal(clean.images.remote, "https://example.invalid/cover.webp");
assert.ok(!Object.hasOwn(clean.images, "blank"));
assert.equal(clean.renamedBody.trim(), "**Actual article**");
assert.deepEqual(clean.renamedData, {title: "Renamed", body: "Other field"});
assert.deepEqual(clean.numbers, { title: "Numbers Coverage", total: 3 });
assert.deepEqual(clean.keyed, [{ key: "book", label: "Example Book" }]);
assert.equal(clean.date, "2026-01-02T03:04:05.000Z");
assert.equal(clean.empty, 0);
const versions = ["0.269.2", "5.0.3"];
assert.deepEqual(clean.browserJson, versions.map((id) => ({
    id, title: "Browser Post", body: "Created via CMS: café.",
})));
assert.deepEqual(clean.browserBundle, versions.map((id) => ({
    id, title: "Browser Bundle", body: "Bundle body saved by Sveltia.", width: 16,
})));
JS
grep -Fq '<strong>Actual article</strong>' dist/renamed/index.html

tee content-types.ts >/dev/null <<'TS'
import type { ImageMetadata } from "astro";
import type { Entry as Dates } from "./.astro/loaders/dates.js";
import type { Entry as Inline } from "./.astro/loaders/inline.js";
import type { Entry as Inferred } from "./.astro/loaders/inferred.js";
import type { Entry as Keyed } from "./.astro/loaders/keyed.js";
import type { Entry as Numbers } from "./.astro/loaders/numbers.js";
import type { Entry as Posts } from "./.astro/loaders/posts.js";
import type { Entry as Renamed } from "./.astro/loaders/renamed.js";

declare const post: Posts;
declare const inferred: Inferred;
declare const renamed: Renamed;
declare const numbers: Numbers;
declare const keyed: Keyed;
declare const dates: Dates;
declare const inline: Inline;
export const relation: { collection: "authors"; id: string } = post.author;
export const editor: { collection: "authors"; id: string }[] = post.editor;
export const inlineBody: string = inferred.body;
export const otherBody: string = renamed.body;
export const optionalNumber: number | undefined = numbers.optional;
export const numericCompute: number | null = numbers.total;
export const image: ImageMetadata | string | undefined = inline.blank;
// @ts-expect-error numeric Compute is not a string
export const wronglyTypedCompute: string = numbers.total;
export const listKey: string = keyed.books[0].key;
export const date: Date = dates.date;
// @ts-expect-error a transformed reference is not a slug string
export const slug: string = post.author;
// @ts-expect-error a separate body does not also appear in data
export const separateBody = renamed.article;
TS
"$consumer/node_modules/.bin/tsc" --ignoreConfig --noEmit --strict --skipLibCheck --module preserve --moduleResolution bundler content-types.ts
