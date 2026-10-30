exec(open('scripts/premium-storefront-edit.py',encoding='utf-8').read().split("p='src/views/HomePage.tsx'")[0])
replace('src/lib/backend/woocommerce.ts', [('export interface RestV3Product {','export interface RestV3Product {\n  status?: string;')])
replace('src/components/Layout.tsx', [('shadow-xl overflow-hidden','shadow-xl')])
replace('src/app/api/cart/route.ts', [('NextResponse.json(', 'privateJson(')])
p='src/app/api/cart/route.ts';s=read(p);s=s.replace("type CartAction =", "// A cart is session-owned, including validation and upstream error responses.\nfunction privateJson(body: unknown, init: ResponseInit = {}) {\n  const headers = new Headers(init.headers);\n  headers.set('Cache-Control', 'private, no-store, max-age=0');\n  return NextResponse.json(body, { ...init, headers });\n}\n\ntype CartAction =");write(p,s)
replace('src/lib/backend/adminCatalog.ts', [
('async function wooPage(query: AdminCatalogQuery): Promise<AdminCatalogPage> {','async function wooPage(query: AdminCatalogQuery, shared?: CatalogRead): Promise<AdminCatalogPage> {'),
('  const [read, unlisted] = await Promise.all([\n    readCatalogProducts({\n      search: query.search || undefined,','  const [read, unlisted] = await (shared ?? Promise.all([\n    readCatalogProducts({\n      search: query.search || undefined,'),
('    readUnlistedProducts(),\n  ]);\n\n  const warnings', '    readUnlistedProducts(),\n  ]));\n\n  const warnings'),
('async function wooStats(): Promise<AdminCatalogStats> {','type CatalogRead = Promise<[Awaited<ReturnType<typeof readCatalogProducts>>, Awaited<ReturnType<typeof readUnlistedProducts>>]>;\n\nasync function wooStats(shared?: CatalogRead): Promise<AdminCatalogStats> {'),
('  const [read, unlisted] = await Promise.all([\n    readCatalogProducts({ perPage: WORDPRESS_MAX_PER_PAGE }),\n    readUnlistedProducts(),\n  ]);','  const [read, unlisted] = await (shared ?? Promise.all([\n    readCatalogProducts({ perPage: WORDPRESS_MAX_PER_PAGE }),\n    readUnlistedProducts(),\n  ]));')])
p='src/lib/backend/adminCatalog.ts';s=read(p);s+='''
/** One request-local source snapshot for the common unscoped console read.
 * No cross-user cache; mutations are visible on the very next request.
 */
export async function readAdminCatalogWithStats(query: AdminCatalogQuery = {}) {
  const shared: CatalogRead | undefined = !query.search && query.isFeatured === undefined
    ? Promise.all([readCatalogProducts({ perPage: WORDPRESS_MAX_PER_PAGE, signal: query.signal }), readUnlistedProducts()])
    : undefined;
  const [page, stats] = await Promise.all([wooPage(query, shared), wooStats(shared)]);
  return { page, stats };
}
''';write(p,s)
replace('src/app/api/admin/catalog/route.ts', [
('readAdminCatalogPage, readAdminCatalogStats','readAdminCatalogWithStats'),
('    const [page, stats] = await Promise.all([\n      readAdminCatalogPage(query),\n      readAdminCatalogStats(),\n    ]);\n    return NextResponse.json({ page, stats });',"    const result = await readAdminCatalogWithStats(query);\n    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });")])
replace('src/admin/CatalogAdmin.tsx', [('  if (loading) return <div className="text-center py-20 text-gray-400">Loading catalog…</div>;', '''  if (loading) return <section aria-busy="true" aria-label="Products" className="space-y-5">
    <div><h1 className="text-2xl font-bold text-[#26211C]">Products</h1><p role="status" className="mt-1 text-sm text-[#6D6258]">Loading your WooCommerce catalogue…</p></div>
    <div aria-hidden="true" className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({length:4},(_,i)=><div key={i} className="h-24 rounded-xl border border-[#E0D6C8] bg-white animate-pulse" />)}</div>
    <div aria-hidden="true" className="rounded-xl border border-[#E0D6C8] bg-white p-4 space-y-4">{Array.from({length:6},(_,i)=><div key={i} className="h-12 rounded bg-[#FAF7F1] animate-pulse" />)}</div>
  </section>;''')])
