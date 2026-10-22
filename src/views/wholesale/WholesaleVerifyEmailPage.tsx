'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from 'lucide-react';

/**
 * The page an applicant lands on from the verification email.
 *
 * It confirms the token once, on mount, and then says what happened. The `useRef`
 * guard matters: React Strict Mode mounts an effect twice in development, and a
 * single-use token consumed twice would show "already used" to a person who had just
 * clicked it correctly.
 */
export default function WholesaleVerifyEmailPage({ token }: { token: string }) {
  const [state, setState] = useState<'checking' | 'verified' | 'error'>('checking');
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState('');
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setState('error');
      setMessage('This page needs the link from your confirmation email.');
      return;
    }

    fetch('/api/wholesale/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
          reference?: string;
        };
        if (!response.ok) {
          setState('error');
          setMessage(data.error || `The link could not be confirmed (HTTP ${response.status}).`);
          return;
        }
        setState('verified');
        setReference(data.reference || '');
        setMessage(data.message || 'Your business email is confirmed.');
      })
      .catch(() => {
        setState('error');
        setMessage('Could not reach the server. Check your connection and open the link again.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center px-4 py-20">
      <div className="max-w-xl w-full bg-white rounded-3xl border border-charcoal/8 shadow-sm p-8 md:p-10 text-center">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6 ${
            state === 'verified' ? 'bg-green-50' : state === 'error' ? 'bg-red-50' : 'bg-himalayan-lighter'
          }`}
        >
          {state === 'verified' ? (
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          ) : state === 'error' ? (
            <AlertCircle className="w-7 h-7 text-red-600" />
          ) : (
            <Loader2 className="w-7 h-7 text-himalayan animate-spin" />
          )}
        </div>

        <h1 className="font-serif text-3xl font-bold text-charcoal mb-3">
          {state === 'verified' ? 'Email confirmed' : state === 'error' ? 'We could not confirm this link' : 'Confirming your email'}
        </h1>

        <p className="text-charcoal-light leading-relaxed mb-6" role={state === 'error' ? 'alert' : undefined}>
          {state === 'checking' ? 'One moment while we check your confirmation link.' : message}
        </p>

        {state === 'verified' && reference ? (
          <div className="bg-warm-white rounded-2xl p-5 mb-7">
            <p className="text-xs uppercase tracking-widest text-charcoal-light mb-1">Your reference</p>
            <p className="font-mono text-lg font-semibold text-charcoal">{reference}</p>
          </div>
        ) : null}

        {state === 'verified' ? (
          <p className="text-sm text-charcoal-light leading-relaxed mb-7">
            Your application is with our wholesale team. We review the resale certificate you uploaded by hand and reply
            by email, usually within a few working days.
          </p>
        ) : null}

        {state === 'error' ? (
          <p className="text-sm text-charcoal-light leading-relaxed mb-7">
            Confirmation links work once. If yours has already been used, your email is confirmed and no further action
            is needed. Otherwise reply to{' '}
            <a href="mailto:ws@himalayankoh.com" className="text-himalayan font-semibold hover:underline">
              ws@himalayankoh.com
            </a>{' '}
            and our team will confirm it for you.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
          <Link href="/wholesale" className="text-himalayan font-semibold hover:underline">
            Back to wholesale
          </Link>
          <Link href="/wholesale/login" className="inline-flex items-center gap-2 text-charcoal-light hover:text-charcoal">
            <MailCheck className="w-4 h-4" /> Wholesale sign-in
          </Link>
        </div>
      </div>
    </div>
  );
}
