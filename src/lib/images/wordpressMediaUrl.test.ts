import { describe, expect, it } from 'vitest';
import { wordpressMediaUrl } from './wordpressMediaUrl';
import { galleryImages } from './galleryImages';
import { mapRestV3Product } from '../backend/woocommerce';
describe('original WooCommerce media after apex cutover',()=>{
  it('moves uploads to WordPress while preserving the staging installation path',()=>{
    const u='https://himalayankoh.com/staging/wp-content/uploads/2026/10/original.webp';
    expect(wordpressMediaUrl(u)).toBe('https://wp.himalayankoh.com/staging/wp-content/uploads/2026/10/original.webp');
    expect(wordpressMediaUrl('https://himalayankoh.com/wp-content/uploads/2021/03/photo.jpg')).toBe('https://wp.himalayankoh.com/wp-content/uploads/2021/03/photo.jpg');
  });
  it('leaves unrelated hosts and app assets intact',()=>{
    for(const u of ['/images/products/original.webp','https://evil.test/staging/wp-content/uploads/photo.jpg','https://himalayankoh.com/products/photo'])expect(wordpressMediaUrl(u)).toBe(u);
  });
  it('prioritizes the store original over local overlays and keeps responsive tokens',()=>{
    const u='https://himalayankoh.com/staging/wp-content/uploads/2026/10/original.webp';
    const p=mapRestV3Product({id:2752,slug:'himalayan-salt-block-30-lbs',sku:'HK-LB-30LBS',images:[{src:u},{src:u}]});
    expect(p.images).toEqual([wordpressMediaUrl(u)]);
    expect(p.image).toBe(wordpressMediaUrl(u));
  });
  it('removes inaccessible originals from slide count and navigation, including all-failed galleries',()=>{
    const images=['photo.jpg','missing.jpg','photo.jpg','  ','last.jpg'];
    expect(galleryImages(images,['missing.jpg'])).toEqual(['photo.jpg','last.jpg']);
    expect(galleryImages(images,['photo.jpg','missing.jpg','last.jpg'])).toEqual([]);
  });
});
