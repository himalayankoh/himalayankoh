import { describe, expect, it } from 'vitest';
import type { Product } from '../../data/products';
import { relatedProducts } from './relatedProducts';
const make = (id: number, category = 'Salt Licks'): Product => ({id,slug:`product-${id}`,name:'Pink Salt',category,price:'$19.95',priceMin:19.95,image:'/salt.jpg',inStock:true,stockStatus:'in_stock'});
describe('related catalog recommendations', () => {
  it('excludes the current parent, duplicates, unpriced and unavailable items', () => {
    expect(relatedProducts(make(1),[make(1),make(2),make(2),{...make(3),priceMin:null},{...make(4),inStock:false}]).map(p=>p.id)).toEqual([2]);
  });
  it('prioritizes the same shelf and caps recommendations without mutating the catalog', () => {
    const catalog=[make(2,'Edible Pink Salt'),make(3),make(4),make(5),make(6),make(7)];
    expect(relatedProducts(make(1),catalog).map(p=>p.id)).toEqual([3,4,5,6]);
    expect(catalog[0].id).toBe(2);
  });
});
