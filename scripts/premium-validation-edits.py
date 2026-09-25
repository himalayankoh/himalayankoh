exec(open('scripts/premium-storefront-edit.py',encoding='utf-8').read().split("p='src/views/HomePage.tsx'")[0])
replace('src/views/CheckoutPage.tsx', [("aria-pressed={active}\n      className={`text-left", "aria-pressed={paymentMethod === 'invoice'}\n                  className={`text-left"), ("'Add Stripe keys to enable online card payment.'", "'Card payment is currently unavailable. Please choose invoice payment.'")])
for p,state in [('src/components/Layout.tsx','setMobileOpen'),('src/components/admin/AdminLayout.tsx','setMobSide')]:
 s=read(p); marker='  const mobileDialog ='; i=s.index(marker); s=s[:i]+'''  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) STATE(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
'''.replace('STATE',state)+s[i:];write(p,s)
p='src/views/admin/AdminInventory.tsx';s=read(p);a=s.index('      {!loading && report && report.notes.length > 0 && (');b=s.index('\n      <div className="grid',a);notice=s[a:b];s=s[:a]+s[b:];pos=s.index('\n      <AdminPanel');s=s[:pos]+'''\n      <div className="min-h-28">\n        {loading && <p role="status" className="text-sm text-admin-muted py-4">Reading stock policies from WooCommerce…</p>}\n'''+notice+'\n      </div>\n'+s[pos:];s=s.replace('grid grid-cols-4 gap-4','grid grid-cols-1 min-[375px]:grid-cols-2 lg:grid-cols-4 gap-4');s=s.replace("hint={report?.tracksQuantities ? undefined :", "hint={loading || report?.tracksQuantities ? undefined :");write(p,s)
p='src/app/api/cart/route.test.ts';s=read(p);s+='''
describe('session cache isolation', () => {
  it('marks successful cart reads private and uncacheable', async () => {
    useWordPress([{ path: '/wc/store/v1/cart', body: { items: [] } }]);
    expect((await GET(cartRequest())).headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });
  it('also protects invalid cart requests', async () => {
    const response = await POST(new Request('http://localhost/api/cart', { method: 'POST', body: '{' }));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });
});
''';write(p,s)
