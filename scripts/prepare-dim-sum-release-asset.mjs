#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const CATALOG_REPOSITORY = "Ding-Ding-Projects/dim-sum-photos";
const CATALOG_COMMIT = "2541e4f85d4eb28509789eb9697e4323b9ba55c5";
const CATALOG_SCHEMA = "1.0.0";
const CATALOG_RELEASE_TAG = "catalog-v1";
const DISH_ID = "hk-dish-0001";
const EXPECTED_ASSET_NAME = "hk-dish-0001-classic-har-gow.png";
const EXPECTED_ASSET_BYTES = 2_406_444;
const EXPECTED_ASSET_SHA256 = "c6ff2d32938f1e4c4ea685442f69227b8cd387f302ab8f8a62e8dd96c62b5ac0";
const MAX_CATALOG_BYTES = 16 * 1024 * 1024;
const MAX_RELEASE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

const ALLOWED_RESPONSE_HOSTS = new Set([
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "raw.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

function parseArguments(argv) {
  const options = { assetOutputDirectory: "release", metadataOutputDirectory: "release-evidence" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--asset-output-dir") options.assetOutputDirectory = argv[++index];
    else if (argument === "--metadata-output-dir") options.metadataOutputDirectory = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.assetOutputDirectory || !options.metadataOutputDirectory) {
    throw new Error("Output-directory arguments require non-empty values.");
  }
  return options;
}

async function fetchBounded(url, maxBytes, expectedContentType) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: expectedContentType,
        "User-Agent": "MaterialPBX-release-evidence/1",
      },
    });
    if (!response.ok) throw new Error(`Official source returned HTTP ${response.status} for ${url}.`);
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== "https:" || !ALLOWED_RESPONSE_HOSTS.has(finalUrl.hostname)) {
      throw new Error(`Official source redirected to an unapproved location: ${finalUrl.href}`);
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maxBytes) {
      throw new Error(`Official response is ${declaredLength} bytes, above the ${maxBytes}-byte bound.`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error(`Official response has no readable body: ${url}`);
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Official response exceeded the ${maxBytes}-byte bound while downloading.`);
      }
      chunks.push(value);
    }

    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
    return { bytes, responseUrl: finalUrl.href, contentType: response.headers.get("content-type") ?? "" };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8 JSON: ${error.message}`);
  }
}

function assertPng(bytes) {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < pngSignature.length || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error("The selected canonical release asset is not a PNG file.");
  }
}

export async function prepareReleaseAsset({ assetOutputDirectory, metadataOutputDirectory }) {
  const catalogUrl = `https://raw.githubusercontent.com/${CATALOG_REPOSITORY}/${CATALOG_COMMIT}/catalog/index.json`;
  const releaseApiUrl = `https://api.github.com/repos/${CATALOG_REPOSITORY}/releases/tags/${CATALOG_RELEASE_TAG}`;
  const catalogResponse = await fetchBounded(catalogUrl, MAX_CATALOG_BYTES, "application/json");
  const catalog = parseJson(catalogResponse.bytes, "Pinned catalog");
  if (catalog.schemaVersion !== CATALOG_SCHEMA || !Array.isArray(catalog.dishes)) {
    throw new Error(`Pinned catalog does not match schema ${CATALOG_SCHEMA}.`);
  }
  const dish = catalog.dishes.find((entry) => entry?.id === DISH_ID);
  if (!dish) throw new Error(`Pinned catalog does not contain ${DISH_ID}.`);
  if (dish.name?.en !== "Classic Har Gow" || dish.name?.zhHant !== "蝦餃") {
    throw new Error("Pinned catalog dish names differ from the reviewed release identity.");
  }
  const catalogAssetName = path.posix.basename(dish.image?.path ?? "");
  if (catalogAssetName !== EXPECTED_ASSET_NAME) {
    throw new Error(`Pinned catalog maps ${DISH_ID} to unexpected asset ${catalogAssetName}.`);
  }

  const releaseResponse = await fetchBounded(releaseApiUrl, MAX_RELEASE_BYTES, "application/vnd.github+json");
  const catalogRelease = parseJson(releaseResponse.bytes, "Catalog release response");
  if (catalogRelease.tag_name !== CATALOG_RELEASE_TAG || catalogRelease.draft || catalogRelease.prerelease) {
    throw new Error("Canonical catalog release is missing, draft, or prerelease.");
  }
  const asset = catalogRelease.assets?.find((entry) => entry?.name === EXPECTED_ASSET_NAME);
  if (!asset) throw new Error(`Canonical catalog release does not publish ${EXPECTED_ASSET_NAME}.`);
  if (
    asset.size !== EXPECTED_ASSET_BYTES ||
    asset.digest !== `sha256:${EXPECTED_ASSET_SHA256}` ||
    asset.content_type !== "image/png"
  ) {
    throw new Error("Canonical catalog release asset metadata differs from the reviewed size, digest, or type.");
  }

  const imageResponse = await fetchBounded(asset.browser_download_url, MAX_IMAGE_BYTES, "image/png");
  assertPng(imageResponse.bytes);
  const actualDigest = createHash("sha256").update(imageResponse.bytes).digest("hex");
  if (imageResponse.bytes.length !== EXPECTED_ASSET_BYTES || actualDigest !== EXPECTED_ASSET_SHA256) {
    throw new Error("Downloaded canonical image does not match the reviewed size and SHA-256 digest.");
  }

  mkdirSync(assetOutputDirectory, { recursive: true });
  mkdirSync(metadataOutputDirectory, { recursive: true });
  const finalAssetPath = path.resolve(assetOutputDirectory, EXPECTED_ASSET_NAME);
  const temporaryAssetPath = `${finalAssetPath}.tmp-${process.pid}`;
  writeFileSync(temporaryAssetPath, imageResponse.bytes, { flag: "wx" });
  rmSync(finalAssetPath, { force: true });
  renameSync(temporaryAssetPath, finalAssetPath);

  const metadata = {
    schemaVersion: 1,
    dish: {
      id: dish.id,
      slug: dish.slug,
      name: { en: dish.name.en, zhHant: dish.name.zhHant },
      imageAlt: dish.image.alt,
    },
    asset: {
      name: EXPECTED_ASSET_NAME,
      bytes: EXPECTED_ASSET_BYTES,
      sha256: EXPECTED_ASSET_SHA256,
      url: asset.browser_download_url,
      downloadedFrom: imageResponse.responseUrl,
    },
    source: {
      repository: CATALOG_REPOSITORY,
      catalogCommit: CATALOG_COMMIT,
      catalogSchema: CATALOG_SCHEMA,
      catalogUrl,
      releaseTag: CATALOG_RELEASE_TAG,
      releaseUrl: catalogRelease.html_url,
    },
  };
  const metadataJson = `${JSON.stringify(metadata, null, 2)}\n`;
  const metadataMarkdown = `## Release dish\n\n${dish.name.en} · ${dish.name.zhHant}\n\n- Catalog revision: [\`${CATALOG_COMMIT}\`](https://github.com/${CATALOG_REPOSITORY}/commit/${CATALOG_COMMIT})\n- Published catalog release: [\`${CATALOG_RELEASE_TAG}\`](${catalogRelease.html_url})\n- Attached image: [\`${EXPECTED_ASSET_NAME}\`](${asset.browser_download_url}) (${EXPECTED_ASSET_BYTES.toLocaleString("en-US")} bytes; SHA-256 \`${EXPECTED_ASSET_SHA256}\`)\n`;
  writeFileSync(path.resolve(metadataOutputDirectory, "dim-sum.json"), metadataJson, "utf8");
  writeFileSync(path.resolve(metadataOutputDirectory, "dim-sum.md"), metadataMarkdown, "utf8");
  return metadata;
}

const options = parseArguments(process.argv.slice(2));
const metadata = await prepareReleaseAsset(options);
process.stdout.write(`${metadata.dish.name.en} · ${metadata.dish.name.zhHant} -> ${metadata.asset.name}\n`);
