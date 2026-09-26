import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { getMongoClient } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { target_username, from_username, custom_sound_url } = body;

    if (!target_username) {
      return NextResponse.json({ error: 'target_username is required' }, { status: 400 });
    }

    const client = await getMongoClient();
    const coll = client.db('demo_pwa').collection('users');
    const targetUser = await coll.findOne({ username: target_username });

    if (!targetUser) {
      return NextResponse.json({ error: `User '${target_username}' not found` }, { status: 404 });
    }

    if (!targetUser.subscription || targetUser.subscription === 'null') {
      return NextResponse.json(
        { error: `User '${target_username}' does not have a push subscription` },
        { status: 400 }
      );
    }

    let subObj: webpush.PushSubscription;
    try {
      subObj = typeof targetUser.subscription === 'string'
        ? JSON.parse(targetUser.subscription)
        : targetUser.subscription;
    } catch {
      return NextResponse.json({ error: 'Failed to parse target push subscription' }, { status: 500 });
    }

    const vapidPublic = (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
    const vapidPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
    let vapidSubscriber = (process.env.VAPID_SUBSCRIBER || 'mailto:admin@example.com').trim();

    if (!vapidPublic || !vapidPrivate) {
      return NextResponse.json({ error: 'VAPID keys are not configured on server. Please check Vercel environment variables.' }, { status: 500 });
    }

    // Ensure VAPID subject starts with mailto: or https://
    if (!vapidSubscriber.startsWith('mailto:') && !vapidSubscriber.startsWith('https://')) {
      vapidSubscriber = `mailto:${vapidSubscriber}`;
    }

    try {
      webpush.setVapidDetails(vapidSubscriber, vapidPublic, vapidPrivate);
    } catch (vapidErr: unknown) {
      const vMsg = vapidErr instanceof Error ? vapidErr.message : 'Invalid VAPID settings';
      return NextResponse.json({ error: `VAPID Configuration Error: ${vMsg}` }, { status: 500 });
    }

    const payload = JSON.stringify({
      title: '🚨 ALERT BEEP!',
      body: `🔊 '${from_username || 'Someone'}' กดส่งเสียงปี๊ปหาคุณ!`,
      from: from_username || 'Someone',
      custom_sound_url: custom_sound_url || '',
      timestamp: Date.now(),
    });

    await webpush.sendNotification(subObj, payload, {
      TTL: 30,
      urgency: 'high',
    });

    return NextResponse.json({
      status: 'sent',
      target: target_username,
      from: from_username,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    console.error('Beep API error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
