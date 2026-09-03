import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-[#8b7ba8]">
        Deep Tech Momentum
      </p>
      <h1 className="mt-3 text-4xl font-semibold text-white">PixelPunk</h1>
      <p className="mt-5 max-w-md text-sm text-[#a89bc4]">
        Hi! Lina here, Visiting Associate during the DTM26 crunch times. I created this tool
        for your ease in the hope that you will treat it respectfully. If you are a newbie,
        please watch a manual <span className="text-[#ff6b8f] underline decoration-dotted">here</span>.
      </p>

      <div className="mt-12 grid w-full max-w-2xl gap-5 sm:grid-cols-2">
        <ModuleCard title="Cyberpunk" href="/cyberpunk" />
        <ModuleCard title="Logo" href="/logo" />
      </div>
    </div>
  );
}

function ModuleCard({ title, href }: { title: string; href: string }) {
  return (
    <Link
      href={href}
      className="group flex h-40 flex-col items-center justify-center rounded-2xl border border-[#2a1e42] bg-[#16112c] p-6 transition hover:border-[#d4367a]"
    >
      <h2 className="text-3xl font-semibold text-white group-hover:text-[#ff6b8f]">
        {title}
      </h2>
    </Link>
  );
}
