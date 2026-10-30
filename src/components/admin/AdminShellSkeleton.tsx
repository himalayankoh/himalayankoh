/**
 * The console's first paint, before the admin session is known.
 *
 * `/admin` is prerendered, and a browser has no session while the server renders,
 * so the document that arrives is whatever this gate renders with no identity.
 *
 * Renders the console's chrome matching Himalayan Koh brand theme — the warm charcoal
 * rail, the header, the warm-white content surface — with skeleton rows where the
 * data will be.
 */
export default function AdminShellSkeleton() {
  return (
    <div
      className="h-screen bg-[#FAF7F1] flex overflow-hidden font-sans"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading the admin console…</span>

      {/* Rail */}
      <aside
        className="hidden lg:flex w-60 h-screen sticky top-0 shrink-0 flex-col"
        style={{
          background: 'linear-gradient(180deg, #26211C 0%, #1f1a16 55%, #181411 100%)',
          boxShadow: 'inset -1px 0 0 rgba(224,214,200,0.1)',
        }}
      >
        <div className="px-3.5 py-4 border-b border-[#E0D6C8]/10 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg overflow-hidden border border-[#E0D6C8]/20 shadow-md bg-[#1f1a16] flex items-center justify-center shrink-0">
            <img
              src="/images/hk_salt_crystal.webp"
              alt="Himalayan Koh"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="leading-tight">
            <span className="font-bold text-sm text-[#FAF7F1] tracking-tight block">Himalayan Koh</span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-[#C98745] font-semibold">
              Admin Console
            </span>
          </div>
        </div>
        <div className="flex-1 p-2 space-y-3">
          {[6, 10, 4].map((rows, group) => (
            <div key={group} className="space-y-1.5">
              <div className="h-2 w-16 rounded bg-white/[0.06] mx-2.5 mb-1" />
              {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-2.5 py-[7px]">
                  <span className="w-[26px] h-[26px] rounded-md bg-white/[0.07]" />
                  <span className="h-2 rounded bg-white/[0.06] flex-1" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 shrink-0 bg-[#FFFDF8]/95 backdrop-blur-md border-b border-[#E0D6C8] flex items-center justify-between gap-3 px-4 lg:px-6">
          <div className="h-8 w-64 rounded-lg bg-[#FAF7F1] border border-[#E0D6C8]" />
          <div className="h-8 w-8 rounded-lg bg-[#FAF7F1] border border-[#E0D6C8]" />
        </header>

        {/* Content canvas */}
        <main
          className="flex-1 overflow-y-auto min-w-0 p-3 lg:p-5"
          style={{ background: '#FAF7F1' }}
        >
          <div className="space-y-4">
            <div className="h-5 w-40 rounded bg-stone-200/70" />
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-[#FFFDF8] rounded-xl border border-[#E0D6C8] p-3.5">
                  <div className="w-8 h-8 rounded-lg bg-stone-100" />
                  <div className="mt-2.5 h-4 w-16 rounded bg-stone-200/70" />
                  <div className="mt-1.5 h-2 w-20 rounded bg-stone-100" />
                </div>
              ))}
            </div>
            <div className="bg-[#FFFDF8] rounded-xl border border-[#E0D6C8] p-4 space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-3 rounded bg-stone-100" style={{ width: `${92 - i * 6}%` }} />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
