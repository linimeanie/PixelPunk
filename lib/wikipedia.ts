// Looks up a company's official logo via Wikidata — reliable specifically
// for well-known companies, since only sufficiently notable ones have a
// Wikidata item at all, and its logo (P154, when present) is almost
// always a clean vector/transparent Commons file rather than a
// social-card thumbnail. No API key needed; both endpoints are public.
export async function findWikipediaLogoUrl(name: string): Promise<string | null> {
  try {
    const searchRes = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=1&type=item`
    );
    if (!searchRes.ok) return null;
    const searchJson = await searchRes.json();
    const qid = searchJson?.search?.[0]?.id;
    if (!qid) return null;

    const entityRes = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
    if (!entityRes.ok) return null;
    const entityJson = await entityRes.json();
    const claims = entityJson?.entities?.[qid]?.claims;
    const filename = claims?.P154?.[0]?.mainsnak?.datavalue?.value;
    if (!filename || typeof filename !== "string") return null;

    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
  } catch {
    return null;
  }
}
