#!/usr/bin/env node
// Idempotent single-guardian ingest: uploads a result image to Supabase
// Storage and upserts the guardian + its current version row.
//
// Usage: node scripts/ingest-guardian.mjs "<Full Name>" <local_file_path>
//     or: node scripts/ingest-guardian.mjs --json <path-to-{name,filePath}.json>
// The --json form sidesteps shell-quoting issues with unicode/apostrophes
// in names during batch runs.
//
// Safe to re-run for the same name: if the guardian already has a current
// version, this creates a NEW version and flips the current pointer rather
// than inserting a duplicate guardian row or leaving two "current" rows.

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { randomUUID } from "node:crypto";

let name, filePath;
if (process.argv[2] === "--json") {
  ({ name, filePath } = JSON.parse(readFileSync(process.argv[3], "utf8")));
} else {
  [, , name, filePath] = process.argv;
}
if (!name || !filePath) {
  console.error("Usage: node scripts/ingest-guardian.mjs \"<Full Name>\" <local_file_path>");
  console.error("   or: node scripts/ingest-guardian.mjs --json <path-to-{name,filePath}.json>");
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

async function findGuardianByName(n) {
  const rows = await rest(`guardians?name=eq.${encodeURIComponent(n)}&select=id`);
  return rows[0]?.id ?? null;
}

async function createGuardian(n) {
  const rows = await rest("guardians", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name: n, status: "has_result", source: "staff_upload" }),
  });
  return rows[0].id;
}

async function unsetCurrentVersions(guardianId) {
  await rest(`guardian_versions?guardian_id=eq.${guardianId}&is_current=eq.true`, {
    method: "PATCH",
    body: JSON.stringify({ is_current: false }),
  });
}

async function insertVersion(guardianId, resultPath) {
  await rest("guardian_versions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      guardian_id: guardianId,
      result_path: resultPath,
      is_current: true,
      created_by: "backfill",
    }),
  });
}

async function uploadToStorage(bucket, objectPath, bytes, contentType) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`,
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: bytes,
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Storage upload -> ${res.status}: ${body}`);
  }
}

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function main() {
  const bytes = readFileSync(filePath);
  const ext = extname(filePath).toLowerCase() || ".png";
  const contentType = MIME_BY_EXT[ext] || "application/octet-stream";

  let guardianId = await findGuardianByName(name);
  if (!guardianId) {
    guardianId = await createGuardian(name);
  } else {
    await unsetCurrentVersions(guardianId);
  }

  const versionId = randomUUID();
  const objectPath = `${guardianId}/${versionId}${ext}`;
  await uploadToStorage("guardian-photos", objectPath, bytes, contentType);
  await insertVersion(guardianId, objectPath);

  console.log(`OK ${name} -> guardian ${guardianId}, version ${objectPath}`);
}

main().catch((err) => {
  console.error(`FAIL ${name}: ${err.message}`);
  process.exit(1);
});
