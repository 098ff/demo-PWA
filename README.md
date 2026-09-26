# Demo Beep PWA (Next.js + Go + MongoDB on Vercel)

Proof of Concept (POC) สำหรับระบบ Progressive Web App (PWA) ที่ให้อุปกรณ์หลายเครื่องกด Join เข้าห้องเดียวกัน แล้วสามารถกดส่งสัญญาณเสียง Beep ข้ามเครื่องไปยังโทรศัพท์เป้าหมายได้ผ่าน **Web Push API** และ **Web Audio API**

---

## 🚀 ฟีเจอร์หลัก
1. **Join Server:** แต่ละเครื่องตั้งชื่อ Username แล้วกด Join เพื่อลงทะเบียน Push Subscription
2. **Online Device List:** แสดงรายชื่อเครื่องที่ออนไลน์อยู่ อัปเดตรายชื่ออัตโนมัติ (Polling ทุก 3 วินาที)
3. **Trigger Beep:** กดปุ่มส่งสัญญาณไปยังเครื่องปลายทาง
   * หากเครื่องปลายทางเปิดหน้าจออยู่: ส่งเสียงผ่าน Web Audio API / Custom Sound ทันที
   * หากเครื่องปลายทางล็อคหน้าจอ / ปิดเว็บ: ส่ง Push Notification พร้อมสั่นรัวๆ (Vibration Pattern)
4. **Custom Sound Support:** รองรับการดึงไฟล์เสียงที่ Generate เก็บไว้ใน Storage ของตัวเอง (S3, Cloudflare R2, Vercel Blob ฯลฯ)

---

## 🛠 Tech Stack
* **Frontend:** Next.js (App Router, Tailwind CSS, Service Worker, Web Push API, Web Audio API)
* **Backend:** Go (Golang) บน Vercel Serverless Function (`api/index.go`)
* **Push Protocol:** Web Push (VAPID) ผ่านไลบรารี `github.com/SherClockHolmes/webpush-go`
* **Database:** MongoDB Atlas (M0 Free Tier)

---

## ⚙️ Environment Variables (สำหรับ Vercel Dashboard)

| Variable | คำอธิบาย | ตัวอย่าง |
|---|---|---|
| `MONGODB_URI` | Connection String ของ MongoDB Atlas | `mongodb+srv://user:pass@cluster.mongodb.net/demo_pwa` |
| `VAPID_PUBLIC_KEY` | Public Key สำหรับ Web Push | ดูใน `.env.example` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ค่าเดียวกับ VAPID_PUBLIC_KEY | ดูใน `.env.example` |
| `VAPID_PRIVATE_KEY` | Private Key สำหรับ Web Push | ดูใน `.env.example` |
| `VAPID_SUBSCRIBER` | อีเมลผู้ติดต่อสำหรับ Apple/Google Push Service | `mailto:admin@example.com` |

---

## 🚢 ขั้นตอนการ Deploy บน Vercel Free Tier

1. **Push Code ไปยัง GitHub:**
   ```bash
   git add .
   git commit -m "feat: initial demo pwa"
   git push -u origin main
   ```
2. **Import โปรเจกต์บน Vercel:**
   * ไปที่ [vercel.com/new](https://vercel.com/new)
   * เลือก GitHub Repository `demo-PWA`
   * ในส่วน **Environment Variables** ให้ใส่ค่าทั้ง 5 ตัวตามตารางด้านบน
   * กด **Deploy**
3. **เสร็จสิ้น!** Vercel จะคอมไพล์ Next.js และ Go Serverless Functions ให้อัตโนมัติ

---

## 📱 วิธีการทดสอบบนอุปกรณ์จริง

### 1. บน Android (Chrome / Edge)
* เปิด URL จาก Vercel บนมือถือ
* พิมพ์ Username แล้วกด **"🚀 JOIN เข้าห้อง"**
* กดยอมรับสิทธิ์แจ้งเตือน (Notifications: Allow)
* แนะนำให้กดปุ่มเมนู 3 จุด ➔ **"Install app"** หรือ **"Add to Home screen"**

### 2. บน iPhone (iOS 16.4 ขึ้นไป)
* **สำคัญมาก:** Safari จะอนุญาต Web Push เฉพาะเมื่อติดตั้งลงหน้าจอโฮมแล้วเท่านั้น
* เปิด Safari ไปที่ URL จาก Vercel
* กดปุ่ม **แชร์ (ไอคอนสี่เหลี่ยมลูกศรชี้ขึ้นที่ขอบล่าง)** ➔ เลือก **"เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)"**
* เปิดแอพจากไอคอนที่หน้าโฮม ➔ กด **"🚀 JOIN เข้าห้อง"** ➔ อนุญาต Notification

### 3. ทดสอบส่งเสียง Beep
1. ใช้อีกเครื่องหนึ่ง (หรือเปิดอีกหน้าต่าง) กด Join ด้วยชื่ออื่น
2. ล็อคหน้าจอเครื่องแรก
3. ที่เครื่องที่สอง กดปุ่ม **"🚨 สั่งปี๊ป!"** ข้างชื่อเครื่องแรก
4. เครื่องแรกจะได้รับการแจ้งเตือนและสั่นเตือนทันที!
