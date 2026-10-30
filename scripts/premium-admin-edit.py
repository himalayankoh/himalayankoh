exec(open('scripts/premium-storefront-edit.py',encoding='utf-8').read().split("p='src/views/HomePage.tsx'")[0])
p='src/components/admin/AdminLayout.tsx';s=read(p)
s=s.replace("import { useApp } from '@/App';", "import { useApp } from '@/App';\nimport { useDialogFocus } from '../../hooks/useDialogFocus';")
s=s.replace("  const [searchVal, setSearchVal] = useState('');", "  const [searchVal, setSearchVal] = useState('');\n  const [railQuery, setRailQuery] = useState('');\n  const mobileDialog = useDialogFocus(mobSide, () => setMobSide(false));\n  const searchRef = useRef<HTMLInputElement>(null);\n  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); } if (event.key === 'Escape') setUserMenuOpen(false); }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, []);")
s=s.replace('  const Sidebar = ({ mobile }: { mobile?: boolean }) => (','  const renderSidebar = ({ mobile }: { mobile?: boolean }) => (')
s=s.replace('<Sidebar />','{renderSidebar({})}').replace('<Sidebar mobile />','{renderSidebar({ mobile: true })}')
s=s.replace("background: 'linear-gradient(180deg, #26211C 0%, #1f1a16 55%, #181411 100%)'", "background: '#26211C'")
s=s.replace('<nav className="flex-1 p-2 space-y-4 overflow-y-auto">', '<div className="px-3 py-3"><input aria-label="Find an admin workspace" placeholder="Find a workspace…" value={railQuery} onChange={e => setRailQuery(e.target.value)} className="w-full min-w-0 min-h-10 rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-white placeholder:text-white/60" /></div>\n      <nav aria-label="Admin workspaces" className="flex-1 p-2 space-y-4 overflow-y-auto">')
s=s.replace('{SECTIONS.map((sec) => (',"{SECTIONS.map(sec => ({ ...sec, items: sec.items.filter(item => `${sec.title} ${item.label}`.toLowerCase().includes(railQuery.toLowerCase())) })).filter(sec => sec.items.length > 0).map((sec) => (")
s=s.replace('<Link\n','<Link prefetch={false}\n')
s=s.replace('to={l.to}\n',"to={l.to}\n                    aria-current={isActive ? 'page' : undefined}\n")
s=s.replace('py-[7px] rounded-lg text-[12px]','py-2 min-h-10 rounded-lg text-[13px]')
s=s.replace('background: l.g,',"background: isActive ? '#8d4133' : 'rgba(255,255,255,0.07)',").replace("boxShadow: isActive ? `0 2px 10px ${l.dot}40` : '0 1px 4px rgba(0,0,0,0.3)'", "boxShadow: 'none'")
s=s.replace('h-screen w-full bg-[#FAF7F1] flex overflow-hidden font-sans','hk-admin h-dvh w-full bg-[#FAF7F1] flex overflow-hidden font-sans')
s=s.replace('h-screen overflow-hidden','h-dvh overflow-hidden')
s=s.replace('className="absolute left-0 top-0 h-full w-64 shadow-2xl"','ref={mobileDialog} role="dialog" aria-modal="true" aria-label="Admin navigation" tabIndex={-1} className="absolute left-0 top-0 h-full w-72 max-w-[90vw] shadow-2xl"')
s=s.replace('className="fixed inset-0 z-50 lg:hidden"','className="fixed inset-0 z-modal lg:hidden"')
s=s.replace('placeholder="Search products…"','ref={searchRef} aria-label="Search admin products" placeholder="Search products…"')
s=s.replace('              Live\n','              Admin\n').replace('bg-[#3F6550] animate-pulse','bg-[#3F6550]')
s=s.replace('title="System Secure & Verified"','aria-label="Store settings" onClick={() => navigate(\'/admin/settings\')} title="Store settings"')
s=s.replace('className="flex-1 overflow-y-auto min-w-0 p-3 pb-24 lg:p-5"','tabIndex={-1} className="admin-content flex-1 overflow-y-auto min-w-0 p-3 pb-24 lg:p-5"')
s=s.replace('      <Sidebar />','      {renderSidebar({})}')
s=s.replace('    <div className="hk-admin','    <div className="hk-admin',1)
s=s.replace('      {renderSidebar({})}', '      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-skip bg-white p-3 rounded-lg">Skip to workspace</a>\n      {renderSidebar({})}',1)
write(p,s)

p='src/components/admin/AdminUI.tsx';s=read(p)
s=s.replace("import type { ReactNode } from 'react';", "import { useId, type ReactNode } from 'react';\nimport { useDialogFocus } from '../../hooks/useDialogFocus';")
s=s.replace('<Link\n','<Link prefetch={false}\n').replace('<Link to=', '<Link prefetch={false} to=')
s=s.replace('className="flex items-center gap-1 border-b border-admin-line"','className="flex flex-wrap items-center gap-1 border-b border-admin-line"')
s=s.replace('onClick={() => onChange(tab.id)}','onClick={() => onChange(tab.id)}\n            aria-pressed={isActive}')
s=s.replace('  const isDrawer = variant === \'drawer\';', "  const isDrawer = variant === 'drawer';\n  const dialogRef = useDialogFocus(true, onClose);\n  const titleId = useId();")
s=s.replace('        role="dialog"','        ref={dialogRef}\n        tabIndex={-1}\n        aria-labelledby={titleId}\n        role="dialog"')
s=s.replace('<h2 className="text-lg font-bold text-admin-ink">{title}</h2>','<h2 id={titleId} className="text-lg font-bold text-admin-ink">{title}</h2>')
s=s.replace('grid grid-cols-2 gap-5','grid grid-cols-1 sm:grid-cols-2 gap-5')
s=s.replace('<div className={TABLE_WRAP}>','<div className={TABLE_WRAP} tabIndex={0} role="region" aria-label="Scrollable data table">')
s=s.replace('mt-4 ${MICRO_LABEL}','mt-3 ${MICRO_LABEL}').replace('block p-5 transition-shadow','block p-4 transition-shadow')
s=s.replace('mt-1 max-w-3xl text-sm text-admin-muted','mt-2 max-w-3xl text-sm leading-relaxed text-admin-muted')
s=s.replace('className={`rounded-2xl border px-5 py-4 text-sm ${NOTICE_TONES[tone]}`}','role={tone === \'danger\' ? \'alert\' : \'status\'} className={`rounded-xl border px-4 py-3 text-sm ${NOTICE_TONES[tone]}`}')
write(p,s)
replace('src/components/admin/adminTheme.ts',[
('rounded-2xl border border-admin-line bg-admin-surface shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-24px_rgba(16,24,40,0.24)]','rounded-xl border border-admin-line bg-admin-surface shadow-sm'),
('gap-2 rounded-xl text-sm font-semibold','gap-2 min-h-10 rounded-lg text-sm font-semibold'),
('w-full overflow-x-auto','w-full max-w-full overflow-x-auto overscroll-x-contain'),
('w-full min-w-[900px] border-collapse','w-full min-w-[640px] border-collapse tabular-nums'),
('divide-y divide-admin-line','divide-y divide-admin-line [&>tr:hover]:bg-admin-canvas/50')])

replace('src/views/admin/wholesale/AdminWholesaleWorkspace.tsx',[
('className="space-y-6"','className="wholesale-workspace space-y-5 min-w-0"'),
('font-serif text-3xl font-bold text-charcoal','font-serif text-2xl font-bold text-charcoal'),
('className="bg-white rounded-2xl border border-charcoal/8 p-2 overflow-x-auto"','className="bg-white rounded-xl border border-admin-line p-2"'),
('<nav className="flex gap-1">','<nav aria-label="Wholesale sections" className="grid grid-cols-1 min-[375px]:grid-cols-2 xl:grid-cols-3 gap-1">'),
('onClick={() => setTab(entry.id)}','onClick={() => setTab(entry.id)}\n              aria-pressed={tab === entry.id}'),
('px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap','px-3 py-2 min-h-10 rounded-lg text-sm text-left font-medium'),
('bg-himalayan/10 text-himalayan','bg-himalayan-lighter text-himalayan-dark'),
('className="w-4 h-4"','className="w-4 h-4 shrink-0"')])

p='src/views/admin/wholesale/ui.tsx';s=read(p)
s=s.replace('rounded-2xl border border-charcoal/8','rounded-xl border border-admin-line')
s=s.replace('bg-gradient-to-b from-[#FAF8F5]/50 to-white','bg-admin-canvas/40')
s=s.replace('p-5 md:p-6 border-b','p-4 md:p-5 border-b')
s=s.replace('gap-2 rounded-full font-semibold','gap-2 min-h-10 rounded-lg font-semibold')
s=s.replace('className="overflow-x-auto rounded-xl border border-charcoal/10 shadow-xs"','role="region" aria-label="Scrollable wholesale table" tabIndex={0} className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-admin-line"')
write(p,s)

p='src/app/globals.css';s=read(p);s+='''
/* Shared keyboard and motion rules for storefront and operations. */
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--color-himalayan-dark);
  outline-offset: 3px;
}
.hk-admin :where(input, select, textarea) { max-width: 100%; }
.hk-admin .admin-content > * { min-width: 0; max-width: 100%; }
.hk-admin :where(td, th) { overflow-wrap: anywhere; }
.hk-admin table { font-variant-numeric: tabular-nums; }
.hk-admin :where(h1, h2, h3) { text-wrap: balance; }
@media (max-width: 639px) {
  .hk-admin .admin-content > .grid { grid-template-columns: minmax(0, 1fr); }
  .hk-admin .admin-content input, .hk-admin .admin-content select { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
''';write(p,s)
