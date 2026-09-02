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
