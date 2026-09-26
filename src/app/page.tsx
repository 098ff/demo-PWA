'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { playBeepSound, initAudioContext } from '@/lib/audio';

interface JoinedUser {
  username: string;
  last_seen: number;
  has_push: boolean;
}

// Helper to convert base64 VAPID key to Uint8Array for PushManager
function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function Home() {
  const [username, setUsername] = useState('');
  const [customSoundUrl, setCustomSoundUrl] = useState('');
  const [joined, setJoined] = useState(false);
  const [users, setUsers] = useState<JoinedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [beepingUser, setBeepingUser] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [pushStatus, setPushStatus] = useState<string>('กำลังตรวจสอบ...');
  const [isIOSInBrowser, setIsIOSInBrowser] = useState(false);
  const [hasPushSubscription, setHasPushSubscription] = useState(false);

  // Check iOS Standalone status
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        // @ts-expect-error iOS Safari proprietary property
        Boolean(navigator.standalone);
      if (isIOS && !isStandalone) {
        setIsIOSInBrowser(true);
      }
    }
  }, []);

  // Unlock and preload noti.mp3 on first touch or click
  useEffect(() => {
    const unlockHandler = () => {
      initAudioContext();
    };
    window.addEventListener('click', unlockHandler, { once: true });
    window.addEventListener('touchstart', unlockHandler, { once: true });
    return () => {
      window.removeEventListener('click', unlockHandler);
      window.removeEventListener('touchstart', unlockHandler);
    };
  }, []);

  // Register service worker and listen for messages from background
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('Service Worker registered:', reg.scope);
          // If a new service worker is waiting, update immediately
          reg.update();
        })
        .catch((err) => {
          console.error('Service Worker registration failed:', err);
        });

      // Listen for message from sw.js when push notification arrives
      const messageHandler = (event: MessageEvent) => {
        if (event.data && event.data.type === 'PLAY_BEEP_NOW') {
          console.log('Incoming BEEP message from SW:', event.data);
          const sound = event.data.data?.custom_sound_url || customSoundUrl;
          playBeepSound(sound);
          setStatusMsg(`🚨 ได้รับเสียงปี๊ปจาก ${event.data.data?.from || 'ใครบางคน'}!`);
          setTimeout(() => setStatusMsg(''), 4000);
        }
      };

      navigator.serviceWorker.addEventListener('message', messageHandler);
      return () => {
        navigator.serviceWorker.removeEventListener('message', messageHandler);
      };
    }
  }, [customSoundUrl]);

  // Fetch VAPID public key dynamically if not inlined
  const fetchVapidKey = async (): Promise<string | null> => {
    if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim() !== '') {
      return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim();
    }
    try {
      const res = await fetch('/api/vapid-public-key');
      if (res.ok) {
        const data = await res.json();
        return data.publicKey || null;
      }
    } catch (e) {
      console.error('Failed to fetch VAPID key:', e);
    }
    return null;
  };

  // Subscribe to Web Push
  const subscribeToPush = async (): Promise<PushSubscription | null> => {
    if (!('serviceWorker' in navigator)) {
      setPushStatus('เบราว์เซอร์นี้ไม่รองรับ Service Worker');
      return null;
    }

    if (!('PushManager' in window)) {
      if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        setPushStatus('iPhone ต้อง Add to Home Screen ก่อนจึงจะใช้ Push ได้');
      } else {
        setPushStatus('เบราว์เซอร์นี้ไม่รองรับ PushManager');
      }
      return null;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('ถูกปฏิเสธสิทธิ์การแจ้งเตือน (Permission Denied)');
        return null;
      }

      const reg = await navigator.serviceWorker.ready;
      const vapidKey = await fetchVapidKey();

      if (!vapidKey) {
        setPushStatus('ไม่พบ VAPID Public Key');
        return null;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(vapidKey),
        });
      }
      setPushStatus('Web Push พร้อมใช้งาน ✅');
      setHasPushSubscription(true);
      return sub;
    } catch (err) {
      console.error('Push subscription failed:', err);
      setPushStatus(`Push error: ${(err as Error).message}`);
      return null;
    }
  };

  // Join Room
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    setStatusMsg('กำลังเชื่อมต่อและขอสิทธิ์แจ้งเตือน...');
    initAudioContext(); // Unlock audio context on user click

    try {
      const subscription = await subscribeToPush();

      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          subscription: subscription ? JSON.stringify(subscription) : null,
        }),
      });

      if (!res.ok) {
        let errMessage = 'Failed to connect to server';
        try {
          const errData = await res.json();
          errMessage = errData.error || errData.message || JSON.stringify(errData);
        } catch {
          errMessage = await res.text();
        }
        throw new Error(errMessage);
      }

      setJoined(true);
      if (!subscription) {
        setStatusMsg(`⚠️ เข้าร่วมแล้วในชื่อ "${username}" (แต่ยังไม่มีสิทธิ์รับ Push Noti)`);
      } else {
        setStatusMsg(`✅ เข้าร่วมสำเร็จในชื่อ "${username}" (พร้อมรับเสียงปี๊ป)`);
      }
      fetchUsers();
    } catch (err) {
      setStatusMsg(`เกิดข้อผิดพลาด: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  // Retry enabling push
  const handleRetryPush = async () => {
    setStatusMsg('กำลังขอสิทธิ์ Push Notification ใหม่...');
    const sub = await subscribeToPush();
    if (sub && username) {
      try {
        await fetch('/api/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username.trim(),
            subscription: JSON.stringify(sub),
          }),
        });
        setStatusMsg('✅ เปิดรับ Push Notification สำเร็จแล้ว!');
        fetchUsers();
      } catch (e) {
        setStatusMsg(`อัปเดต Token ไม่สำเร็จ: ${(e as Error).message}`);
      }
    }
  };

  // Fetch online users
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data: JoinedUser[] = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  }, []);

  // Poll active users list every 3s
  useEffect(() => {
    if (!joined) return;
    const interval = setInterval(fetchUsers, 3000);
    return () => clearInterval(interval);
  }, [joined, fetchUsers]);

  // Send Beep to another user
  const handleSendBeep = async (targetUsername: string) => {
    setBeepingUser(targetUsername);
    setStatusMsg(`กำลังส่งสัญญาณเสียงไปที่เครื่องของ "${targetUsername}"...`);

    try {
      const res = await fetch('/api/beep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_username: targetUsername,
          from_username: username,
          custom_sound_url: customSoundUrl.trim() || undefined,
        }),
      });

      if (!res.ok) {
        let errMessage = 'Failed to send beep';
        try {
          const errData = await res.json();
          errMessage = errData.error || errData.message || JSON.stringify(errData);
        } catch {
          errMessage = await res.text();
        }
        throw new Error(errMessage);
      }

      setStatusMsg(`✅ ส่งสัญญาณเสียงไปที่ "${targetUsername}" เรียบร้อยแล้ว!`);
    } catch (err) {
      setStatusMsg(`❌ ส่งไม่สำเร็จ: ${(err as Error).message}`);
    } finally {
      setBeepingUser(null);
      setTimeout(() => setStatusMsg(''), 5000);
    }
  };

  return (
    <main className="max-w-md mx-auto min-h-screen p-4 flex flex-col justify-between">
      <div>
        {/* Header */}
        <header className="py-4 border-b border-slate-800 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            🔔 Demo Beep PWA
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Proof of Concept: ปลุกเสียงเตือนข้ามเครื่องผ่าน Web Push
          </p>
        </header>

        {/* iPhone Safari Special Warning */}
        {isIOSInBrowser && (
          <div className="my-3 p-3.5 text-xs rounded-xl bg-amber-950/80 border border-amber-600/80 text-amber-200">
            <div className="font-bold flex items-center gap-1.5 text-amber-300 text-sm mb-1">
              📱 คำแนะนำสำหรับผู้ใช้ iPhone:
            </div>
            Apple Safari จะไม่อนุญาตให้รับการแจ้งเตือน Push ในแท็บปกติ กรุณากดปุ่ม <strong>แชร์ (Share ปุ่มกลางล่างจอ)</strong> ➔ เลือก <strong>&quot;เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)&quot;</strong> แล้วเปิดแอพจากไอคอนที่หน้าโฮม จึงจะสามารถส่งและรับเสียงปี๊ปได้ครับ
          </div>
        )}

        {/* Status Alert Banner */}
        {statusMsg && (
          <div className="my-3 p-3 text-sm rounded-lg bg-indigo-950 border border-indigo-700 text-indigo-200 animate-pulse">
            {statusMsg}
          </div>
        )}

        {/* Join Section */}
        {!joined ? (
          <div className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
            <h2 className="text-lg font-semibold mb-3 text-slate-200">เข้าสู่ห้อง (Join Server)</h2>
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  ตั้งชื่ออุปกรณ์ / Username ของคุณ
                </label>
                <input
                  type="text"
                  placeholder="เช่น iPhone-A, Pixel-B"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  (ตัวเลือกเสริม) ลิงก์ไฟล์เสียงจาก Storage ของคุณ (.mp3, .wav)
                </label>
                <input
                  type="url"
                  placeholder="https://your-storage.com/sound.mp3"
                  value={customSoundUrl}
                  onChange={(e) => setCustomSoundUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  * หากเว้นว่างไว้ ระบบจะใช้เสียง noti.mp3 เป็นค่าเริ่มต้นอัตโนมัติ
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !username.trim()}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg shadow transition"
              >
                {loading ? 'กำลังเชื่อมต่อ...' : '🚀 JOIN เข้าห้อง'}
              </button>
            </form>
          </div>
        ) : (
          /* Active Room Section */
          <div className="mt-4 space-y-4">
            {/* My Profile Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">อุปกรณ์ของคุณ:</span>
                  <div className="text-lg font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                    {username}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">สถานะ Noti: {pushStatus}</div>
                </div>

                {/* Test Speaker Button */}
                <button
                  onClick={() => playBeepSound(customSoundUrl)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-md border border-slate-700"
                >
                  🔊 ทดสอบลำโพง
                </button>
              </div>

              {/* Retry Enable Push Button if missing */}
              {!hasPushSubscription && (
                <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-amber-400">⚠️ เครื่องนี้ยังไม่ได้รับ Push Token</span>
                  <button
                    onClick={handleRetryPush}
                    className="px-2.5 py-1 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded font-medium"
                  >
                    ขอสิทธิ์ Push อีกครั้ง
                  </button>
                </div>
              )}
            </div>

            {/* Online Users List */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-300">
                  เครื่องในห้อง ({users.length})
                </h3>
                <button
                  onClick={fetchUsers}
                  className="text-xs text-indigo-400 hover:underline"
                >
                  รีเฟรช
                </button>
              </div>

              {users.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">ยังไม่มีเครื่องอื่นในห้อง</p>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {users.map((u) => {
                    const isSelf = u.username === username;
                    const isBusy = beepingUser === u.username;

                    return (
                      <li
                        key={u.username}
                        className="py-3 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-medium text-sm text-slate-200 flex items-center gap-2">
                            {u.username}
                            {isSelf && (
                              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                เครื่องนี้
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {u.has_push ? '🔔 พร้อมรับ Noti' : '⚠️ ไม่มี Push Token'}
                          </div>
                        </div>

                        {/* Beep Action Button */}
                        <button
                          disabled={isSelf || isBusy}
                          onClick={() => handleSendBeep(u.username)}
                          className={`px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition ${
                            isSelf
                              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                              : isBusy
                              ? 'bg-amber-600 text-white animate-bounce'
                              : 'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-md'
                          }`}
                        >
                          {isBusy ? 'กำลังส่ง...' : '🚨 สั่งปี๊ป!'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <footer className="py-4 text-center text-[11px] text-slate-500 space-y-1">
        <p>💡 เพื่อทดสอบตอนปิดจอ: ต้องกดอนุญาต Notification และติดตั้งลง Home Screen</p>
        <p>iOS Safari: กดแชร์ ➔ Add to Home Screen</p>
      </footer>
    </main>
  );
}
