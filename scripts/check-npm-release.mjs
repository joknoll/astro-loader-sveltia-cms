import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

const [, , mode, archive] = process.argv;
if (process.argv.length !== 4 || !["preflight", "verify"].includes(mode)) {
    console.error(
        "Usage: node scripts/check-npm-release.mjs <preflight|verify> <package.tgz>",
    );
    process.exit(2);
}

const registry = "https://registry.npmjs.org";
const { name, version } = JSON.parse(
    execFileSync("tar", ["-xOf", archive, "package/package.json"], {
        encoding: "utf8",
    }),
);
const release = `${name}@${version}`;
const releaseUrl = `${registry}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
const expected = integrity(readFileSync(archive));

class IntegrityError extends Error {}

function integrity(bytes) {
    return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

function fetchFresh(url) {
    // Avoid a cached 404 after publishing a version that did not exist during preflight.
    const freshUrl = new URL(url);
    freshUrl.searchParams.set("verify", String(Date.now()));
    return fetch(freshUrl, { redirect: "error", signal: AbortSignal.timeout(10_000) });
}

async function fetchDist() {
    const metadata = await fetchFresh(releaseUrl);
    if (metadata.status === 404) {
        return null;
    }
    if (!metadata.ok) {
        throw new Error(`Registry metadata returned HTTP ${metadata.status}`);
    }
    const { dist } = await metadata.json();
    if (dist?.integrity !== expected) {
        throw new IntegrityError(
            `${release} has registry integrity ${dist?.integrity}, expected ${expected}`,
        );
    }
    return dist;
}

if (mode === "preflight") {
    const exists = (await fetchDist()) !== null;
    console.log(
        exists
            ? `npm already has matching metadata for ${release}`
            : `${release} is not published`,
    );
    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `published=${exists}\n`);
    }
} else {
    const deadline = Date.now() + 300_000;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const dist = await fetchDist();
            if (!dist) {
                throw new Error("Registry metadata returned HTTP 404");
            }
            const url = new URL(dist.tarball);
            if (url.origin !== registry) {
                throw new IntegrityError(`Unexpected registry tarball URL: ${url}`);
            }
            const download = await fetchFresh(url);
            if (!download.ok) {
                throw new Error(`Tarball download returned HTTP ${download.status}`);
            }
            const actual = integrity(Buffer.from(await download.arrayBuffer()));
            if (actual !== expected) {
                throw new IntegrityError(
                    `Downloaded ${release} has integrity ${actual}, expected ${expected}`,
                );
            }
            console.log(
                `Verified registry metadata and downloaded bytes for ${release}: ${expected}`,
            );
            process.exit(0);
        } catch (error) {
            if (error instanceof IntegrityError) {
                throw error;
            }
            lastError = error;
            await setTimeout(5_000);
        }
    }
    throw new Error(`Timed out verifying ${release}`, { cause: lastError });
}
