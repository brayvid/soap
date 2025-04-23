// Copyright 2024-2025 soap.fyi <https://soap.fyi>

async function getOrCreateUserIdFromIP(ip) {
  
  // Check if a user already exists for this IP
    const existingUser = await db('users').where({ ip }).first();
    if (existingUser) return existingUser.id;
  
    // Generate fallback values
    const username = `user_${ip.replace(/\./g, '_')}`;
    const email = `${ip.replace(/\./g, '-') + '@autogen.local'}`;
    const password_hash = 'ip-only-no-password'; // clearly marked dummy
  
    // Insert a new user for this IP
    const [newUser] = await db('users')
      .insert({
        ip,
        username,
        email,
        password_hash
      })
      .returning('*');
  
    return newUser.id;
  }