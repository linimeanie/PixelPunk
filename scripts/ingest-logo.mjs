#!/usr/bin/env node
// Idempotent single-logo ingest: uploads white-transparent + hi-res
// original to Supabase Storage and upserts the logo + its current version.
//
// Usage: node scripts/ingest-logo.mjs --json <path-to-descriptor.json>
// Descriptor: {"companyName": "...", "whiteTransparentPath": "...", "originalHiresPath": "..."}
//
// Safe to re-run for the same company: creates a NEW version and flips the
// current pointer rather than duplicating the logo row.

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { randomUUID } from "node:crypto";

if (process.argv[2] !== "--json" || !process.argv[3]) {
  console.error("Usage: node scripts/ingest-logo.mjs --json <path-to-descriptor.json>");
  process.exit(1);
}
const { companyName, whiteTransparentPath, originalHiresPath } = JSON.parse(
  readFileSync(process.argv[3], "utf8")
);
if (!companyName || !whiteTransparentPath || !originalHiresPath) {
  console.error("Descriptor needs companyName, whiteTransparentPath, originalHiresPath");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function rest(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`REST ${opts.method || "GET"} ${path} -> ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function uploadToStorage(objectPath, filePath) {
  const bytes = readFileSync(filePath);
  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_BY_EXT[ext] || "application/octet-stream";
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/logos/${objectPath}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": contentType, "x-upsert": "true" },
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(`Storage upload -> ${res.status}: ${await res.text()}`);
  }
  return objectPath;
}

async function main() {
  const rows = await rest(`logos?company_name=eq.${encodeURIComponent(companyName)}&select=id`);
  let logoId = rows[0]?.id ?? null;

  if (!logoId) {
    const created = await rest("logos", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ company_name: companyName, status: "has_result" }),
    });
    logoId = created[0].id;
  } else {
    await rest(`logo_versions?logo_id=eq.${logoId}&is_current=eq.true`, {
      method: "PATCH",
      body: JSON.stringify({ is_current: false }),
    });
  }

  const versionId = randomUUID();
  const whiteExt = extname(whiteTransparentPath) || ".png";
  const hiresExt = extname(originalHiresPath) || ".png";
  const whitePath = await uploadToStorage(`${logoId}/${versionId}-white${whiteExt}`, whiteTransparentPath);
  const hiresPath = await uploadToStorage(`${logoId}/${versionId}-original${hiresExt}`, originalHiresPath);

  await rest("logo_versions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      logo_id: logoId,
      white_transparent_path: whitePath,
      original_hires_path: hiresPath,
      is_current: true,
      created_by: "backfill",
    }),
  });

  console.log(`OK ${companyName} -> logo ${logoId}`);
}

main().catch((err) => {
  console.error(`FAIL ${companyName}: ${err.message}`);
  process.exit(1);
});
