import { describe, expect, it } from 'vitest';
import { checkoutPaymentKey, checkoutPaymentPrompt } from './checkoutState';
import type { CreatePaymentIntentPayload } from '../stripe/client';

const payload: CreatePaymentIntentPayload = {email:'qa@example.com',shippingAddress:{fullName:'QA Buyer',addressLine1:'1 Test Way',city:'Houston',state:'TX',postalCode:'77065',country:'United States'},shippingMethod:'standard',shippoRateId:'rate-ground',items:[{id:'2544',name:'QA product',quantity:1,price:49.95}]};
describe('payment session checkout identity', () => {
  it.each([
    {...payload,couponCode:'QA-COUPON'},
    {...payload,shippoRateId:'rate-express'},
    {...payload,shippingAddress:{...payload.shippingAddress,postalCode:'77066'}},
    {...payload,billingAddress:{...payload.shippingAddress,addressLine1:'2 Test Way'}},
    {...payload,items:[{...payload.items[0],quantity:2}]},
  ])('invalidates the old payment after a checkout change', (changed) => {
    expect(checkoutPaymentKey(changed)).not.toBe(checkoutPaymentKey(payload));
  });
  it('does not treat browser prices as the payment amount', () => {
    expect(checkoutPaymentKey({...payload,items:[{...payload.items[0],price:0.01}]})).toBe(checkoutPaymentKey(payload));
  });
});
describe('payment prerequisites', () => {
  const ready={email:'qa@example.com',addressReady:true,billingReady:true,shippingReady:true};
  it('identifies missing contact information when shipping is already ready',()=>{
    expect(checkoutPaymentPrompt({...ready,email:''})).toBe('Enter your email address to continue.');
  });
  it('identifies incomplete billing before suggesting a shipping choice',()=>{
    expect(checkoutPaymentPrompt({...ready,billingReady:false})).toContain('billing address');
  });
  it('identifies a missing rate instead of saying the address is incomplete',()=>{
    expect(checkoutPaymentPrompt({...ready,shippingReady:false})).toContain('shipping option');
  });
});
