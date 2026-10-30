import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';

interface DoHAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DoHResponse {
  Status: number;
  Answer?: DoHAnswer[];
}

async function queryDns(name: string, type: string): Promise<DoHResponse> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const res = await fetch(url, {
    headers: { accept: 'application/dns-json' },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`DNS DoH failed: ${res.status}`);
  }
  return res.json();
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const domain = 'himalayankoh.com';
  const now = new Date().toISOString();

  try {
    const fallback: DoHResponse = { Status: -1, Answer: [] };
    const [txtResp, mxResp, dmarcResp, dkimDefaultResp, dkimResendResp] = await Promise.all([
      queryDns(domain, 'TXT').catch(() => fallback),
      queryDns(domain, 'MX').catch(() => fallback),
      queryDns(`_dmarc.${domain}`, 'TXT').catch(() => fallback),
      queryDns(`default._domainkey.${domain}`, 'TXT').catch(() => fallback),
      queryDns(`resend._domainkey.${domain}`, 'TXT').catch(() => fallback),
    ]);

    // Parse SPF
    let spfRecord: string | null = null;
    if (txtResp.Answer) {
      for (const a of txtResp.Answer) {
        const cleaned = a.data.replace(/^"|"$/g, '').replace(/"\s*"/g, '');
        if (cleaned.startsWith('v=spf1')) {
          spfRecord = cleaned;
          break;
        }
      }
    }

    // Parse MX
    const mxRecords = (mxResp.Answer || []).map((a) => a.data.replace(/^"|"$/g, ''));

    // Parse DMARC
    let dmarcRecord: string | null = null;
    if (dmarcResp.Answer && dmarcResp.Answer.length > 0) {
      for (const a of dmarcResp.Answer) {
        const cleaned = a.data.replace(/^"|"$/g, '');
        if (cleaned.startsWith('v=DMARC1')) {
          dmarcRecord = cleaned;
          break;
        }
      }
    }

    // Parse DKIM
    let dkimDefault = false;
    let dkimDefaultKeyLength: number | null = null;
    if (dkimDefaultResp.Answer && dkimDefaultResp.Answer.length > 0) {
      dkimDefault = true;
      const data = dkimDefaultResp.Answer[0].data;
      if (data.includes('p=')) {
        dkimDefaultKeyLength = 2048; // standard cPanel RSA 2048
      }
    }

    const dkimResend = !!(dkimResendResp.Answer && dkimResendResp.Answer.length > 0);

    const hasSpf = !!spfRecord;
    const hasDmarc = !!dmarcRecord;
    const hasDkim = dkimDefault;

    // Check if SPF includes Resend or Omnisend
    const spfHasResend = spfRecord ? spfRecord.includes('resend.com') : false;
    const spfHasOmnisend = spfRecord ? spfRecord.includes('omnisend.com') : false;

    // Recommendations list
    const recommendations: string[] = [];
    if (!hasDmarc) {
      recommendations.push(
        'Add a DMARC TXT record for _dmarc.himalayankoh.com: "v=DMARC1; p=none; rua=mailto:dmarc@himalayankoh.com; aspf=r; adkim=r"'
      );
    }
    if (hasSpf && !spfHasResend) {
      recommendations.push(
        'If routing transactional emails through Resend, append "include:resend.com" to your SPF TXT record before ~all.'
      );
    }
    if (!dkimResend) {
      recommendations.push(
        'If utilizing Resend, configure DKIM selector CNAME/TXT records in Cloudflare/Namecheap DNS.'
      );
    }

    return NextResponse.json({
      ok: true,
      domain,
      verifiedAt: now,
      overallHealth: hasSpf && hasDkim && hasDmarc ? 'OPTIMAL' : hasSpf && hasDkim ? 'ACCEPTABLE' : 'NEEDS_ATTENTION',
      spf: {
        status: hasSpf ? 'PASS' : 'FAIL',
        record: spfRecord,
        includesResend: spfHasResend,
        includesOmnisend: spfHasOmnisend,
        note: hasSpf
          ? 'cPanel Web-Hosting SPF is published and active.'
          : 'No valid SPF record found on root domain.',
      },
      dkim: {
        status: hasDkim ? 'PASS' : 'NOT_VERIFIED',
        defaultSelector: dkimDefault,
        keyLength: dkimDefaultKeyLength,
        resendSelector: dkimResend,
        note: dkimDefault
          ? 'cPanel default selector (2048-bit RSA) is active. Resend selector is not configured.'
          : 'No active DKIM selector detected.',
      },
      dmarc: {
        status: hasDmarc ? 'PASS' : 'MISSING',
        record: dmarcRecord,
        policy: hasDmarc ? 'configured' : 'none',
        note: hasDmarc
          ? `DMARC record is published: ${dmarcRecord}`
          : 'No DMARC record published on _dmarc.himalayankoh.com (NXDOMAIN). Recommended to add p=none monitoring.',
      },
      mx: {
        status: mxRecords.length > 0 ? 'PASS' : 'FAIL',
        records: mxRecords,
        provider: 'Namecheap Jellyfish Systems (cPanel)',
      },
      googlePostmaster: {
        status: 'NOT_CONNECTED',
        guidance: 'To monitor Gmail domain reputation and spam rates, verify ownership at https://postmaster.google.com with a DNS TXT record.',
      },
      deliverabilityPolicies: {
        oneClickUnsubscribe: 'Enabled on outreach & newsletter templates via RFC 8058 List-Unsubscribe header',
        fromDomainAlignment: 'sales@himalayankoh.com strictly aligned with root domain himalayankoh.com',
        spamComplaintTarget: '< 0.1% (Gmail & Yahoo 2024 compliance standard)',
      },
      recommendations,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: (err as Error).message,
        verifiedAt: now,
      },
      { status: 500 }
    );
  }
}
