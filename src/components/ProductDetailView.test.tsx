import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Product } from '../data/products';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import ProductDetailView from './ProductDetailView';
vi.mock('react-router-dom',()=>({useLocation:()=>({search:''}),Link:({to,children,...props}:{to:string;children?:ReactNode} & AnchorHTMLAttributes<HTMLAnchorElement>)=><a href={to} {...props}>{children}</a>}));
vi.mock('../store/cartStore',()=>({useCart:()=>({addItem:vi.fn()})}));
vi.mock('../context/AuthContext',()=>({useAuthContext:()=>({user:null})}));
vi.mock('../context/ToastContext',()=>({useToast:()=>({error:vi.fn()})}));
vi.mock('../lib/storefront/ordering',()=>({ORDERING_ENABLED:true,ORDERS_PAUSED_MESSAGE:''}));
vi.mock('../lib/marketing',()=>({trackEvent:vi.fn(),utmParams:()=>({})}));
const product:Product={id:281,slug:'salt-licks-for-horses',name:'Himalayan Pink Salt Licks for Horses',category:'Salt Licks',image:'/parent.jpg',images:['/parent.jpg'],price:'$17.95 - $19.95',priceMin:17.95,priceMax:19.95,priceRange:true,inStock:true,stockStatus:'in_stock',variations:{attributeLabel:'Size/Weight',options:[
 {id:1549,attribute:'Size/Weight',label:'2 lb',value:'2 lbs.',price:19.95,sku:'HK-LFH-2lbs',inStock:true,image:'/2-lb.jpg',stockQuantity:10},
 {id:1548,attribute:'Size/Weight',label:'6 lb',value:'6 lbs.',price:17.95,sku:'HK-LFH-6lbs',inStock:true,image:'/6-lb.jpg',stockQuantity:10},
]}};
describe('variation-specific first render',()=>{
 it.each([[1549,'2 lb','19.95','2-lb.jpg'],[1548,'6 lb','17.95','6-lb.jpg']])('renders genuine child %i before effects run',(id,label,price,image)=>{
   const html=renderToStaticMarkup(<ProductDetailView product={{...product,selectedVariationId:id as number}}/>);
   expect(html).toContain(`$${price}`);
   expect(html).toContain(`src="/${image}"`);
   expect(html).toContain(`${label} · HK-LFH-`);
   expect(html).toContain('10 available');
   expect(html).not.toContain('Select an option to see its exact price');
 });
 it('keeps the real range and requires a choice when no valid child was requested',()=>{
   const html=renderToStaticMarkup(<ProductDetailView product={{...product,selectedVariationId:1547}}/>);
   expect(html).toContain('Select an option to see its exact price');
   expect(html).toContain('Choose an option');
   expect(html).not.toContain('4 lb');
 });
});
