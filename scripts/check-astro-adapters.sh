#!/usr/bin/env bash
set -euo pipefail

archive=$(realpath "$1")
site=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/sveltia-adapters.XXXXXX")
server_pid=
cleanup() {
    if [[ -n "$server_pid" ]]; then
        kill "$server_pid" 2>/dev/null || true
        wait "$server_pid" 2>/dev/null || true
    fi
    rm -rf -- "$site"
}
trap cleanup EXIT
export ASTRO_TELEMETRY_DISABLED=1
cd "$site"
printf '%s\n' '{"private":true,"type":"module"}' > package.json
npm install --engine-strict --no-audit --no-fund "$archive" astro@7.4.13 @astrojs/mdx@8.1.6 @astrojs/node@11.1.14
mkdir -p content/{posts,translated} src/pages

tee astro.config.mjs >/dev/null <<'JS'
import mdx from "@astrojs/mdx";
import node from "@astrojs/node";
import sveltia from "astro-loader-sveltia-cms";

const title = { name: "title", widget: "string" };
export default {
    adapter: node({ mode: "standalone" }),
    output: "server",
    integrations: [mdx(), sveltia({ config: {
        backend: { name: "test-repo" },
        i18n: { structure: "single_file", locales: ["en", "de"], default_locale: "en" },
        collections: [
            { name: "posts", folder: "content/posts", extension: "mdx", fields: [title, { name: "body", widget: "markdown" }] },
            { name: "settings", files: [{ name: "settings", file: "content/settings.json", fields: [{ name: "general", widget: "object", fields: [title] }] }] },
            { name: "records", file: "content/records.json", fields: [{ name: "id", widget: "string" }, title] },
            { name: "translated", folder: "content/translated", format: "json", i18n: true, fields: [{ ...title, i18n: true }] },
        ],
    } })],
};
JS

tee src/content.config.ts >/dev/null <<'TS'
import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";
import { sveltiaLoader } from "astro-loader-sveltia-cms/loader";

export const collections = {
    posts: defineCollection({
        loader: sveltiaLoader("posts"),
        schema: z.object({ title: z.string().transform((value) => value.toUpperCase()) }),
    }),
    settings: defineCollection({ loader: file("content/settings.json") }),
    records: defineCollection({ loader: file("content/records.json") }),
    translated: defineCollection({
        loader: glob({ base: "content/translated", pattern: "*.json" }),
        schema: z.record(z.string(), z.object({ title: z.string() })),
    }),
};
TS

tee src/live.config.ts >/dev/null <<'TS'
import { defineLiveCollection } from "astro:content";

const entry = { id: "a", data: { title: "Separate live content" } };
export const collections = {
    example: defineLiveCollection({ loader: {
        name: "example-live",
        loadEntry: async () => entry,
        loadCollection: async () => ({ entries: [entry] }),
    } }),
};
TS

tee src/pages/index.astro >/dev/null <<'ASTRO'
---
import { getEntry, getLiveEntry, render } from "astro:content";
const post = await getEntry("posts", "post");
const { Content } = await render(post);
const settings = await getEntry("settings", "general");
const record = await getEntry("records", "alpha");
const translated = await getEntry("translated", "first");
const live = await getLiveEntry("example", "a");
---
<h1>{post.data.title}</h1>
<Content />
<ul>
    <li>{settings.data.title}</li>
    <li>{record.data.title}</li>
    <li>{translated.data.en.title}</li>
    <li>{translated.data.de.title}</li>
    <li>{live.entry?.data.title}</li>
</ul>
ASTRO

tee src/pages/editor.astro >/dev/null <<'ASTRO'
---
import Admin from "astro-loader-sveltia-cms/admin.astro";
export const prerender = true;
---
<Admin />
ASTRO

printf -- '---\ntitle: Schema override\n---\n\n**Rendered MDX** {2 + 3}\n' > content/posts/post.mdx
printf '%s\n' '{"general":{"title":"Separate file collection"}}' > content/settings.json
printf '%s\n' '[{"id":"alpha","title":"JSON-array record"}]' > content/records.json
printf '%s\n' '{"en":{"title":"Hello"},"de":{"title":"Hallo"}}' > content/translated/first.json
./node_modules/.bin/astro build

port=$(node --input-type=module -e 'import { createServer } from "node:net"; const s = createServer(); s.listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); });')
HOST=127.0.0.1 PORT="$port" node dist/server/entry.mjs >server.log 2>&1 &
server_pid=$!
for ((i=0; i<30; i++)); do
    if curl --silent --fail "http://127.0.0.1:$port/" --output index.html; then
        break
    fi
    sleep 1
done
if [[ ! -f index.html ]]; then
    tail -80 server.log >&2
    exit 1
fi
for text in '<h1>SCHEMA OVERRIDE</h1>' '<strong>Rendered MDX</strong> 5' '<li>Separate file collection</li>' '<li>JSON-array record</li>' '<li>Hello</li>' '<li>Hallo</li>' '<li>Separate live content</li>'; do
    grep -Fq "$text" index.html || { printf 'Missing SSR output: %s\n' "$text" >&2; exit 1; }
done
curl --silent --show-error --fail "http://127.0.0.1:$port/admin/" --output admin.html
grep -Fq '<title>Sveltia CMS</title>' admin.html
curl --silent --show-error --fail "http://127.0.0.1:$port/editor/" --output editor.html
grep -Fq '<title>Sveltia CMS</title>' editor.html
printf 'Verified native loader coexistence, MDX, SSR, schema override, live entry, and admin\n'
