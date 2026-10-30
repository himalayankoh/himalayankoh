import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const origin = request.nextUrl.origin;
    const apkUrl = `${origin}/downloads/HimalayanKoh-Admin.apk`;

    const res = await fetch(apkUrl, {
      headers: {
        'Accept': 'application/vnd.android.package-archive,*/*',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return new NextResponse('APK file currently unavailable', { status: 404 });
    }

    const arrayBuffer = await res.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="HimalayanKoh-Admin.apk"',
        'Content-Length': arrayBuffer.byteLength.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Failed to stream APK download:', error);
    return new NextResponse('Internal error processing download', { status: 500 });
  }
}
