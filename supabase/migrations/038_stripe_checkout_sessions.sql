-- Stripe checkout sessions hold validated checkout data before payment.
-- They are not orders and must never be exposed to the browser directly.
CREATE TABLE IF NOT EXISTS stripe_checkout_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  payment_intent_id TEXT UNIQUE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  checkout_data JSONB NOT NULL,
  cart_fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_checkout_sessions_status
  ON stripe_checkout_sessions(status);
CREATE INDEX IF NOT EXISTS idx_stripe_checkout_sessions_order
  ON stripe_checkout_sessions(order_id);

ALTER TABLE stripe_checkout_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE stripe_checkout_sessions FROM anon, authenticated;
GRANT ALL ON TABLE stripe_checkout_sessions TO service_role;

CREATE TRIGGER update_stripe_checkout_sessions_updated_at
  BEFORE UPDATE ON stripe_checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
