import prisma from '../config/prisma.js';
import { successResponse } from '../utils/apiResponse.js';
import { toLocalDateStr, toLocalMonthStr } from '../utils/date.js';

const startOfDay = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const getDashboardStats = async (req, res) => {
  const today = startOfDay();
  const monthStart = startOfMonth();

  const [
    totalPatients,
    todayAppointments,
    pendingAppointments,
    completedTreatments,
    todayRevenueAgg,
    outstandingAgg,
    activeDoctors,
    totalRevenueAgg,
    newPatientsThisMonth,
    appointmentStatusAgg,
  ] = await Promise.all([
    prisma.patient.count({ where: { isArchived: false } }),
    prisma.appointment.count({ where: { appointmentDate: today, status: { notIn: ['CANCELLED', 'NO_SHOW'] } } }),
    prisma.appointment.count({ where: { status: 'PENDING' } }),
    prisma.treatmentRecord.count(),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { paymentDate: { gte: today } } }),
    prisma.invoice.aggregate({ _sum: { due: true }, where: { paymentStatus: { in: ['UNPAID', 'PARTIAL'] } } }),
    prisma.doctor.count({ where: { status: 'ACTIVE' } }),
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.patient.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.appointment.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  return successResponse(res, 200, 'Dashboard stats fetched', {
    stats: {
      totalPatients,
      todayAppointments,
      pendingAppointments,
      completedTreatments,
      todayRevenue: todayRevenueAgg._sum.amount || 0,
      totalRevenue: totalRevenueAgg._sum.amount || 0,
      outstandingPayments: outstandingAgg._sum.due || 0,
      activeDoctors,
      newPatientsThisMonth,
    },
    charts: {
      appointmentStatus: appointmentStatusAgg.map((a) => ({ status: a.status, count: a._count._all })),
      newPatientsThisMonth,
    },
  });
};

export const getDashboardCharts = async (req, res) => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  start.setHours(0, 0, 0, 0);

  const appointmentsByDay = await prisma.appointment.findMany({
    where: { appointmentDate: { gte: start, lte: end }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
    select: { appointmentDate: true },
  });

  const dayMap = {};
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dayMap[toLocalDateStr(d)] = 0;
  }
  appointmentsByDay.forEach((a) => {
    const key = toLocalDateStr(a.appointmentDate);
    if (key in dayMap) dayMap[key] += 1;
  });
  const appointmentsByDayData = Object.entries(dayMap).map(([date, count]) => ({ date, count }));

  const monthEnd = new Date();
  const monthStart = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), 1);
  const paidSinceMonthStart = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: { paymentDate: { gte: monthStart, lte: monthEnd } },
  });

  const revenueByMonth = [
    {
      month: toLocalMonthStr(monthStart),
      revenue: paidSinceMonthStart._sum.amount || 0,
    },
  ];

  const treatmentRecords = await prisma.treatmentRecord.findMany({
    select: { treatment: true },
  });
  const treatmentPopularity = {};
  treatmentRecords.forEach((r) => {
    const name = r.treatment?.en || r.treatment?.name?.en || 'Treatment';
    treatmentPopularity[name] = (treatmentPopularity[name] || 0) + 1;
  });

  const newPatientsByDay = await prisma.patient.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: { createdAt: true },
  });
  const newPatientMap = {};
  Object.keys(dayMap).forEach((k) => {
    newPatientMap[k] = 0;
  });
  newPatientsByDay.forEach((p) => {
    const key = toLocalDateStr(p.createdAt);
    if (key in newPatientMap) newPatientMap[key] += 1;
  });
  const newPatientsData = Object.entries(newPatientMap).map(([date, count]) => ({ date, count }));

  const appointmentStatus = await prisma.appointment.groupBy({ by: ['status'], _count: { _all: true } });

  return successResponse(res, 200, 'Dashboard charts fetched', {
    chartData: {
      appointmentsByDay: appointmentsByDayData,
      revenueByMonth,
      treatmentPopularity: Object.entries(treatmentPopularity).map(([name, count]) => ({ name, count })),
      newPatients: newPatientsData,
      appointmentStatus: appointmentStatus.map((a) => ({ status: a.status, count: a._count._all })),
    },
  });
};