import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { listWholesaleRecords } from '@/lib/wholesale/store';
import { listInboxState } from '@/lib/email/inboxStore';

export const dynamic = 'force-dynamic';

export interface AdminNotificationAlert {
  id: string;
  type: 'wholesale_inquiry' | 'inbox_email' | 'wholesale_order' | 'system';
  title: string;
  message: string;
  url: string;
  timestamp: string;
  priority: 'high' | 'normal';
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const alerts: AdminNotificationAlert[] = [];
  let pendingInquiriesCount = 0;
  let unreadEmailsCount = 0;

  // 1. Check Wholesale Inquiries & Quotes
  try {
    const quotes = await listWholesaleRecords('quotes', { limit: 10 }, { timeoutMs: 10_000 });
    const pendingQuotes = quotes.filter((q: Record<string, unknown>) => {
      const status = String(q.status || '').toUpperCase();
      return status === 'SUBMITTED' || status === 'UNDER_REVIEW';
    });
    pendingInquiriesCount = pendingQuotes.length;

    for (const q of pendingQuotes) {
      const ref = String(q.ref || `HK-WS-Q${String(q.id || '').padStart(5, '0')}`);
      const contact = q.buyer_contact && typeof q.buyer_contact === 'object'
        ? (q.buyer_contact as Record<string, unknown>)
        : null;
      const buyerName = String(contact?.business || contact?.name || 'Wholesale Buyer');
      const lines = Array.isArray(q.lines) ? q.lines : [];
      const totalBoxes = lines.reduce((acc, l: Record<string, unknown>) => acc + (Number(l.boxes) || Number(l.units) || 0), 0);
      const subtotal = Number(q.merchandise_subtotal || q.total_price || 0);

      alerts.push({
        id: `quote-${q.id || ref}`,
        type: 'wholesale_inquiry',
        title: `New Inquiry: ${ref}`,
        message: `${buyerName} · ${totalBoxes} boxes${subtotal > 0 ? ` · $${subtotal.toFixed(2)}` : ''}`,
        url: '/admin/wholesale/inquiries',
        timestamp: String(q.created_at || q.updated_at || new Date().toISOString()),
        priority: 'high',
      });
    }
  } catch (err) {
    console.warn('[Admin Notifications] Wholesale check warning:', err instanceof Error ? err.message : err);
  }

  // 2. Check Unread Inbox Emails
  try {
    const inbox = await listInboxState({ folder: 'all', skipExternalSync: true });
    unreadEmailsCount = Number(inbox.counts?.unread || 0);

    const unreadMessages = (inbox.messages || []).filter((m) => m.unread).slice(0, 5);
    for (const m of unreadMessages) {
      alerts.push({
        id: `email-${m.id}`,
        type: 'inbox_email',
        title: `Email from ${m.from?.name || m.from?.email || 'Customer'}`,
        message: m.subject || '(No subject)',
        url: `/admin/inbox?leadId=${encodeURIComponent(m.leadId || '')}`,
        timestamp: m.createdAt || new Date().toISOString(),
        priority: 'high',
      });
    }
  } catch (err) {
    console.warn('[Admin Notifications] Inbox check warning:', err instanceof Error ? err.message : err);
  }

  // Sort alerts newest first
  alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const latestAlert = alerts.length > 0 ? alerts[0] : null;

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    unreadTotal: pendingInquiriesCount + unreadEmailsCount,
    breakdown: {
      inquiries: pendingInquiriesCount,
      emails: unreadEmailsCount,
    },
    latestAlert,
    alerts: alerts.slice(0, 10),
  });
}
