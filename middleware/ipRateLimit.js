// middleware/ipRateLimit.js

import db from '../db.js';

const RATE_LIMITS = {
    add_politician: { limit: 5, window_seconds: 3600 },
    submit_vote: { limit: 10, window_seconds: 3600 },
};

export async function isUnderLimit(ip, action, politicianId = null) {
    const config = RATE_LIMITS[action];
    if (!config) return true;

    const now = new Date();
    const windowStart = new Date(now.getTime() - config.window_seconds * 1000);

    // --- THE FIX IS HERE ---
    // Changed the 'timestamp' column to 'created_at'
    const query = db('ip_logs')
        .where({ ip: ip, action: action })
        .andWhere('created_at', '>=', windowStart); // Using the correct column name 'created_at'

    if (politicianId) {
        query.andWhere('politician_id', politicianId);
    }

    const [{ count }] = await query.count('* as count');
    return parseInt(count) < config.limit;
}

export async function logAction(ip, action, politicianId = null) {
    // --- AND THE FIX IS HERE ---
    // No change needed here, because we're letting the database handle the timestamp
    // The insert call just needs to provide the other columns.
    await db('ip_logs').insert({
        ip: ip,
        action: action,
        politician_id: politicianId,
        // The 'created_at' column is usually populated by the database automatically,
        // so we don't need to specify it here. If your schema requires it, you would add:
        // created_at: new Date()
    });
}