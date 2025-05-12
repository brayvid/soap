// Copyright 2024-2025 soap.fyi <https://soap.fyi>

const db = require('../db');

async function isUnderLimit(ip, action, politicianId = null, maxPerHour = 5) {
  const query = db('ip_logs')
    .where({ ip, action })
    .andWhere('created_at', '>=', db.raw("now() - interval '1 hour'"));

  if (politicianId !== null) {
    query.andWhere({ politician_id: politicianId });
  }

  const { count } = await query.count('id as count').first();

  return parseInt(count) < maxPerHour;
}

async function logAction(ip, action, politicianId = null) {
  await db('ip_logs').insert({ ip, action, politician_id: politicianId });
}

module.exports = { isUnderLimit, logAction };
