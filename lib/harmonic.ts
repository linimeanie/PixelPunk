// Looks up a person's profile photo via Harmonic.ai, given a LinkedIn URL
// and/or email sourced from Attio. Harmonic requires one of these — it
// doesn't do free-text name search. A person Harmonic hasn't cached yet
// comes back 404 with an async enrichment job kicked off ("check back in
// a few hours") — for our purposes that's the same as "no photo right
// now", so we just treat any non-200 as null rather than waiting.
export async function findHarmonicPhotoUrl(
  linkedinUrl: string | null,
  email: string | null
): Promise<string | null> {
  const key = process.env.HARMONIC_API_KEY;
  if (!key || (!linkedinUrl && !email)) return null;

  const params = new URLSearchParams();
  if (linkedinUrl) params.set("linkedin_url", linkedinUrl);
  if (email) params.set("email", email);

  try {
    const res = await fetch(`https://api.harmonic.ai/persons?${params.toString()}`, {
      method: "POST",
      headers: { apikey: key },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.profile_picture_url ?? null;
  } catch {
    return null;
  }
}

// Looks up a company's logo via Harmonic.ai, given a domain sourced from
// Attio. Same "any non-200 means no logo right now" handling as the
// person lookup above.
export async function findHarmonicCompanyLogoUrl(domain: string | null): Promise<string | null> {
  const key = process.env.HARMONIC_API_KEY;
  if (!key || !domain) return null;

  const params = new URLSearchParams({ website_url: `https://${domain}` });

  try {
    const res = await fetch(`https://api.harmonic.ai/companies?${params.toString()}`, {
      method: "POST",
      headers: { apikey: key },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.logo_url ?? null;
  } catch {
    return null;
  }
}
