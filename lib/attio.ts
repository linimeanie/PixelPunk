const ATTIO_BASE = "https://api.attio.com/v2";

export type AttioMatch = {
  attioId: string;
  fullName: string;
  linkedinUrl: string | null;
  email: string | null;
  avatarUrl: string | null;
};

// Finds a person in Attio by name. Only returns a match when it's
// unambiguous (an exact case-insensitive name match, or the sole
// candidate from a substring search) — better to report "not found" than
// attach a photo to the wrong person.
export async function findGuardianInAttio(name: string): Promise<AttioMatch | null> {
  const key = process.env.ATTIO_API_KEY;
  if (!key) return null;

  const res = await fetch(`${ATTIO_BASE}/objects/people/records/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      filter: { name: { full_name: { "$contains": name } } },
      limit: 5,
    }),
  });
  if (!res.ok) return null;

  const json = await res.json();
  const records = json.data ?? [];
  if (records.length === 0) return null;

  const exact = records.filter(
    (r: any) => (r.values.name?.[0]?.full_name ?? "").toLowerCase() === name.toLowerCase()
  );
  const record = exact.length === 1 ? exact[0] : records.length === 1 ? records[0] : null;
  if (!record) return null;

  const v = record.values;
  return {
    attioId: record.id.record_id,
    fullName: v.name?.[0]?.full_name ?? name,
    linkedinUrl: v.linkedin?.[0]?.value ?? null,
    email: v.email_addresses?.[0]?.email_address ?? null,
    avatarUrl: v.avatar_url?.[0]?.value ?? null,
  };
}

export type AttioCompanyMatch = {
  companyId: string;
  companyName: string;
  domain: string | null;
  logoUrl: string | null;
};

// Finds a company in Attio by name. Same unambiguous-only rule as
// findGuardianInAttio — an exact match, or the sole substring candidate.
export async function findCompanyInAttio(name: string): Promise<AttioCompanyMatch | null> {
  const key = process.env.ATTIO_API_KEY;
  if (!key) return null;

  const res = await fetch(`${ATTIO_BASE}/objects/companies/records/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      filter: { name: { "$contains": name } },
      limit: 5,
    }),
  });
  if (!res.ok) return null;

  const json = await res.json();
  const records = json.data ?? [];
  if (records.length === 0) return null;

  const exact = records.filter(
    (r: any) => (r.values.name?.[0]?.value ?? "").toLowerCase() === name.toLowerCase()
  );
  const record = exact.length === 1 ? exact[0] : records.length === 1 ? records[0] : null;
  if (!record) return null;

  const v = record.values;
  return {
    companyId: record.id.record_id,
    companyName: v.name?.[0]?.value ?? name,
    domain: v.domains?.[0]?.domain ?? null,
    logoUrl: v.logo_url?.[0]?.value ?? null,
  };
}

function statusOptionTitle(entryValues: any, slug: string): string | null {
  return entryValues[slug]?.[0]?.option?.title ?? null;
}

// '27 takes priority over '26 when both are confirmed — a person guardian
// at DTM26 who has since reconfirmed for DTM27 is shown as this year's.
export function guardianBadgeFromStatus(dtm26Status: string | null, dtm27Status: string | null): "26" | "27" | null {
  const dtm27Confirmed = dtm27Status === "Confirmed" || dtm27Status === "DTM27 confirmed - reconfirmation needed";
  if (dtm27Confirmed) return "27";
  if (dtm26Status === "Confirmed") return "26";
  return null;
}

// Looks up this person's entry on the all_guardians list to read their
// per-edition confirmation status, and derives the '26/'27 badge from it.
export async function getGuardianBadge(attioPersonId: string): Promise<"26" | "27" | null> {
  const key = process.env.ATTIO_API_KEY;
  if (!key) return null;

  const res = await fetch(`${ATTIO_BASE}/lists/all_guardians/entries/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      filter: { parent_record: { target_record_id: { "$eq": attioPersonId } } },
      limit: 1,
    }),
  });
  if (!res.ok) return null;

  const json = await res.json();
  const entry = json.data?.[0];
  if (!entry) return null;

  const dtm26 = statusOptionTitle(entry.entry_values, "dtm26_status");
  const dtm27 = statusOptionTitle(entry.entry_values, "dtm27_status");
  return guardianBadgeFromStatus(dtm26, dtm27);
}

// Finds the guardian in Attio by name and reads their confirmed-edition
// badge in one call. Used right after a photo is committed so newly
// added guardians get labelled immediately, without a separate sync step.
export async function checkAttioGuardianBadge(name: string): Promise<{ attioId: string; badge: "26" | "27" | null } | null> {
  const match = await findGuardianInAttio(name);
  if (!match) return null;
  const badge = await getGuardianBadge(match.attioId);
  return { attioId: match.attioId, badge };
}
