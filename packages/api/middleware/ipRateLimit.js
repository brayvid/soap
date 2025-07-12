// packages/api/middleware/ipRateLimit.js
import db from '../db.js';

const LIMITS = {
    submit_vote: { limit: 10, window_ms: 60 * 60 * 1000 },
    add_politician: { limit: 1, window_ms: 60 * 60 * 1000 },
};

export async function logAction(ip, action, politicianId) {
    try {
        await db('ip_logs').insert({
            ip: ip, // Corrected: using 'ip' column
            action: action, // Corrected: using 'action' column
            politician_id: politicianId,
        });
    } catch (error) {
        console.error('Failed to log action to ip_logs:', error);
    }
}

export async function isUnderLimit(ip, action, politicianId) {
    const rule = LIMITS[action];
    if (!rule) return true;

    const limit = rule.limit;
    const since = new Date(Date.now() - rule.window_ms);

    try {
        const query = db('ip_logs')
            .where({
                ip: ip, // Corrected: using 'ip' column
                action: action, // Corrected: using 'action' column
            })
            .andWhere('created_at', '>=', since);

        if (action === 'add_politician') {
            query.whereNull('politician_id');
        } else { // This covers 'submit_vote' and any other future action types
            query.where({ politician_id: politicianId });
        }
        
        const [result] = await query.count('* as count');
        const actionCount = parseInt(result.count, 10);

        return actionCount < limit;
    } catch (error) {
        console.error(`Failed to check rate limit for ${action}:`, error);
        return false;
    }
}