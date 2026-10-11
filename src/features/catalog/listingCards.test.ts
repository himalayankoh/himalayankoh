import { describe, expect, it } from 'vitest';
import type { Product } from '../../data/products';
import { listingCards, productCardKey, productCardPath } from './listingCards';
import { productVariations } from '../../lib/woo/variationOptions';
const product = (): Product => ({ id: 281, slug: 'salt-licks-for-horses', name: 'Licks', price: '$9.95 - $17.95',
  priceMin: 9.95, priceMax: 17.95, inStock: true, category: 'Live Stock', image: 'original.jpg',
  variations: productVariations([{ name: 'Size/Weight', variation: true, options: ['2 lbs.', '4 lbs.'] }], [
    {id:1549,regular_price:'9.95',weight:'0.907',sku:'5483976372749',stock_status:'instock',attributes:[{name:'Size/Weight',option:'2 lbs.'}]},
    {id:1547,regular_price:'14.95',weight:'1.814',sku:'5483976372749',stock_status:'instock',attributes:[{name:'Size/Weight',option:'4 lbs.'}]},
    {id:1548,regular_price:'17.95',weight:'3',sku:'5483976372749',stock_status:'outofstock',attributes:[{name:'Size/Weight',option:'6 lbs.'}]},
  ]) });
describe('genuine salt lick listing variants', () => {
  it('shows 2 lb and 6 lb first, keeps parent identity and distinct deep links', () => {
    const p=product(); const cards=listingCards([p]);
    expect(cards.map(c=>c.name)).toEqual(['Himalayan Pink Salt Lick — 2 lb','Himalayan Pink Salt Lick — 6 lb']);
    expect(cards.map(c=>c.id)).toEqual([281,281]);
    expect(cards.map(productCardKey)).toEqual(['281:1549','281:1548']);
    expect(cards.map(productCardPath)).toEqual(['/products/salt-licks-for-horses?variation=1549','/products/salt-licks-for-horses?variation=1548']);
    expect(cards.map(c=>c.priceMin)).toEqual([9.95,17.95]);
    expect(cards.map(c=>c.inStock)).toEqual([true,false]);
    expect(listingCards(cards)).toEqual(cards);
    expect(p.variations?.options.map(o=>[o.id,o.label,o.value,o.weight])).toEqual([
      [1549,'2 lb','2 lbs.','0.907'],[1547,'4 lb','4 lbs.','1.814'],[1548,'6 lb','6 lbs.','3']]);
  });
  it('never invents a missing 6 lb child or changes the legitimate 4 lb',()=>{
    const p=product(); p.variations!.options=p.variations!.options.filter(o=>o.id!==1548);
    expect(listingCards([p]).map(c=>c.selectedVariationId)).toEqual([1549]);
    expect(p.variations!.options[1]).toMatchObject({id:1547,label:'4 lb',price:14.95});
  });
  it('leaves unrelated catalog products unchanged',()=>{const p={...product(),slug:'other'};expect(listingCards([p])).toEqual([p]);});
  it('does not combine options from additional axes',()=>{
    const v=productVariations([{name:'Size/Weight',variation:true,options:['2 lbs.']},{name:'Pack',variation:true,options:['3']}],
      [{id:1548,attributes:[{name:'Size/Weight',option:'6 lbs.'},{name:'Pack',option:'3'}]}]);
    expect(v).toBeUndefined();
  });
});
