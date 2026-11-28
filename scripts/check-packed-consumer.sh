#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 && $# -ne 3 ]] ||
    [[ $# -eq 3 && ( ! "$2" =~ ^(floor|current|latest)$ || ! "$3" =~ ^(pnpm|npm)$ ) ]]; then
    printf 'Usage: bash %s <package.tgz> [<floor|current|latest> <pnpm|npm>]\n' "$0" >&2
    exit 2
fi

archive=$(realpath "$1")
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
packed_manifest=$(tar -xOf "$archive" package/package.json)
export ASTRO_TELEMETRY_DISABLED=1

check_consumer() (
    lane=$1
    manager=$2
    consumer=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/sveltia-astro-consumer.XXXXXX")
    trap 'rm -rf -- "$consumer"' EXIT

    cd "$root"
    typescript=$(node -p 'require("typescript/package.json").version')
    current=$(node -p 'require("astro/package.json").version')
    cp -R example/astro.config.mjs example/public example/src example/tsconfig.json "$consumer"

    cd "$consumer"
    node --input-type=commonjs - "$packed_manifest" "$archive" "$lane" "$manager" "$current" "$typescript" <<'JS'
const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const [, , packedManifest, archive, lane, manager, current, typescript] = process.argv;
const { name, peerDependencies, devEngines } = JSON.parse(packedManifest);
const peer = peerDependencies.astro;
const floor = /^\^(\d+\.\d+\.\d+)$/.exec(peer)?.[1];
if (!floor) throw new Error(`Cannot read an exact Astro floor from peer range ${peer}`);

let astro;
switch (lane) {
    case "floor":
        astro = floor;
        break;
    case "current":
        astro = current;
        break;
    case "latest": {
        const versions = JSON.parse(execFileSync("npm", ["view", `astro@${peer}`, "version", "--json"], { encoding: "utf8" }));
        astro = [versions].flat().sort((a, b) => b.localeCompare(a, "en", { numeric: true }))[0];
        break;
    }
    default:
        throw new Error(`Unknown Astro lane: ${lane}`);
}
if (!/^\d+\.\d+\.\d+$/.test(astro)) throw new Error(`Expected an exact Astro version, got ${astro}`);

const manifest = {
    name: "packed-sveltia-consumer",
    private: true,
    type: "module",
    ...(manager === "pnpm" ? { devEngines } : {}),
    // Astro 7.0 needs project-level Sharp for the example's optimized images with no hoisting.
    dependencies: { [name]: `file:${archive}`, astro, sharp: "^0.35.4" },
    devDependencies: { typescript },
};
writeFileSync("package.json", JSON.stringify(manifest, null, 4));
console.log(`${name}: Astro ${astro} (${lane}), ${manager}, Node ${process.version}`);
JS

    if [[ "$manager" == pnpm ]]; then
        tee pnpm-workspace.yaml >/dev/null <<'YAML'
nodeLinker: isolated
hoist: false
strictPeerDependencies: true
autoInstallPeers: false
engineStrict: true
allowBuilds:
    esbuild: true
    sharp: true
YAML
        pnpm --version
        pnpm install --no-frozen-lockfile
        test ! -e node_modules/@sveltia/cms
    else
        npm --version
        npm install --engine-strict --no-audit --no-fund
    fi

    node --input-type=commonjs <<'JS'
const assert = require("node:assert/strict");
const { realpathSync } = require("node:fs");
const { createRequire } = require("node:module");
const { join, sep } = require("node:path");
const { astro } = require("./package.json").dependencies;
const astroRequire = createRequire(require.resolve("astro/package.json"));
const vitePath = realpathSync(astroRequire.resolve("vite/package.json"));
const vite = astroRequire(vitePath);
assert.equal(require("astro/package.json").version, astro);
assert.ok(vitePath.startsWith(join(realpathSync("."), "node_modules") + sep), vitePath);
assert.equal(vite.name, "vite", "Astro must resolve stock Vite, not the workspace alias");
console.log(`Verified stock Vite ${vite.version}`);
JS

    tee consumer-types.ts >/dev/null <<'TS'
import type { CmsConfig } from "astro-loader-sveltia-cms";
import {
    sveltiaLoader,
    type SveltiaConfig,
    type SveltiaEntryCollection,
    type SveltiaField,
    type SveltiaLoader,
} from "astro-loader-sveltia-cms/loader";
import type { CollectionEntry } from "astro:content";

const field: SveltiaField = { name: "title", widget: "string" };
const collection: SveltiaEntryCollection = { name: "standalone", folder: "posts", fields: [field] };
const named: SveltiaLoader = sveltiaLoader("posts");
const direct: SveltiaLoader = sveltiaLoader(collection);
const config: SveltiaConfig = { backend: { name: "test-repo" }, collections: [collection] };
export const checkedConfig: CmsConfig = config;
export const loaders = [named, direct];
export const publishedDate = (post: CollectionEntry<"posts">): Date => post.data.date;

// @ts-expect-error the CMS config does not declare this collection
sveltiaLoader("unknown-collection");
// @ts-expect-error the loader does not return a number or any
export const notANumber: number = sveltiaLoader("posts");
TS

    ./node_modules/.bin/astro sync
    ./node_modules/.bin/tsc --noEmit
    ./node_modules/.bin/astro build
    test -f dist/cms/index.html

    # Without the generated declarations, named loaders still accept a string.
    printf '%s\n' 'import { sveltiaLoader } from "astro-loader-sveltia-cms/loader";' 'sveltiaLoader("not-in-astro-config");' > standalone-types.ts
    ./node_modules/.bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --module preserve --moduleResolution bundler standalone-types.ts

    bash "$root/scripts/check-content-cache.sh"
)

if [[ $# -eq 3 ]]; then
    check_consumer "$2" "$3"
else
    for lane in floor current; do
        for manager in pnpm npm; do
            check_consumer "$lane" "$manager"
        done
    done
fi
