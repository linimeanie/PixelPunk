import Link from "next/link";

async function getCounts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { guardians: null, logos: null };

  try {
    const { supabaseAdmin } = await import("@/lib/supabase");
    const supabase = supabaseAdmin();
    const [{ count: guardians }, { count: logos }] = await Promise.all([
      supabase.from("guardians").select("*", { count: "exact", head: true }),
      supabase.from("logos").select("*", { count: "exact", head: true }),
    ]);
    return { guardians, logos };
  } catch {
    return { guardians: null, logos: null };
  }
}

export default async function Home() {
  const { guardians, logos } = await getCounts();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-[#8b7ba8]">
        Deep Tech Momentum · DTM27
      </p>
      <h1 className="mt-3 text-4xl font-semibold text-white">Cyberpunk &amp; Logo Hub</h1>
      <p className="mt-3 max-w-md text-sm text-[#a89bc4]">
        What are you working on? Search first, upload second — nothing is saved without a
        confirm.
      </p>

      <div className="mt-12 grid w-full max-w-2xl gap-5 sm:grid-cols-2">
        <ModuleCard
          eyebrow="Guardian Portraits"
          title="Cyberpunk"
          description="Guardian event photos, stylised and stored one version per person."
          count={guardians}
          countLabel="on file"
          href="/cyberpunk"
        />
        <ModuleCard
          eyebrow="Partner Marks"
          title="Logo"
          description="Partner, startup and investor logos. White version plus original hi-res."
          count={logos}
          countLabel="on file"
          href="/logo"
        />
      </div>
    </div>
  );
}

function ModuleCard({
  eyebrow,
  title,
  description,
  count,
  countLabel,
  href,
}: {
  eyebrow: string;
  title: string;
  description: string;
  count: number | null;
  countLabel: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-[#2a1e42] bg-[#16112c] p-6 text-left transition hover:border-[#d4367a]"
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-white group-hover:text-[#ff6b8f]">
        {title}
      </h2>
      <p className="mt-2 text-sm text-[#a89bc4]">{description}</p>
      <p className="mt-6 font-mono text-xs text-[#6b5f8a]">
        {count === null ? "—" : count} {countLabel}
      </p>
    </Link>
  );
}
