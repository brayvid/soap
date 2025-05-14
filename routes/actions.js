const express = require('express');
const router = express.Router();
const verifyWallet = require('../middleware/verifyWallet');
const db = require('../db');

async function rewardUser(userId, amount, action = 'vote') {
  await db('users').where({ id: userId }).increment('sbx_balance', amount);
  await db('token_activity_log').insert({
    user_id: userId,
    action,
    amount
  });
}

// POST /vote — requires wallet auth
router.post('/vote', verifyWallet, async (req, res) => {
  const user = req.user;
  const { word_id, choice } = req.body;

  if (!word_id || !choice) {
    return res.status(400).json({ error: "Missing word_id or choice" });
  }

  try {
    // Add vote to votes table
    await db('votes').insert({
      user_id: user.id,
      word_id,
      choice
    });

    // Reward SBX for voting
    await rewardUser(user.id, 0.5, 'vote');

    res.json({
      success: true,
      message: "Vote recorded, SBX awarded.",
      sbx_balance: user.sbx_balance + 0.5
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Voting failed." });
  }
});

module.exports = router;
