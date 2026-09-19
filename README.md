# Nahol Dental Care — Backend API (MongoDB)

Express REST API যা `frontend/` (React) ড্যাশবোর্ড ও পাবলিক সাইটকে সার্ভিস দেয়।
ডেটাবেস হিসেবে **MongoDB** ব্যবহৃত হয়। পুরনো MySQL/Prisma কোড সম্পূর্ণভাবে সরিয়ে ফেলা হয়েছে
এবং `src/config/prisma.js`-এ Prisma-র মতো একটি হালকা কুয়েরি লেয়ার তৈরি করা হয়েছে,
যাতে REST API-র আকৃতি ও নিউমেরিক ID একই থাকে — ফ্রন্টএন্ডে কোনো ডেটাবেস-সংক্রান্ত পরিবর্তন লাগে না।

- ভাষা: Node.js (>= 20)
- ফ্রেমওয়ার্ক: Express 4
- ড্রাইভার: সর্বশেষ MongoDB Node.js ড্রাইভার (v7)
- অন্যান্য: bcryptjs, jsonwebtoken, zod, multer, multer, nodemailer, ws (realtime), helmet, cors

---

## সাম্প্রতিক কাজ — কী কী ঠিক করা হয়েছে (যা এই README-তে লিপিবদ্ধ)

প্রজেক্টটি প্রথমে MySQL/Prisma থেকে MongoDB-তে মাইগ্রেট করা হয়। এরপর একটি এন্ড-টু-এন্ড
স্মোক টেস্ট (৮৩টি চেক) দিয়ে সব ফ্লো যাচাই করা হয়েছে এবং নিচের বাগগুলো পাওয়া/সারানো হয়েছে।

### ১. `src/config/prisma.js` — মূল ORM-ইমুলেশন লেয়ারের বাগ-ফিক্স

- **MongoDB ড্রাইভার v7-এর সাথে সামঞ্জস্য:** ড্রাইভার v7-এ `findOneAndUpdate()` /
  `findOneAndDelete()` সরাসরি ডকুমেন্ট রিটার্ন করে, আগের মতো `{ value }` অবজেক্ট নয়।
  এর ফলে `nextId()` আর `delete()` সবসময় ক্র্যাশ করত (`r.value` was `undefined`) — এমনকি
  **সব create/insert** ব্যর্থ হতো, আর প্রোডাকশনে auto-seed নীরবে fail হতো।
  (`'seq' reading of undefined` এর ৫০০ এরর)। দুই জায়গাতেই দুই রকম রিটার্ন হ্যান্ডল করা হয়েছে।

- **Relation-এর ফিল্ড ক্রম উল্টো ছিল:** `RELATIONS` ম্যাপ Prisma-স্টাইলে লেখা
  `[target, fieldOnTarget, fieldOnLocalDoc, many]`, কিন্তু `resolveRelation()` ও
  relation-where ব্রাঞ্চে field দুটি উল্টোভাবে ব্যবহার হচ্ছিল। ফলে সব `include`
  (patient, doctor, service, chamber) ফাঁকা ফেরত আসত এবং appointment-এ রোগীর নাম দিয়ে
  খোঁজ (`{ patient: { firstName: { contains } } }`) কাজ করত না। দুটি জায়গাই ঠিক করা হয়েছে।

- **`_count` include-এর সাপোর্ট যোগ:** এখন doctor/chamber/patient লিস্টিং-এর
  `_count: { select: {...} }` সঠিকভাবে সম্পর্কিত ডকুমেন্ট গুনে দেয়।

- **Prisma-র `path` / `string_contains` ফিল্টার:** লোকালাইজড (translated) ক্ষেত্রের খোঁজ
  (`{ name: { path: ['en'], string_contains: 'x' } }`) এখন ডট-নোটেশন রেজেক্সে রূপান্তরিত
  হয় (`{ 'name.en': { $regex } }`) — services, blogs, reels-এর সার্চ এখন কাজ করে।

- **রেজেক্স কেস-ইনসেনসিটিভ + সেফ এস্কেপ:** `contains`/`startsWith`/`endsWith`-এ এখন
  `$options: 'i'` (আগের MySQL ভাবর মতো) ও প্রপার `escapeRegex()`।

- **`undefined` স্যানিটাইজেশন:** রিকোয়েস্ট বডিতে অনুপস্থিত ফিল্ড (যেমন `note: undefined`)
  BSON সিরিয়ালাইজারে ক্র্যাশ করত; `sanitize()` এখন লেখার আগে `undefined`/`NaN` বাদ দেয়।

### ২. তারিখের ইউটিসি-শিফট বাগ

Appointment তারিখগুলো লোকাল মধ্যরাতে সংরক্ষিত হয়, কিন্তু রিপোর্টিংয়ে `toISOString().slice(0,10)`
ব্যবহার করায় +০৬:০০ টাইমজোনে আগের দিন দেখাত। নতুন `src/utils/date.js`-এর
`toLocalDateStr()`/`toLocalMonthStr()` দিয়ে ঠিক করা হয়েছে:

- `appointment.controller.js` (নোটিফিকেশন মেটা, ইমেল, ওয়াটসঅ্যাপ)
- `dashboard.controller.js` (দিনভিত্তিক চার্ট ও রেভিনিউ মাস)
- `appointment.service.js` (রিশিডিউল ভ্যালিডেশন)
- `content.controller.js` (রিভিউ তারিখ)

### ৩. পাবলিক বুকিং-এ স্ট্যাটাস ইনজেকশন

`POST /appointments/public/book` ফর্ম থেকে `status` মানে নিতে পারত (যেমন সরাসরি
`CONFIRMED`)। এখন পাবলিক বুকিং-এ স্ট্যাটাস সবসময় `PENDING` জোর করা হয়।

### ৪. ডেন্টাল চার্ট ভ্যালিডেশন

`POST /dental-chart/patient/:id/tooth`-এ `dentalRecordSchema` ব্যবহার হচ্ছিল, যা বডিতে
`patientId` চায় — অথচ `patientId` URL প্যারামিটার থেকে আসে। এখন `dentalChartUpdateSchema`
ব্যবহার হয় (বডিতে `patientId` লাগে না)।

### ৫. ফাইল আপলোডের URL

`singleImage`/`imagesArray` মিডলওয়্যারের `req.file.path` ছিল **অ্যাবসোলিউট ফাইলসিস্টেম
পাথ** (Windows-এ ব্যাকস্ল্যাশসহ)। এখন নতুন `src/utils/uploadUrl.js`-এর মাধ্যমে
ওয়েব-রিলেটিভ `/uploads/<filename>` URL সংরক্ষিত হয় — যা ফ্রন্টএন্ডের
`resolveImg()` (`frontend/src/utils/image.js`) আশা করে। blog, gallery, doctor, reel,
service — সব জায়গায় প্রয়োগ করা হয়েছে। আপলোড-সংক্রান্ত `POST /dashboard/upload`
ঠিক ছিল।

### ৬. "New Invoice"-এ রোগী খোঁজা (mobile number + name)

Billing পেজের **New Invoice** মডালে আগে `Select` ড্রপডাউনে কেবল সর্বোচ্চ ২০০ জন রোগী
আসত। এখন তা বদলে **টাইপ-আহেড সার্চ** আনা হয়েছে:

- `GET /api/v1/patients/search?q=...` — ইমেইল/ফোন/নাম (firstName, lastName) দিয়ে
  অ-আর্কাইভড রোগী খোঁজে, ফলাফল ১৫টি পর্যন্ত (রোল-গেটেড + JWT-প্রোটেক্টেড)।
- ফ্রন্টএন্ডে টাইপ করার সাথে সাথে (`/patients/search`) মোবাইল নম্বর বা নাম দিয়ে
  মিলিয়ে ড্রপডাউন দেখায়; নির্বাচিত রোগী একটি চিপ হিসেবে দেখায়, "Change" চাপলে আবার খোঁজা যায়।
- সার্চ ছাড়া ইনভয়েস তৈরি করা যায় না (ফ্রন্টএন্ড + ব্যাকএন্ড উভয় স্তরেই patientId বাধ্যতামূলক)।

### ৭. API সুরক্ষা (Security)

- **Origin গার্ড:** প্রতিটি রিকোয়েস্টের `Origin` header যাচাই করা হয়। যদি origin
  `ALLOWED_ORIGINS` তালিকায় (বা ডিফল্ট allowlist-এ) না থাকে, রিকোয়েস্ট **৪০৩** দিয়ে
  ব্লক হয় — অর্থাৎ ডেটা কেবল ফ্রন্টএন্ডের সাথেই বিনিময় হয়। একই নিয়ম `wss://…/realtime`
  WebSocket-এও প্রযোজ্য।
- **সব ডেটা এন্ডপয়েন্ট JWT-প্রোটেক্টেড:** patients, billing, appointments, treatments,
  prescriptions, dental-chart, users, audit-logs, dashboard, ip-blocks ইত্যাদি — শুধু
  লগইন করা (ACTIVE) user, রোলভিত্তিক `can(...)`/`authorize(...)` গেট দিয়ে পৌঁছানো যায়।
  পাবলিক এন্ডপয়েন্টগুলো শুধু পাবলিক সাইটের জন্য (services, doctors, blogs, slots, booking ইত্যাদি)।
- **রেসপন্স ক্যাশিং বন্ধ:** `/api/v1`-এর সব রেসপন্সে `Cache-Control: no-store`।
- **অন্যান্য:** `helmet`, CORS `credentials` + strict origin, login IP-rate-limit,
  `trust proxy`, ভুল JSON body → ৪০০, কুকি `httpOnly` (+ `Secure` প্রোডাকশনে)।

### যাচাইকরণ

`mongodb-memory-server` ব্যবহার করে একটি ইন-মেমরি MongoDB-র বিরুদ্ধে ৮৩টি এন্ড-টু-এন্ড চেক
চালানো হয়েছে — সব **PASS**। এতে আছে পাবলিক এন্ডপয়েন্ট, লগইন/লগআউট/পাসওয়ার্ড ফ্লো,
appointment বুকিং ও স্লট, billing/invoice/payment, treatment, prescription, dental chart,
blog/gallery/reviews/faqs/reels, settings, notification, audit-log, dashboard
stats/charts, IP-block, রোল-ভিত্তিক অথরাইজেশন ও ভ্যালিডেশন এরর।

---

## লোকাল ডেভেলপমেন্ট

```bash
npm install
npm run db:setup     # ডেমো ডেটা সিড করে (super admin সহ)
npm run dev          # nodemon দিয়ে চলবে (default: http://localhost:5000)
```

শুধু Production-এ (NODE_ENV=production) এবং `SEED_ADMIN_PASSWORD` সেট থাকলে সার্ভার
স্টার্টের সময় **শুধু খালি ডেটাবেসে** অটো-সিড করে (user টেবিলে কোনো user না থাকলে)।
একবার প্রথম admin তৈরি হয়ে গেলে আর ডেটা ওভাররাইট হয় না।

---

## Environment variable (`.env`) — চেকলিস্ট

| ভেরিয়েবল | উদাহরণ | বর্ণনা |
|---|---|---|
| `NODE_ENV` | `production` | `development`/`production` |
| `PORT` | `5000` | API পোর্ট |
| `DATABASE_URL` | `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/dental_clinic?retryWrites=true&w=majority` | MongoDB কানেকশন স্ট্রিং |
| `JWT_ACCESS_SECRET` | দীর্ঘ র‍্যান্ডম স্ট্রিং | access token সিক্রেট |
| `JWT_REFRESH_SECRET` | দীর্ঘ র‍্যান্ডম স্ট্রিং | refresh token সিক্রেট |
| `JWT_ACCESS_EXPIRES` | `15m` | access token মেয়াদ |
| `JWT_REFRESH_EXPIRES` | `7d` | refresh token মেয়াদ |
| `CLIENT_URL` | `https://naholdentalcare.com.bd` | ফ্রন্টএন্ড URL (CORS) |
| `ALLOWED_ORIGINS` | `https://www.naholdentalcare.com.bd` | কমা দিয়ে আলাদা করা ফ্রন্টএন্ড origin-এর তালিকা; `Origin` header-এর ভিত্তিতে **অননুমোদিত origin ৪০৩ (block)** পায় (নিচে "Security" অংশ দেখুন) |
| `COOKIE_SAME_SITE` | `none` / `lax` | কুকি SameSite নীতি; প্রোডাকশনে ডিফল্ট `none` (HTTPS + Secure কুকি দরকার), একই ডোমেইনে `lax` |
| `SEED_ADMIN_EMAIL` | `superadmin@nahol.com` | অটো-সিড করা প্রথম admin-এর ইমেইল |
| `SEED_ADMIN_PASSWORD` | শক্তিশালী পাসওয়ার্ড | একই admin-এর পাসওয়ার্ড |
| `SMTP_HOST` / `SMTP_USER` / ... | — | ইমেইল পাঠানোর জন্য (ঐচ্ছিক) |
| `WHATSAPP_NUMBER` | `8801948921229` | WhatsApp-link নম্বর |
| `UPLOAD_DIR` | `uploads` | আপলোড ফোল্ডার |
| `MAX_FILE_SIZE` | `5242880` | ফাইল সাইজ লিমিট (bytes) |

`.env.example` ফাইলে সব ভেরিয়েবলের খালি টেমপ্লেট আছে।

---

## MongoDB Atlas-এ ডিপ্লয় — বিস্তারিত বাংলা গাইড

> নিচের প্রতিটি ধাপ অনুসরণ করলে আপনার API MongoDB Atlas-এর ফ্রি (M0) ক্লাস্টারের সাথে
> সংযুক্ত হবে। কোনো ধাপে আটকে গেলে নিচের "সমস্যা হলে" অংশটা পড়ুন।

### ১. Atlas অ্যাকাউন্ট ও প্রজেক্ট

1. ব্রাউজারে যান: https://www.mongodb.com/atlas
2. উপরের ডানে **"Sign Up"** (নতুন হলে) অথবা **"Sign In"** চাপুন। Google/GitHub দিয়ে
   সাইন-ইন করা যায়।
3. লগইন করার পর **"Create Project"** (অথবা Deployments পেজ থেকে New Project) চাপুন।
   প্রজেক্টের নাম দিন, যেমন `Dental Clinic` এবং **Create Project** চাপুন।

### ২. ক্লাস্টার তৈরি (Free M0)

1. প্রজেক্টের ভেতরে **"Build a Database"** অথবা **"Create Cluster"** চাপুন।
2. **Free (M0)** — `M0 Sandbox` নির্বাচন করুন (ফ্রি টায়ার, ৫১২ MB)।
3. **Cloud Provider & Region** — আপনার সার্ভার/দর্শকদের কাছাকাছি রিজিয়ন বাছুন।
   বাংলাদেশের জন্য সাধারণত **AWS → Singapore (ap-southeast-1)** ভালো।
4. ক্লাস্টারের নাম দিন, যেমন `DentalCluster` → **Create Deployment** চাপুন।
5. ক্লাস্টার তৈরি হতে ১–৩ মিনিট লাগে।

### ৩. ডেটাবেস ইউজার তৈরি (username/password)

1. ক্লাস্টার তৈরি হওয়ার পর **"Create Database User"** স্ক্রিন আসবে। `authentication`
   মেথড হিসেবে **Password** রাখুন।
2. যেমন: username `dental_admin`, password শক্তিশালী কিছু দিন
   (যেমন `Dent!clinic@2026` — `@`, `!`, `#` ইত্যাদি স্পেশাল ক্যারেক্টারে পরে URI-তে
   এনকোড করবেন, নিচে ৬ নম্বর ধাপে আছে)।
3. Privilege-এ **"Read and write to any database"** (ডিফল্ট) রাখুন → **Create User**।
4. **পাসওয়ার্ডটি কোথাও নোট করে রাখুন** — এটা আর কোথাও দেখানো হবে না।

### ৪. নেটওয়ার্ক অ্যাক্সেস (IP Allowlist)

1. **"Network Access"** ট্যাবে যান → **"Add IP Address"**।
2. সহজ উপায়: **"Allow Access from Anywhere"** (`0.0.0.0/0`) সিলেক্ট করুন → **Confirm**।
   - সিকিউরিটি বাড়াতে চাইলে নিজের সার্ভারের IP টা দিতে পারেন — কিন্তু অনেক হোস্টিং-এ
     IP বদলায়, তাই সমস্যা হলে `0.0.0.0/0` দিন।
3. পরিবর্তনটি কার্যকর হতে সাধারণত ১–২ মিনিট সময় লাগে।

### ৫. কানেকশন স্ট্রিং (Connection String) বের করা

1. ক্লাস্টারের পেজে **"Connect"** বাটনে চাপুন → **"Drivers"** বাছুন।
2. **Driver** = Node.js, **Version** = 6.x বা latest রাখুন।
3. সার্ভারে আলাদা একটা URL দেখাবে, সাধারণত এমন:
   ```
   mongodb+srv://dental_admin:<password>@dentalcluster.xxxxxx.mongodb.net/?retryWrites=true&w=majority
   
   ```
4. `<password>`-এর জায়গায় আপনার ৩ নম্বর ধাপের পাসওয়ার্ড বসান। যদি পাসওয়ার্ডে এগুলো থাকে
   তাহলে URL-এ এনকোড করুন:
   | চিহ্ন | প্রতিস্থাপন |
   |---|---|
   | `@` | `%40` |
   | `!` | `%21` |
   | `#` | `%23` |
   | `$` | `%24` |
   | `/` | `%2F` |
   | `?` | `%3F` |
   উদাহরণ: পাসওয়ার্ড `Dent!clinic@2026` হলে →
   `...dental_admin:Dent%21clinic%402026@dentalcluster.xxxxxx.mongodb.net/...`

5. **গুরুত্বপূর্ণ:** URL-এ হোস্টের ঠিক পরে `/dental_clinic` বসিয়ে ডেটাবেসের নাম দিন, না হলে
   সার্ভার ডিফল্ট `dental_clinic` ব্যবহার করবে। চূড়ান্ত রূপ:
   ```
   mongodb+srv://dental_admin:Dent%21clinic%402026@dentalcluster.xxxxxx.mongodb.net/dental_clinic?retryWrites=true&w=majority
   ```

### ৬. `.env`-এ বসানো

`server/` ফোল্ডারে `.env` ফাইলটি খুলুন (না থাকলে `.env.example` কপি করে `.env` বানান):

```
NODE_ENV=production
PORT=5000
DATABASE_URL="mongodb+srv://dental_admin:Dent%21clinic%402026@dentalcluster.xxxxxx.mongodb.net/dental_clinic?retryWrites=true&w=majority"

JWT_ACCESS_SECRET=<দীর্ঘ র‍্যান্ডম 32+ অক্ষরের স্ট্রিং>
JWT_REFRESH_SECRET=<আরেকটা দীর্ঘ র‍্যান্ডম স্ট্রিং>

CLIENT_URL=http://localhost:5173   # প্রোডাকশনে ফ্রন্টএন্ডের আসল URL দিন

SEED_ADMIN_EMAIL=superadmin@nahol.com
SEED_ADMIN_NAME=Super Admin
SEED_ADMIN_PASSWORD=<শক্তিশালী পাসওয়ার্ড>
```

### ৭. ডেটা সিড করা

ডেমো ডেটা + super admin তৈরি করতে দুটো উপায়:

**উপায় A — ম্যানুয়ালি:**
```bash
cd server
npm install
npm run db:setup
```
`db:setup` কমান্ডটি `prisma/seed.js` চালায় এবং সমস্ত demo ডেটা বানায়
(services, doctors, chambers, patients, appointments, invoices, blog, gallery,
reviews, reels, faqs, settings, notifications সহ)।

**উপায় B — অটো-সিড (recommended):** `NODE_ENV=production` আর `SEED_ADMIN_PASSWORD`
সেট থাকলে, সার্ভার প্রথমবার চালু হওয়ার সময় **ডেটাবেসে কোনো user না থাকলে** নিজে নিজেই সিড
চালাবে। একবার প্রথম admin তৈরি হলে আর কখনো ওভাররাইট হয় না।

### ৮. সার্ভার চালু করা

**সরল উপায় (Node ব্যবহারে):**
```bash
npm install --omit=dev
npm start
```

**PM2 দিয়ে (সার্ভার রিস্টার্ট/ব্যাকগ্রাউন্ডে রাখতে):**
```bash
npm install -g pm2
pm2 start src/server.js --name dental-api
pm2 save
pm2 startup
```

**Docker ব্যবহারে** (রিপোতে `Dockerfile` আছে):
```bash
docker build -t dental-api .
docker run -d --name dental-api -p 5000:5000 \
  -e DATABASE_URL="mongodb+srv://..." \
  -e JWT_ACCESS_SECRET=... -e JWT_REFRESH_SECRET=... \
  -e NODE_ENV=production -e SEED_ADMIN_PASSWORD=... \
  -v dental-uploads:/app/uploads \
  dental-api
```

### ৯. যাচাই করুন

1. Atlas ওয়েবসাইটে ক্লাস্টার খুলে **Browse Collections** চাপলে আপনার ডেটাবেস
   (`dental_clinic`) এবং collection গুলো (user, service, doctor, appointment, ...) দেখা যাবে।
2. API টেস্ট করুন:
   ```
   curl http://YOUR_SERVER:5000/api/v1/health
   # => {"success":true,"message":"API is running"}
   ```
3. ফ্রন্টএন্ডে লগইন পেজে `superadmin@nahol.com` এবং `SEED_ADMIN_PASSWORD`-এর পাসওয়ার্ড দিয়ে
   ঢুকুন। ফ্রন্টএন্ডের `VITE_API_URL` যেন ব্যাকএন্ডের ওপর নির্দেশ করে (যেমন
   `VITE_API_URL=https://api.naholdentalcare.com.bd/api/v1`)।

---

## ভিপিএস/এনজিনক্স দিয়ে প্রোডাকশন ডিপ্লয় (recommended)

সাধারণ সেটআপ: **একটি VPS**, যেখানে Nginx HTTPS + ফ্রন্টএন্ড (React build) সার্ভ করে
এবং `/api`, `/uploads`, `/realtime` রিভার্স-প্রক্সি করে Node-এ (PM2)। এতে সব রিকোয়েস্ট
**একই origin** (`naholdentalcare.com.bd`) থেকে আসে, তাই কুকি/WebSocket কোনো
cross-origin ঝামেলা ছাড়াই চলে এবং `ALLOWED_ORIGINS`-এ শুধু সেই একটি হোস্ট দিলেই হয়।

### ধাপ ১ — Node অ্যাপ বসানো (PM2)

```bash
# রিপো থেকে server ফোল্ডার
cd server
npm install --omit=dev

# .env তৈরি করুন (নিচের চেকলিস্ট)
# সিক্রেট জেনারেট করার দ্রুত উপায়:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm start            # একবার টেস্ট করুন
# PM2 দিয়ে স্থায়ীভাবে:
npm i -g pm2
pm2 start src/server.js --name dental-api
pm2 save
pm2 startup          # বেরিয়ে আসা কমান্ডটি sudo দিয়ে চালান
```

### ধাপ ২ — Nginx রিভার্স-প্রক্সি + HTTPS

ফ্রন্টএন্ড বিল্ড (`frontend/dist`) `/var/www/naholdentalcare.com.bd`-তে কপি করুন, তারপর:

```nginx
server {
    listen 80;
    server_name naholdentalcare.com.bd www.naholdentalcare.com.bd;
    # certbot https চালু করার আগে শুধু এতটুকুই
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name naholdentalcare.com.bd www.naholdentalcare.com.bd;

    root /var/www/naholdentalcare.com.bd;   # React build
    index index.html;

    # single-page app routing
    location / { try_files $uri $uri/ /index.html; }

    # API → Node (PM2)
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # আপলোড করা ছবি (API ডিস্ক) — একই origin থেকে
    location /uploads/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }

    # Realtime notifications (WebSocket)
    location /realtime {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # স্থির ফাইল ৭ দিন ক্যাশ
    location ~* \.(?:js|css|png|jpg|jpeg|svg|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

HTTPS ফ্রি করতে [Let's Encrypt](https://certbot.eff.org):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d naholdentalcare.com.bd -d www.naholdentalcare.com.bd
```

### ধাপ ৩ — ডিপ্লয়-পূর্ববর্তী সিকিউরিটি চেকলিস্ট

- [ ] `.env`-এ `NODE_ENV=production` — `dev_access_secret`/`dev_refresh_secret` **কখনো** রাখবেন না;
      দীর্ঘ র‍্যান্ডম `JWT_ACCESS_SECRET` ও `JWT_REFRESH_SECRET` দিন।
- [ ] `ALLOWED_ORIGINS=https://www.naholdentalcare.com.bd` দিন (শুধু আপনার ফ্রন্টএন্ড origin)।
- [ ] `SEED_ADMIN_PASSWORD` শক্তিশালী দিন; প্রথম admin তৈরির পর চাইলে `.env` থেকে এটা সরিয়ে দিন।
- [ ] `CLIENT_URL` সঠিক ফ্রন্টএন্ড origin দিন। ফ্রন্টএন্ড ও API আলাদা ডোমেইনে থাকলে
      `COOKIE_SAME_SITE=none` (ডিফল্টই production-এ `none`) + HTTPS নিশ্চিত করুন।
- [ ] `DATABASE_URL` MongoDB Atlas-এর হলে Network Access/IP Allowlist কড়া রাখুন; পাসওয়ার্ড URI-তে URL-এনকোড করুন।
- [ ] ফায়ারওয়ালে শুধু ৪৪৩ (HTTP) পোর্ট খুলুন; ৫০০০ পোর্ট পাবলিক/ইন্টারনেটে খোলা রাখবেন না (Nginx-ই এক্সপোজ করবে)।
- [ ] ডেপ্লয়ের পর `curl https://…/api/v1/health` দিয়ে সার্ভার চলে কি না দেখুন এবং
      `curl -H "Origin: https://evil.example.com" -i https://…/api/v1/health` দিয়ে
      **৪০৩** রিটার্ন হয় কি না পরীক্ষা করুন।
- [ ] প্রথমবার বুটে অটো-সিড (খালি ডেটাবেসে) হতে দেওয়ার পর একবার লগইন করে নিশ্চিত হন।

---

## Atlas-এ ডিপ্লয়ের পরে মনে রাখার বিষয় (গুরুত্বপূর্ণ)

- **সংযোগ (Connection):** ফ্রি M0 ক্লাস্টার কিছুক্ষণ অব্যবহৃত থাকলে auto-pause হয়; এরপর প্রথম
  রিকোয়েস্টে একটু দেরি হতে পারে (cold start)। এটা স্বাভাবিক।
- **JWT সিক্রেট:** `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` অবশ্যই দীর্ঘ ও র‍্যান্ডম হোক;
  ডিফল্ট `dev_*` মান প্রোডাকশনে রাখবেন না।
- **CORS/COOKIE:** ফ্রন্টএন্ড ও API আলাদা ডোমেইনে থাকলে `CLIENT_URL` সঠিকভাবে দিন।
  তখন কুকি `SameSite=None; Secure` দরকার — HTTPS নিশ্চিত করুন।
- **আপলোড:** ছবিগুলো সার্ভারের ডিস্কে (`uploads/`) জমা হয়। মাল্টি-সার্ভারের ব্যবস্থায় বা
  container recycle হলে ছবি হারাতে পারে — সেক্ষেত্রে `UPLOAD_DIR`-কে shared storage/volume-এ
  রাখুন।

---

## সমস্যা হলে (Troubleshooting)

| লক্ষণ | কারণ ও সমাধান |
|---|---|
| `Could not connect to any servers in your MongoDB Atlas cluster` | Network Access-এ আপনার IP ব্লক করা; `0.0.0.0/0` যোগ করুন। অথবা URI-তে ভুল password। |
| `Authentication failed. Bad auth` / error code 8000 | username/password ভুল; `<` `>` ব্র্যাকেট ভেঙে ফেলা হয়নি কিনা দেখুন। |
| `tlsv1 alert internal error` | পুরনো Node/OpenSSL বা স্যান্ডবক্স এনভায়রনমেন্টের ফায়ারওয়াল সমস্যা; Node >= 20 আপডেট করুন (Atlas ডাইরেক্ট mongodb:// local instance-এও ভুল হতে পারে)। |
| `Cannot read properties of undefined (reading 'seq')` | এই প্রজেক্টের পুরনো বাগ — এটা **ঠিক করা হয়েছে**; লেটেস্ট কোড pull করে `npm install` দিন। |
| `E11000 duplicate key error` | unique ক্ষেত্রে (slug, email, appointmentNumber) একই মান আগেই আছে; নতুন মান দিন। |
| API চলে কিন্তু admin login fail | ডেটা সিড হয়নি; `npm run db:setup` চালান অথবা `SEED_ADMIN_PASSWORD` ও `NODE_ENV=production` দিয়ে একবার সার্ভার বুট করুন। |
| আপলোড করা ছবি ফ্রন্টএন্ডে দেখা যায় না | URL-টা `/uploads/...` দিয়ে শুরু হোক (কোনোভাবে অ্যাবসলিউট পাথ সংরক্ষিত হলে পুরনো ডেটা ম্যানুয়ালি ঠিক করুন); Express-এর `/uploads` স্ট্যাটিক মাউন্ট সক্রিয় থাকতে হবে। |
| ব্রাউজার থেকে সব API ৪০৩ "Cross-origin request blocked" | ফ্রন্টএন্ডের origin `ALLOWED_ORIGINS`-এ নেই। ওই তালিকা/`CLIENT_URL`-এ সঠিকভাবে দিন (`www` ও `non-www` — দুটোই যুক্ত করলে ভালো)। |

---

## প্রজেক্ট স্ট্রাকচার (সংক্ষেপে)

```
server/
├─ prisma/seed.js          # Demo ডেটা + super admin সিড
├─ src/
│  ├─ app.js               # Express অ্যাপ ও route মাউন্ট
│  ├─ server.js            # listen + production auto-seed
│  ├─ config/
│  │  ├─ index.js          # env কনফিগ
│  │  ├─ db.js             # হালকা helper (PRISMA-স্তর)
│  │  └─ prisma.js         # MongoDB-র উপর Prisma-style ORM লেয়ার (numeric id)
│  ├─ controllers/         # REST কন্ট্রোলার
│  ├─ services/            # বিজনেস লজিক
│  ├─ routes/              # Express রাউটার (public + admin)
│  ├─ validators/          # zod স্কিমা
│  ├─ middleware/          # auth, upload, rate-limit, error-handler
│  └─ utils/               # apiResponse, date, token, uploadUrl আরও
└─ uploads/                # আপলোড করা ফাইল (runtime-generated)
```

`src/config/prisma.js`-এর কুয়েরি লেয়ার MongoDB ড্রাইভারকে Prisma-র মতো
`findMany/findUnique/count/create/update/upsert/groupBy/aggregate` API-তে মোড়ানো;
RELATIONS ম্যাপ দিয়ে relation `include` ও `_count` সামলায়।