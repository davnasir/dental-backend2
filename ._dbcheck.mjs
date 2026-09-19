import prisma from './src/config/prisma.js';

console.log('Counting patients (connectivity check):');
try {
  const count = await prisma.patient.count();
  console.log('patient rows:', count);
} catch (e) {
  console.log('ERR:', e.message.split('\n')[0]);
}
await prisma.$disconnect();