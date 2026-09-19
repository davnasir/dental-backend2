import prisma from '../src/config/prisma.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const YEAR = new Date().getFullYear();

const localDateStr = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const localStart = (offsetDays = 0) => new Date(`${localDateStr(offsetDays)}T00:00:00`);

// Compute the next sequential number for generated IDs/numbers (same format as the API services).
const nextSeq = async (model, field, prefix, pad) => {
  const last = await prisma[model].findFirst({
    where: { [field]: { startsWith: prefix } },
    orderBy: { [field]: 'desc' },
    select: { [field]: true },
  });
  const n = last ? parseInt(last[field].split('-').pop(), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(pad, '0')}`;
};

const ENTRIES = (en, bn) => ({ en, bn });

async function seedSuperAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL || 'superadmin@nahol.com';
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Super Admin';
  if (!password) throw new Error('SEED_ADMIN_PASSWORD environment variable is required');

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { name, password: hashed, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    create: { name, email, password: hashed, role: 'SUPER_ADMIN', status: 'ACTIVE' },
  });
  const admin = await prisma.user.findUnique({ where: { email } });
  console.log(`Super admin ready: ${email}`);
  return admin;
}

async function seedCategories() {
  const count = await prisma.category.count();
  if (count > 0) {
    console.log('Categories already seeded, skipping.');
    return;
  }
  const categories = [
    ['general-dentistry', 'General Dentistry', 'সাধারণ ডেন্টিস্ট্রি'],
    ['cosmetic-dentistry', 'Cosmetic Dentistry', 'কসমেটিক ডেন্টিস্ট্রি'],
    ['orthodontics', 'Orthodontics', 'অর্থোডন্টিক্স'],
    ['pediatric-dentistry', 'Pediatric Dentistry', 'পেডিয়াট্রিক ডেন্টিস্ট্রি'],
    ['oral-surgery', 'Oral Surgery', 'ওরাল সার্জারি'],
    ['dental-implants', 'Dental Implants', 'ডেন্টাল ইমপ্লান্ট'],
  ];
  await prisma.category.createMany({
    data: categories.map(([key, en, bn], i) => ({
      key,
      name: ENTRIES(en, bn),
      status: 'ACTIVE',
      sortOrder: i + 1,
    })),
  });
  console.log(`Seeded ${categories.length} categories.`);
}

async function seedServices() {
  const count = await prisma.service.count();
  if (count > 0) {
    console.log('Services already seeded, skipping.');
    return;
  }
  const services = [
    {
      slug: 'general-checkup',
      name: ENTRIES('General Checkup & Consultation', 'সাধারণ চেকআপ ও পরামর্শ'),
      categoryKey: 'general-dentistry',
      shortDesc: ENTRIES(
        'Complete oral examination, digital X-ray assessment and personalized treatment plan.',
        'সম্পূর্ণ মৌখিক পরীক্ষা, ডিজিটাল এক্স-রে এবং ব্যক্তিগতকৃত চিকিৎসা পরিকল্পনা।'
      ),
      description: ENTRIES(
        'A comprehensive checkup covering teeth, gums, bite and soft tissue with expert advice.',
        'দাঁত, মাড়ি, ডাকার সমস্যা ও নরম টিস্যুর সম্পূর্ণ পরীক্ষা এবং বিশেষজ্ঞ পরামর্শ।'
      ),
      duration: '30 min',
      priceMin: 500,
      priceMax: 1000,
      priceFormatted: '৳ 500 - ৳ 1,000',
      badge: 'Most Popular',
      sortOrder: 1,
    },
    {
      slug: 'teeth-cleaning-scaling',
      name: ENTRIES('Teeth Cleaning & Polishing (Scaling)', 'দাঁত সাদাকরণ ও স্কেলিং'),
      categoryKey: 'general-dentistry',
      shortDesc: ENTRIES(
        'Ultrasonic scaling to remove plaque, tartar and stains with diamond polishing.',
        'প্লাক, টারটার ও দাগ দূর করতে আল্ট্রাসনিক স্কেলিং এবং পলিশিং।'
      ),
      description: ENTRIES(
        'Professional cleaning using ultrasonic instruments and air-flow polishing to protect against gum disease.',
        'মাড়ির রোগ প্রতিরোধে আল্ট্রাসনিক যন্ত্র দিয়ে পেশাদার পরিষ্কারকরণ ও এয়ার-ফ্লো পলিশিং।'
      ),
      duration: '45 min',
      priceMin: 1500,
      priceMax: 3000,
      priceFormatted: '৳ 1,500 - ৳ 3,000',
      badge: 'Recommended',
      sortOrder: 2,
    },
    {
      slug: 'tooth-whitening',
      name: ENTRIES('Teeth Whitening (Bleaching)', 'দাঁত হোয়াইটনিং (ব্লিচিং)'),
      categoryKey: 'cosmetic-dentistry',
      shortDesc: ENTRIES(
        'In-office whitening that brightens your smile by several shades in one visit.',
        'এক সেশনে দাঁতকে কয়েক ধাপ উজ্জ্বল করে এমন ইন-অফিস হোয়াইটনিং।'
      ),
      description: ENTRIES(
        'Dentist-supervised whitening gel application with LED activation for safe, dramatic results.',
        'নিরাপদ ও দৃশ্যমান ফলাফলের জন্য এলইডি অ্যাক্টিভেশনসহ লক্ষ্ম্যপূর্ণ হোয়াইটনিং জেল প্রয়োগ।'
      ),
      duration: '60 min',
      priceMin: 5000,
      priceMax: 9000,
      priceFormatted: '৳ 5,000 - ৳ 9,000',
      sortOrder: 3,
    },
    {
      slug: 'root-canal-treatment',
      name: ENTRIES('Root Canal Treatment', 'রুট ক্যানেল চিকিৎসা'),
      categoryKey: 'general-dentistry',
      shortDesc: ENTRIES(
        'Painless rotary endodontic treatment with digital length measurement for assured success.',
        'ডিজিটাল মাপ এবং রোটারি যন্ত্রের মাধ্যমে ব্যথাহীন রুট ক্যানেল।'
      ),
      description: ENTRIES(
        'Single-visit rotary root canals that save your natural tooth and eliminate infection at the source.',
        'একভিজিটে রোটারি রুট ক্যানেল - প্রাকৃতিক দাঁত রক্ষা করে মূল থেকে সংক্রমণ দূর করে।'
      ),
      duration: '60 min',
      priceMin: 5500,
      priceMax: 12000,
      priceFormatted: '৳ 5,500 - ৳ 12,000',
      badge: 'Trusted',
      sortOrder: 4,
    },
    {
      slug: 'composite-filling',
      name: ENTRIES('Tooth-Colored Composite Filling', 'কম্পোজিট ফিলিং'),
      categoryKey: 'general-dentistry',
      shortDesc: ENTRIES(
        'Natural-looking composite restorations for cavities in a single visit.',
        'এক ভিজিটেই ক্যাভিটির জন্য প্রাকৃতিক দেখতে কম্পোজিট রিস্টোরেশন।'
      ),
      description: ENTRIES(
        'Shade-matched composite fillings that bond directly to the tooth for strength and aesthetics.',
        'দাঁতের রঙের সাথে মিলে যাওয়া কম্পোজিট ফিলিং যা সরাসরি দাঁতে বন্ধন তৈরি করে।'
      ),
      duration: '30 min',
      priceMin: 1000,
      priceMax: 3500,
      priceFormatted: '৳ 1,000 - ৳ 3,500',
      sortOrder: 5,
    },
    {
      slug: 'crowns-bridges',
      name: ENTRIES('Crowns & Bridges', 'ক্রাউন ও ব্রিজ'),
      categoryKey: 'cosmetic-dentistry',
      shortDesc: ENTRIES(
        'Porcelain fused to metal and zirconia crowns for damaged or missing teeth.',
        'ক্ষতিগ্রস্ত বা অনুপস্থিত দাঁতের জন্য জিরকোনিয়া ও পোর্সেলিন ক্রাউন।'
      ),
      description: ENTRIES(
        'Custom-fitted crowns and bridges that restore function and a flawless smile line.',
        'কার্যকারিতা ও সুন্দর হাসির জন্য কাস্টম-ফিট ক্রাউন ও ব্রিজ।'
      ),
      duration: '2 visits',
      priceMin: 8000,
      priceMax: 20000,
      priceFormatted: '৳ 8,000 - ৳ 20,000',
      sortOrder: 6,
    },
    {
      slug: 'dental-implants',
      name: ENTRIES('Dental Implants', 'ডেন্টাল ইমপ্লান্ট'),
      categoryKey: 'dental-implants',
      shortDesc: ENTRIES(
        'Computer-guided titanium implant surgery for permanent tooth replacement.',
        'স্থায়ী দাঁত প্রতিস্থাপনের জন্য কম্পিউটার-গাইডেড টাইটানিয়াম ইমপ্লান্ট সার্জারি।'
      ),
      description: ENTRIES(
        'State-of-the-art 3D-guided implant placement with European-grade titanium systems.',
        'থ্রি-ডি গাইডেড ইমপ্লান্ট স্থাপন, ইউরোপীয় মানের টাইটানিয়াম সিস্টেম।'
      ),
      duration: '2-3 visits',
      priceMin: 45000,
      priceMax: 65000,
      priceFormatted: '৳ 45,000 - ৳ 65,000',
      badge: 'Premium',
      sortOrder: 7,
    },
    {
      slug: 'braces-orthodontics',
      name: ENTRIES('Braces & Invisalign', 'ব্রেস ও ইনভিসালাইন'),
      categoryKey: 'orthodontics',
      shortDesc: ENTRIES(
        'Metal, ceramic and clear aligner options to straighten teeth at any age.',
        'যেকোনো বয়সে দাঁত সোজা করার জন্য মেটাল, সিরামিক ও ক্লিয়ার অ্যালাইনার।'
      ),
      description: ENTRIES(
        'Personalized orthodontic plans combining traditional braces with modern clear aligners.',
        'আধুনিক ক্লিয়ার অ্যালাইনারসহ ব্যক্তিগতকৃত অর্থোডন্টিক পরিকল্পনা।'
      ),
      duration: '12-24 months',
      priceMin: 35000,
      priceMax: 90000,
      priceFormatted: '৳ 35,000 - ৳ 90,000',
      sortOrder: 8,
    },
    {
      slug: 'pediatric-dental-care',
      name: ENTRIES('Pediatric Dental Care', 'শিশুদের দাঁতের চিকিৎসা'),
      categoryKey: 'pediatric-dentistry',
      shortDesc: ENTRIES(
        'Gentle, fear-free dental care designed specially for children.',
        'শিশুদের জন্য ভয়হীন ও কোমল ডেন্টাল কেয়ার।'
      ),
      description: ENTRIES(
        'Fluoride application, sealants and habit counselling in a kid-friendly environment.',
        'ফ্লোরাইড প্রয়োগ, সিল্যান্ট ও অভ্যাস পরামর্শ - শিশুবান্ধব পরিবেশে।'
      ),
      duration: '30 min',
      priceMin: 500,
      priceMax: 2000,
      priceFormatted: '৳ 500 - ৳ 2,000',
      sortOrder: 9,
    },
    {
      slug: 'wisdom-tooth-extraction',
      name: ENTRIES('Surgical Tooth Extraction', 'দাঁত অস্ত্রোপচার নিষ্কাশন'),
      categoryKey: 'oral-surgery',
      shortDesc: ENTRIES(
        'Safe removal of impacted wisdom teeth and complex extractions with minimal trauma.',
        'কম আঘাতে প্রভাবিত আক্কেল দাঁত ও জটিল অস্ত্রোপচার নিষ্কাশন।'
      ),
      description: ENTRIES(
        'Careful surgical planning using X-rays to extract even the most complex teeth safely.',
        'এক্স-রে পরিকল্পনার মাধ্যমে সবচেয়ে জটিল দাঁত নিরাপদে নিষ্কাশন।'
      ),
      duration: '45 min',
      priceMin: 1500,
      priceMax: 6000,
      priceFormatted: '৳ 1,500 - ৳ 6,000',
      sortOrder: 10,
    },
  ];
  for (const [i, s] of services.entries()) {
    await prisma.service.create({
      data: {
        ...s,
        category: s.categoryKey === 'general-dentistry' ? 'General Dentistry' : s.name.en,
        benefits: {
          en: [
            'Certified dental specialists (BDS / FCPS / MDS)',
            'Digital X-ray & modern equipment',
            'Strict sterilization (Class-B autoclave)',
            'Transparent, honest pricing',
          ],
          bn: [
            'স্বীকৃত ডেন্টাল বিশেষজ্ঞ (BDS/FCPS/MDS)',
            'ডিজিটাল এক্স-রে ও আধুনিক যন্ত্রপাতি',
            'কঠোর জীবাণুমুক্তকরণ (ক্লাস-বি অটোক্লেভ)',
            'স্বচ্ছ ও যুক্তিসঙ্গত মূল্য',
          ],
        },
        image: `https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=800&q=80`,
        sortOrder: i + 1,
        status: 'ACTIVE',
      },
    });
  }
  console.log(`Seeded ${services.length} services.`);
}

async function seedDoctors() {
  const count = await prisma.doctor.count();
  if (count > 0) {
    console.log('Doctors already seeded, skipping.');
    return;
  }
  const workingHours = {
    saturday: { start: '10:00', end: '21:00' },
    sunday: { start: '10:00', end: '21:00' },
    monday: { start: '10:00', end: '21:00' },
    tuesday: { start: '10:00', end: '21:00' },
    wednesday: { start: '10:00', end: '21:00' },
    thursday: { start: '10:00', end: '21:00' },
    friday: { start: '16:00', end: '21:00' },
  };
  const doctors = [
    {
      name: 'Dr. Anowar Hossain',
      email: 'anowar@naholdental.demo',
      phone: '01711110001',
      specialization: 'Cosmetic Dentistry & Smile Makeover',
      qualification: 'BDS, MS (Oral & Maxillofacial Surgery)',
      registrationNumber: 'BMDC-45231',
      experience: 12,
      bio: 'Lead cosmetic dentist with 12+ years of experience in smile design, veneers and full-mouth rehabilitation.',
      consultationFee: 1000,
      profileImage: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&q=80',
      avatar_seed: true,
    },
    {
      name: 'Dr. Sabrina Rahman',
      email: 'sabrina@naholdental.demo',
      phone: '01711110002',
      specialization: 'Orthodontics (Braces & Aligners)',
      qualification: 'BDS, FCPS (Orthodontics)',
      registrationNumber: 'BMDC-38902',
      experience: 9,
      bio: 'Certified orthodontist focused on aesthetic alignment for teens and adults.',
      consultationFee: 800,
      profileImage: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400&q=80',
      avatar_seed: true,
    },
    {
      name: 'Dr. Masud Karim',
      email: 'masud@naholdental.demo',
      phone: '01711110003',
      specialization: 'Endodontics (Root Canal)',
      qualification: 'BDS, PGT (Endodontics)',
      registrationNumber: 'BMDC-51240',
      experience: 10,
      bio: 'Painless single-visit root canal specialist using rotary endodontics and digital apex locators.',
      consultationFee: 700,
      profileImage: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=400&q=80',
      avatar_seed: true,
    },
    {
      name: 'Dr. Nusrat Faria',
      email: 'nusrat@naholdental.demo',
      phone: '01711110004',
      specialization: 'Pediatric Dentistry',
      qualification: 'BDS, MCPS (Pediatric Dentistry)',
      registrationNumber: 'BMDC-44512',
      experience: 6,
      bio: 'Gentle, child-friendly dental care including fluoride varnish, sealants and habit counselling.',
      consultationFee: 500,
      profileImage: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=400&q=80',
      avatar_seed: true,
    },
    {
      name: 'Dr. Rashed Mahmud',
      email: 'rashed@naholdental.demo',
      phone: '01711110005',
      specialization: 'Implantology & Oral Surgery',
      qualification: 'BDS, MDS (Implantology)',
      registrationNumber: 'BMDC-59871',
      experience: 8,
      bio: 'Computer-guided dental implant surgeon with 800+ successful implant placements.',
      consultationFee: 900,
      profileImage: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=400&q=80',
      avatar_seed: true,
    },
  ];
  for (const [i, d] of doctors.entries()) {
    const { avatar_seed, ...data } = d;
    await prisma.doctor.create({ data: { ...data, workingHours, availability: { daysOff: [] }, sortOrder: i + 1 } });
  }
  console.log(`Seeded ${doctors.length} doctors.`);
}

async function seedPatients(adminId) {
  const count = await prisma.patient.count();
  if (count > 0) {
    console.log('Patients already seeded, skipping.');
    return;
  }
  const patients = [
    ['Mahmud', 'Hasan', 'MALE', '01712340001', 'mahmud.hasan@gmail.com', 'Dhanmondi, Dhaka', 'O+', 'Penicillin allergy'],
    ['Shakila', 'Rahman', 'FEMALE', '01712340002', 'shakila.r@gmail.com', 'Mirpur, Dhaka', 'A+', ''],
    ['Tanvir', 'Ahmed', 'MALE', '01712340003', 'tanvir.ahmed@outlook.com', 'Uttara, Dhaka', 'B+', 'Diabetes type 2'],
    ['Dr.', 'Farzana Parveen', 'FEMALE', '01712340004', 'farzana.parveen@gmail.com', 'Banani, Dhaka', 'AB+', ''],
    ['Sabbir', 'Hossain', 'MALE', '01712340005', 'sabbir.bd@gmail.com', 'Gulshan, Dhaka', 'O-', ''],
    ['Rafiqul', 'Islam', 'MALE', '01712340006', 'rafiqul.islam@yahoo.com', 'Mohammadpur, Dhaka', 'B-', 'Hypertension'],
    ['Tahmina', 'Akter', 'FEMALE', '01712340007', 'tahmina.akter@gmail.com', 'Khilgaon, Dhaka', 'A-', ''],
    ['Jubayer', 'Khan', 'MALE', '01712340008', 'jubayer.khan@gmail.com', 'Motijheel, Dhaka', 'O+', ''],
    ['Samiha', 'Chowdhury', 'FEMALE', '01712340009', 'samiha.c@gmail.com', 'Rampura, Dhaka', 'AB-', 'Asthma'],
    ['Rakib', 'Uddin', 'MALE', '01712340010', 'rakib.uddin@gmail.com', 'Narayanganj', 'O+', ''],
    ['Nusrat', 'Jahan', 'FEMALE', '01712340011', 'nusrat.jahan@gmail.com', 'Bashundhara, Dhaka', 'B+', ''],
    ['Imran', 'Sarker', 'MALE', '01712340012', 'imran.sarker@gmail.com', 'Savar, Dhaka', 'O+', ''],
  ];
  for (const [i, p] of patients.entries()) {
    await prisma.patient.create({
      data: {
        patientId: await nextSeq('patient', 'patientId', `PT-${YEAR}-`, 5),
        firstName: p[0],
        lastName: p[1],
        gender: p[2],
        phone: p[3],
        email: p[4],
        address: p[5],
        bloodGroup: p[6],
        allergies: p[7] || null,
        medicalHistory: p[7] ? `Known condition: ${p[7]}` : null,
        createdById: adminId,
        createdAt: localStart(-(25 - i)),
      },
    });
  }
  console.log(`Seeded ${patients.length} patients.`);
}

async function seedAppointments() {
  const count = await prisma.appointment.count();
  if (count > 0) {
    console.log('Appointments already seeded, skipping.');
    return;
  }

  const allPatients = await prisma.patient.findMany({ orderBy: { id: 'asc' }, select: { id: true } });
  const doctorList = await prisma.doctor.findMany({ orderBy: { id: 'asc' }, select: { id: true } });
  const serviceList = await prisma.service.findMany({ orderBy: { id: 'asc' }, select: { id: true } });
  const chamberList = await prisma.chamber.findMany({ orderBy: { id: 'asc' }, select: { id: true } });

  // offset, time, status
  const plan = [
    [-27, '11:00', 'COMPLETED'],
    [-26, '10:00', 'COMPLETED'],
    [-25, '05:00', 'COMPLETED'],
    [-24, '12:00', 'COMPLETED'],
    [-23, '04:30', 'NO_SHOW'],
    [-22, '10:30', 'COMPLETED'],
    [-21, '07:00', 'COMPLETED'],
    [-20, '11:30', 'CANCELLED'],
    [-19, '10:00', 'COMPLETED'],
    [-18, '06:00', 'COMPLETED'],
    [-17, '08:00', 'COMPLETED'],
    [-16, '12:30', 'COMPLETED'],
    [-15, '05:30', 'COMPLETED'],
    [-14, '10:00', 'COMPLETED'],
    [-13, '07:30', 'COMPLETED'],
    [-12, '11:00', 'NO_SHOW'],
    [-11, '06:30', 'COMPLETED'],
    [-10, '10:30', 'COMPLETED'],
    [-9, '08:30', 'COMPLETED'],
    [-8, '12:00', 'COMPLETED'],
    [-7, '05:00', 'COMPLETED'],
    [-6, '11:00', 'COMPLETED'],
    [-5, '06:00', 'COMPLETED'],
    [-4, '10:00', 'COMPLETED'],
    [-3, '07:00', 'COMPLETED'],
    [-2, '12:30', 'COMPLETED'],
    [-1, '05:30', 'COMPLETED'],
    [0, '11:00', 'CONFIRMED'],
    [0, '07:00', 'PENDING'],
    [1, '10:30', 'PENDING'],
    [2, '12:00', 'CONFIRMED'],
  ];

  for (const [i, [offset, time, status]] of plan.entries()) {
    const patient = allPatients[i % allPatients.length];
    const doctor = doctorList[i % doctorList.length];
    const service = serviceList[(i * 2) % serviceList.length];
    await prisma.appointment.create({
      data: {
        appointmentNumber: await nextSeq('appointment', 'appointmentNumber', `APT-${YEAR}-`, 6),
        patientId: patient.id,
        doctorId: doctor.id,
        serviceId: status === 'COMPLETED' ? service.id : service.id,
        chamberId: chamberList[i % chamberList.length]?.id || null,
        appointmentDate: localStart(offset),
        appointmentTime: time,
        status,
        publicBooking: offset >= -2,
        reason: 'Routine dental consultation',
        notes: offset === 0 ? 'Patient requested morning slot.' : null,
        cancellationReason: status === 'CANCELLED' ? 'Patient rescheduled to another day' : null,
      },
    });
  }
  console.log(`Seeded ${plan.length} appointments.`);
}

async function seedTreatments() {
  const count = await prisma.treatmentRecord.count();
  if (count > 0) {
    console.log('Treatment records already seeded, skipping.');
    return;
  }
  const [patients, doctors, appointments] = await Promise.all([
    prisma.patient.findMany({ orderBy: { id: 'asc' }, take: 6 }),
    prisma.doctor.findMany({ orderBy: { id: 'asc' }, take: 5 }),
    prisma.appointment.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { appointmentDate: 'asc' },
      take: 8,
    }),
  ]);

  const treatments = [
    ['Gingivitis', 'Ultrasonic Scaling & Polishing', 'Full-mouth deep cleaning completed in a single visit.'],
    ['Caries on tooth 36', 'Root Canal Treatment', 'Rotary root canal performed; crown recommended.'],
    ['Tooth discoloration', 'In-Office Whitening', 'Whitened by 4 shades; sensitivity managed with desensitizer.'],
    ['Impacted wisdom tooth', 'Surgical Extraction', 'Horizontal impaction removed; 4 sutures placed.'],
    ['Missing tooth 46', 'Dental Implant (Stage 1)', 'Implant fixture placed; osseointegration healing period.'],
    ['Malocclusion', 'Orthodontic Assessment', 'Fixed braces applied on upper and lower arches.'],
    ['Cracked enamel', 'Composite Restoration', 'Shade-matched composite repair completed.'],
    ['Pediatric caries', 'Fluoride Varnish', 'Fluoride varnish applied; brushing guidance given.'],
  ];

  for (const [i, [diagnosis, treatment, notes]] of treatments.entries()) {
    const patient = patients[i % patients.length];
    const doctor = doctors[i % doctors.length];
    const appointment = appointments[i % appointments.length];
    await prisma.treatmentRecord.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.id,
        appointmentId: appointment.id,
        diagnosis: ENTRIES(diagnosis, diagnosis),
        treatment: ENTRIES(treatment, treatment),
        notes,
        followUpDate: localStart(14),
        createdAt: appointment.appointmentDate,
      },
    });
  }
  console.log(`Seeded ${treatments.length} treatment records.`);
}

async function seedPrescriptions() {
  const count = await prisma.prescription.count();
  if (count > 0) {
    console.log('Prescriptions already seeded, skipping.');
    return;
  }
  const [patients, doctors] = await Promise.all([
    prisma.patient.findMany({ orderBy: { id: 'asc' }, take: 6 }),
    prisma.doctor.findMany({ orderBy: { id: 'asc' }, take: 5 }),
  ]);
  const meds = [
    ['Augmentin 625', '1+1+1', '3 days', 'After meals'],
    ['Ibuprofen 400', '1 tablet', '3 days', 'If pain severe'],
    ['Amoxicillin 500', '1+0+1', '5 days', 'After food'],
    ['Chlorhexidine Mouthwash 0.2%', 'Rinse 2x daily', '7 days', 'Use at night'],
    ['Paracetamol 500', '1+1+1', '2 days', 'After meals'],
    ['Metronidazole 400', '1+1+1', '5 days', 'With food'],
  ];
  for (let i = 0; i < 12; i += 1) {
    const patient = patients[i % patients.length];
    const doctor = doctors[i % doctors.length];
    const [medicine, frequency, duration, instructions] = meds[i % meds.length];
    await prisma.prescription.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.id,
        medicine,
        dosage: '1 tab',
        frequency: frequency.replace('+', '/'),
        duration,
        instructions,
        createdAt: localStart(-(20 - i)),
      },
    });
  }
  console.log('Seeded 12 prescriptions.');
}

async function seedDentalRecords() {
  const count = await prisma.dentalRecord.count();
  if (count > 0) {
    console.log('Dental records already seeded, skipping.');
    return;
  }
  const [patients, doctors] = await Promise.all([
    prisma.patient.findMany({ orderBy: { id: 'asc' }, take: 4 }),
    prisma.doctor.findMany({ orderBy: { id: 'asc' }, take: 2 }),
  ]);
  const byPatient = {
    0: [16, 26],
    1: [11, 21],
    2: [36, 37],
    3: [46, 47],
  };
  const statuses = ['ROOT_CANAL', 'FILLED', 'DECAY', 'CROWN', 'IMPLANT', 'MISSING'];
  for (const [pi, teeth] of Object.entries(byPatient)) {
    const patient = patients[Number(pi) % patients.length];
    for (const [ti, toothNumber] of teeth.entries()) {
      await prisma.dentalRecord.create({
        data: {
          patientId: patient.id,
          toothNumber,
          condition: toothNumber === 16 ? 'Deep caries to pulp' : 'Existing restoration',
          treatment: toothNumber === 16 ? 'Root canal treatment done' : 'Composite restoration',
          status: statuses[(Number(pi) + ti) % statuses.length],
        },
      });
    }
  }
  console.log(`Seeded ${Object.values(byPatient).flat().length} dental records.`);
}

async function seedInvoicesAndPayments(adminId) {
  const count = await prisma.invoice.count();
  if (count > 0) {
    console.log('Invoices already seeded, skipping.');
    return;
  }
  const [patients, completedAppointments] = await Promise.all([
    prisma.patient.findMany({ orderBy: { id: 'asc' } }),
    prisma.appointment.findMany({ where: { status: 'COMPLETED' }, orderBy: { appointmentDate: 'asc' } }),
  ]);

  const invoiceSpecs = [
    { subtotal: 800, discount: 0, tax: 0, paid: 800, status: 'PAID', offset: -27 },
    { subtotal: 2500, discount: 200, tax: 0, paid: 2300, status: 'PAID', offset: -24 },
    { subtotal: 9000, discount: 500, tax: 0, paid: 5000, status: 'PARTIAL', offset: -21 },
    { subtotal: 5500, discount: 0, tax: 0, paid: 0, status: 'UNPAID', offset: -19 },
    { subtotal: 1200, discount: 0, tax: 0, paid: 1200, status: 'PAID', offset: -16 },
    { subtotal: 3500, discount: 300, tax: 0, paid: 3500, status: 'REFUNDED', offset: -13 },
    { subtotal: 6000, discount: 0, tax: 0, paid: 6000, status: 'PAID', offset: -9 },
    { subtotal: 3000, discount: 250, tax: 0, paid: 1000, status: 'PARTIAL', offset: -6 },
    { subtotal: 45000, discount: 2000, tax: 0, paid: 20000, status: 'PARTIAL', offset: -3 },
    { subtotal: 750, discount: 0, tax: 0, paid: 750, status: 'PAID', offset: 0 },
  ];

  for (const [i, spec] of invoiceSpecs.entries()) {
    const patient = patients[i % patients.length];
    const appointment = completedAppointments[(i + 2) % completedAppointments.length];
    const total = spec.subtotal - spec.discount + spec.tax;
    const due = total - spec.paid;
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: await nextSeq('invoice', 'invoiceNumber', `INV-${YEAR}-`, 5),
        patientId: patient.id,
        appointmentId: appointment ? appointment.id : null,
        subtotal: spec.subtotal,
        discount: spec.discount,
        tax: spec.tax,
        total,
        paid: spec.paid,
        due,
        paymentStatus: spec.status,
        note: 'Regular follow-up billing',
      },
    });

    if (spec.paid > 0 && spec.status !== 'REFUNDED') {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          patientId: patient.id,
          amount: spec.paid,
          method: ['CASH', 'CARD', 'MOBILE_BANKING', 'CASH', 'MOBILE_BANKING', 'BANK'][i % 6],
          paymentDate: spec.offset === 0 ? new Date() : localStart(spec.offset),
          receivedById: adminId,
          note: spec.offset === 0 ? 'Today\'s collection' : null,
        },
      });
    }
  }
  console.log(`Seeded ${invoiceSpecs.length} invoices + payments.`);
}

async function seedBlog() {
  const count = await prisma.blog.count();
  if (count > 0) {
    console.log('Blog posts already seeded, skipping.');
    return;
  }
  const posts = [
    {
      slug: 'importance-of-biannual-dental-checkups',
      title: ENTRIES(
        'Why Biannual Dental Checkups Matter More Than You Think',
        'ছয় মাস পরপর ডেন্টাল চেকআপ কেন এত জরুরি'
      ),
      category: 'Dental Health',
      categoryTitle: ENTRIES('Dental Health', 'দাঁতের স্বাস্থ্য'),
      excerpt: ENTRIES(
        'Most dental problems are silent until they become painful and expensive. Here is why a 30-minute checkup every six months is the smartest health investment.',
        'বেশিরভাগ দাঁতের সমস্যা ব্যথা হওয়ার আগ পর্যন্ত নীরবে বেড়ে যায়। কেন ছয় মাসে ৩০ মিনিটের চেকআপ সবচেয়ে স্মার্ট বিনিয়োগ।'
      ),
      content: ENTRIES(
        'Regular checkups allow your dentist to catch cavities, gum disease and even oral cancer in their earliest stages...',
        'নিয়মিত চেকআপে ক্যাভিটি, মাড়ির রোগ এমনকি মুখের ক্যান্সারও প্রাথমিক অবস্থায় ধরা পড়ে...'
      ),
      readTime: '5 min read',
      offset: 15,
    },
    {
      slug: 'myth-vs-fact-root-canal-pain',
      title: ENTRIES(
        'Myth vs Fact: Root Canal Treatment Is Not Painful',
        'মিথ বনাম বাস্তবতা: রুট ক্যানেল চিকিৎসা ব্যথাহীন'
      ),
      category: 'Treatments',
      categoryTitle: ENTRIES('Treatments', 'চিকিৎসা'),
      excerpt: ENTRIES(
        'Modern rotary endodontics and local anesthesia have made root canals as comfortable as a simple filling.',
        'আধুনিক রোটারি এন্ডোডন্টিক্স এবং লোকাল অ্যানেসথেসিয়ায় রুট ক্যানেল এখন ফিলিংয়ের মতোই আরামদায়ক।'
      ),
      content: ENTRIES(
        'The fear of root canal pain is one of the oldest myths in dentistry...',
        'রুট ক্যানেল ব্যথার ভয় দন্তচিকিৎসার সবচেয়ে পুরনো মিথগুলোর একটি...'
      ),
      readTime: '4 min read',
      offset: 10,
    },
    {
      slug: 'children-oral-care-guide',
      title: ENTRIES(
        'A Parent\'s Guide to Kids\' Oral Care (Ages 2-12)',
        'শিশুর দাঁতের যত্নে অভিভাবকদের গাইড (২-১২ বছর)'
      ),
      category: 'Kids',
      categoryTitle: ENTRIES('Kids', 'শিশু'),
      excerpt: ENTRIES(
        'From first tooth to braces, here is how to build healthy habits that last a lifetime.',
        'প্রথম দাঁত থেকে ব্রেস পর্যন্ত - আজীবন টিকে থাকা স্বাস্থ্যকর অভ্যাস গড়ে তোলার উপায়।'
      ),
      content: ENTRIES(
        'Cavities in baby teeth can affect permanent teeth below them...',
        'দুধ দাঁতের ক্যাভিটি স্থায়ী দাঁতকেও প্রভাবিত করতে পারে...'
      ),
      readTime: '6 min read',
      offset: 7,
    },
    {
      slug: 'whiter-teeth-naturally',
      title: ENTRIES(
        'Brighten Your Smile: Whitening Options Explained',
        'উজ্জ্বল হাসি: হোয়াইটনিং অপশনগুলো সম্পর্কে বিস্তারিত'
      ),
      category: 'Cosmetic',
      categoryTitle: ENTRIES('Cosmetic', 'কসমেটিক'),
      excerpt: ENTRIES(
        'Professional whitening vs over-the-counter kits - what actually works and what damages enamel?',
        'পেশাদার হোয়াইটনিং বনাম ওভার-দ্যা-কাউন্টার কিট - আসলে কী কাজ করে আর কী এনামেলের ক্ষতি করে?'
      ),
      content: ENTRIES(
        'Over-the-counter whitening trays rarely fit properly and can cause uneven results...',
        'ওটিসি হোয়াইটনিং ট্রে সঠিকভাবে দাঁতে ফিট হয় না এবং অসম ফলাফল দিতে পারে...'
      ),
      readTime: '5 min read',
      offset: 3,
    },
  ];
  for (const p of posts) {
    const { offset: _offset, ...rest } = p;
    await prisma.blog.create({
      data: {
        ...rest,
        featuredImage: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=800&q=80',
        author: 'Dr. Anowar Hossain',
        status: 'PUBLISHED',
        seoTitle: p.slug.replace(/-/g, ' '),
        publishedAt: localStart(-p.offset),
      },
    });
  }
  console.log(`Seeded ${posts.length} blog posts.`);
}

async function seedFaqs() {
  const count = await prisma.faq.count();
  if (count > 0) {
    console.log('FAQs already seeded, skipping.');
    return;
  }
  const faqs = [
    ['General', 'What are your clinic hours?', 'We are open daily, Saturday to Thursday from 10 AM to 9 PM. Friday 4 PM to 9 PM.'],
    ['General', 'Do you treat patients on an emergency basis?', 'Yes, we always keep a slot open for dental emergencies like severe toothache, swelling or trauma. Walk-ins are welcome.'],
    ['Billing', 'Do you take Tk. or card payments?', 'We accept cash, cards, bKash/Nagad mobile banking and bank transfer. All major payment methods are supported.'],
    ['Treatment', 'How strong are dental implants?', 'With proper care, titanium implants can last 15-25 years or a lifetime.'],
    ['Pediatric', 'Can children visit a pediatric dentist?', 'Yes, we specialize in making dental visits fun and fear-free for children aged 2 and above.'],
    ['Treatment', 'Is root canal treatment painful?', 'With modern rotary endodontics and local anesthesia, most patients feel no pain at all.'],
  ];
  for (const [i, [category, q, a]] of faqs.entries()) {
    await prisma.faq.create({
      data: {
        question: ENTRIES(q, q),
        answer: ENTRIES(a, a),
        category,
        sortOrder: i + 1,
        status: 'ACTIVE',
      },
    });
  }
  console.log(`Seeded ${faqs.length} FAQs.`);
}

async function seedGallery() {
  const count = await prisma.galleryItem.count();
  if (count > 0) {
    console.log('Gallery items already seeded, skipping.');
    return;
  }
  const items = [
    ['Smile Makeover', ENTRIES('Smile Makeover', 'স্মাইল মেকওভার'), 'Ceramic veneers on anterior teeth', 'Veneers'],
    ['Root Canal', ENTRIES('Root Canal', 'রুট ক্যানেল'), 'Single-visit rotary root canal', 'Endodontics'],
    ['Wisdom Extraction', ENTRIES('Wisdom Extraction', 'আক্কেল দাঁত'), 'Impacted wisdom tooth removal', 'Oral Surgery'],
    ['Implant', ENTRIES('Dental Implant', 'ডেন্টাল ইমপ্লান্ট'), 'Computer-guided implant placement', 'Implants'],
    ['Whitening', ENTRIES('Teeth Whitening', 'হোয়াইটনিং'), 'In-office laser whitening', 'Cosmetic'],
    ['Braces', ENTRIES('Braces & Aligners', 'ব্রেস'), 'Orthodontic alignment', 'Orthodontics'],
  ];
  for (const [i, [cat, title, desc, type]] of items.entries()) {
    await prisma.galleryItem.create({
      data: {
        category: cat,
        title,
        description: ENTRIES(desc, desc),
        beforeImg: `https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=100&q=80`,
        afterImg: `https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=300&q=80`,
        treatmentType: type,
        sortOrder: i + 1,
        status: 'ACTIVE',
      },
    });
  }
  console.log(`Seeded ${items.length} gallery items.`);
}

async function seedReviews() {
  const count = await prisma.review.count();
  if (count > 0) {
    console.log('Reviews already seeded, skipping.');
    return;
  }
  const reviews = [
    ['Engr. Mahmudul Hasan', ENTRIES('Root Canal & Zirconia Crown', 'রুট ক্যানেল ও জিরকোনিয়া ক্যাপ'), 5, '2 weeks ago', 'MH',
      ENTRIES('I was terrified of root canals from past experiences elsewhere. The doctor was extraordinarily gentle and I genuinely felt no pain at all. Highly recommend.', 'আগের অভিজ্ঞতার ভয়ে ছিলাম, কিন্তু ডাক্তার এতটাই কোমলভাবে কাজ করলেন যে কোনো ব্যথাই অনুভব করিনি।')],
    ['Nusrat Jahan Chowdhury', ENTRIES('Ceramic Veneers & Smile Makeover', 'সিরামিক ভেনিয়ার্স ও স্মাইল ডিজাইন'), 5, '1 month ago', 'NJ',
      ENTRIES('Got my wedding smile makeover done here. The attention to detail in shaping the veneers is phenomenal. All my wedding photos look incredible.', 'বিয়ের আগে স্মাইল মেকওভার করিয়েছিলাম। ভেনিয়ার্স এত সুন্দর ও স্বাভাবিক হয়েছে যে সবাই প্রশংসা করছে।')],
    ['Tanvir Ahmed', ENTRIES('Titanium Dental Implant', 'টাইটানিয়াম ডেন্টাল ইমপ্ল্যান্ট'), 5, '3 weeks ago', 'TA',
      ENTRIES('Replaced a molar tooth I lost 5 years ago. The 3D imaging and computer-guided implant surgery were so smooth. I can chew anything without hesitation.', 'পাঁচ বছর আগে তোলা দাঁতে ইমপ্ল্যান্ট করালাম। থ্রি-ডি গাইডেড সার্জারিতে কোনো অসুবিধা ছাড়াই দাঁত বসেছে।')],
    ['Dr. Farzana Parveen', ENTRIES('Ultrasonic Scaling & Whitening', 'স্কেলিং ও হোয়াইটনিং'), 5, '2 months ago', 'FP',
      ENTRIES('As a physician myself, I am very strict about sterilization. I was impressed to see Class-B autoclave pouches opened freshly in front of me. Highly professional.', 'চিকিৎসক হিসেবে জীবাণুমুক্তকরণ নিয়ে আমি খুব সতর্ক। প্রতিটি রোগীর সামনে সিল করা প্যাকেট খোলা হয় - খুবই পেশাদার।')],
    ['Sabbir Hossain', ENTRIES('Surgical Wisdom Extraction', 'আক্কেল দাঁতের সার্জারি'), 5, '3 months ago', 'SH',
      ENTRIES('Had a horizontally impacted wisdom tooth causing severe headaches. It was safely extracted in 25 minutes with minimal swelling.', 'বাঁকা আক্কেল দাঁতের ব্যথায় ভুগছিলাম। মাত্র ২৫ মিনিটে ব্যথাহীনভাবে দাঁত তুলে দিয়েছেন।')],
  ];
  for (const [i, [author, treatment, rating, date, avatar, comment]] of reviews.entries()) {
    await prisma.review.create({
      data: { author, treatment, rating, date, avatar, comment, status: 'APPROVED', sortOrder: i + 1 },
    });
  }
  console.log(`Seeded ${reviews.length} reviews.`);
}

async function seedChambers() {
  const count = await prisma.chamber.count();
  if (count > 0) {
    console.log('Chambers already seeded, skipping.');
    return;
  }
  const hours = {
    saturday: { start: '10:00', end: '21:00' },
    sunday: { start: '10:00', end: '21:00' },
    monday: { start: '10:00', end: '21:00' },
    tuesday: { start: '10:00', end: '21:00' },
    wednesday: { start: '10:00', end: '21:00' },
    thursday: { start: '10:00', end: '21:00' },
    friday: { start: '16:00', end: '21:00' },
  };
  const chambers = [
    {
      name: 'Banani Branch (Main)',
      address: 'Level 6, House 27, Road 11, Banani, Dhaka 1213',
      phone: '+8801948921229',
      workingHours: hours,
      status: 'ACTIVE',
      sortOrder: 1,
    },
    {
      name: 'Mirpur Branch',
      address: 'House 12, Block C, Section 2, Mirpur, Dhaka 1216',
      phone: '+8801948921230',
      workingHours: hours,
      status: 'ACTIVE',
      sortOrder: 2,
    },
  ];
  await prisma.chamber.createMany({ data: chambers });
  console.log(`Seeded ${chambers.length} chambers.`);
}

async function seedReels() {
  const count = await prisma.reel.count();
  if (count > 0) {
    console.log('Reels already seeded, skipping.');
    return;
  }
  const reels = [
    {
      title: ENTRIES('Teeth Whitening in 1 Visit', 'এক ভিজিটেই দাঁত সাদা'),
      tag: 'Whitening',
      duration: '0:45',
      views: '2.4M',
      image: 'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?w=800&q=80',
      videoUrl: 'https://www.youtube.com/watch?v=demo-whitening',
      status: 'ACTIVE',
      sortOrder: 1,
    },
    {
      title: ENTRIES('Braces Transformation Story', 'ব্রেস পরার সফল গল্প'),
      tag: 'Orthodontics',
      duration: '1:10',
      views: '1.8M',
      image: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=800&q=80',
      videoUrl: 'https://www.youtube.com/watch?v=demo-braces',
      status: 'ACTIVE',
      sortOrder: 2,
    },
    {
      title: ENTRIES('Smile Makeover Reveal', 'স্মাইল মেকোভার প্রকাশ'),
      tag: 'Cosmetic',
      duration: '0:58',
      views: '3.1M',
      image: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=800&q=80',
      videoUrl: 'https://www.youtube.com/watch?v=demo-smile',
      status: 'ACTIVE',
      sortOrder: 3,
    },
  ];
  await prisma.reel.createMany({ data: reels });
  console.log(`Seeded ${reels.length} reels.`);
}

async function seedSettings() {
  const upsert = async (key, value) => {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  };
  await upsert('clinic_info', {
    name: 'Nahol Dental Care',
    address: 'Level 6, House 27, Road 11, Banani, Dhaka 1213',
    phone: '+8801948921229',
    email: 'care@naholdental.com',
    hours: 'Sat - Thu: 10:00 AM - 9:00 PM',
    whatsappNumber: '8801948921229',
  });
  await upsert('booking_hours', {
    weekend: { start: '10:00', end: '21:00' },
    weekday: { start: '10:00', end: '21:00' },
  });
  await upsert('site_stats', {
    years: 12,
    patients: 15000,
    procedures: 25,
    satisfaction: 99.2,
  });
  await upsert('categories_visibility', { enabled: true });
  await upsert('reels_visibility', { enabled: true });
  await upsert('before_after_visibility', { enabled: true });
  console.log('Settings upserted.');
}

async function seedNotifications(adminId) {
  const count = await prisma.notification.count();
  if (count > 0) {
    console.log('Notifications already seeded, skipping.');
    return;
  }
  const notifications = [
    ['appointment', 'New appointment booked', 'A new patient appointment has been submitted for review', '/admin/appointments'],
    ['payment', 'Payment received', 'A payment of ৳ 800 was collected today', '/admin/billing'],
    ['patient', 'New patient registered', 'A new patient record was added to the system', '/admin/patients'],
  ];
  for (const [type, title, message, link] of notifications) {
    await prisma.notification.create({ data: { userId: adminId, type, title, message, link, state: 'UNREAD' } });
  }
  console.log(`Seeded ${notifications.length} notifications.`);
}

async function main() {
  const admin = await seedSuperAdmin();
  await seedCategories();
  await seedServices();
  await seedDoctors();
  await seedChambers();
  await seedPatients(admin.id);
  await seedAppointments();
  await seedTreatments();
  await seedPrescriptions();
  await seedDentalRecords();
  await seedInvoicesAndPayments(admin.id);
  await seedBlog();
  await seedFaqs();
  await seedGallery();
  await seedReviews();
  await seedReels();
  await seedSettings();
  await seedNotifications(admin.id);
  console.log('\nSeed complete.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });