import { describe, expect, it } from 'vitest';
import { galleryImages, gallerySwipeDirection } from './galleryImages';
describe('displayable gallery slides', () => {
  it('deduplicates source URLs and removes failed originals from the counter', () => {
    expect(galleryImages([' /original.jpg ', '/original.jpg', '', '/failed.jpg'], ['/failed.jpg'])).toEqual(['/original.jpg']);
  });
  it('moves forwards and backwards on intentional horizontal touch gestures', () => {
    expect(gallerySwipeDirection({x:300,y:150},{x:180,y:160})).toBe(1);
    expect(gallerySwipeDirection({x:180,y:160},{x:300,y:150})).toBe(-1);
  });
  it('does not turn a tap, vertical scroll or diagonal scroll into gallery navigation', () => {
    for (const end of [{x:220,y:200},{x:210,y:350},{x:270,y:260}]) {
      expect(gallerySwipeDirection({x:200,y:200},end)).toBe(0);
    }
  });
});
