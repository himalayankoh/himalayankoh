import type { InboxMessage, InboxParticipant } from './inboxStore';

/**
 * Everyone else on a message: its sender and other To/Cc recipients, minus the
 * address the plain reply already goes to and minus our own mailbox.
 *
 * Returns a comma-separated list ready for the `cc` field, or '' when a reply
 * would only go to the original sender.
 */
export function buildReplyAllCc(last: InboxMessage | undefined, mailbox: string): string {
  if (!last) return '';

  const primary = (last.direction === 'inbound' ? last.from.email : last.to[0]?.email || '')
    .trim()
    .toLowerCase();
  const own = mailbox.trim().toLowerCase();

  const everyone = [last.from, ...last.to, ...(last.cc || [])]
    .map((participant: InboxParticipant) => participant.email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email && email.includes('@')));

  return [...new Set(everyone)]
    .filter((email) => email !== primary && email !== own)
    .join(', ');
}
