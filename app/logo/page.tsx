import Link from "next/link";

export default function LogoModule() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <Link href="/" className="font-mono text-xs text-[#8b7ba8] hover:text-white">
        ← Cyberpunk &amp; Logo Hub
      </Link>
      <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
        Partner Marks
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-white">Logo</h1>
      <p className="mt-3 max-w-md text-sm text-[#a89bc4]">
        Search, upload, and reconciliation are coming next. This is the module shell.
      </p>
    </div>
  );
}
