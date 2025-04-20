const db = require('../db');

async function isUnderLimit(ip, action, maxPerHour = 1) {
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

async function getOrCreateUserIdFromIP(ip) {
  // Try to find an existing user
  let user = await db('users').where({ ip }).first();
  if (user) return user.id;

  // Create a new one
  const [newUser] = await db('users').insert({ ip }).returning('*');
  return newUser.id;
}


module.exports = { isUnderLimit, logAction };