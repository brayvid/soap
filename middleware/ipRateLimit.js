// Copyright 2024-2025 soap.fyi <https://soap.fyi>

const db = require('../db');

async function isUnderLimit(ip, action, maxPerHour = 5) {
    const { count } = await db('ip_logs')
      .where({ ip, action })
      .andWhere('created_at', '>=', db.raw("now() - interval '1 hour'"))
      .count('id as count')
      .first();
  
    return parseInt(count) < maxPerHour;
  }
  

async function logAction(ip, action) {
  await db('ip_logs').insert({ ip, action });
}

module.exports = { isUnderLimit, logAction };