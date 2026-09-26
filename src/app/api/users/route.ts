import { NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = await getMongoClient();
    const coll = client.db('demo_pwa').collection('users');

    // Only return users active within the last 2 hours
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    const cursor = coll.find({ last_seen: { $gt: cutoff } });
    const list = await cursor.toArray();

    const users = list.map((u) => ({
      username: u.username,
      last_seen: u.last_seen,
      has_push: Boolean(u.subscription && u.subscription !== 'null' && u.subscription.length > 10),
    }));

    return NextResponse.json(users);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    console.error('Users API error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
