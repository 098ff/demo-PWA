import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const publicKey = (
    process.env.VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    ''
  ).trim();

  return NextResponse.json({
    publicKey,
    configured: Boolean(publicKey),
  });
}
