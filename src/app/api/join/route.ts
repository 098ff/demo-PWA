import { NextRequest, NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, subscription } = body;

    if (!username || !username.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const client = await getMongoClient();
    const coll = client.db('demo_pwa').collection('users');

    const cleanUsername = username.trim();
    const subString = typeof subscription === 'string' ? subscription : JSON.stringify(subscription);

    await coll.updateOne(
      { username: cleanUsername },
      {
        $set: {
          username: cleanUsername,
          subscription: subString,
          last_seen: Date.now(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ status: 'joined', username: cleanUsername });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    console.error('Join API error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
