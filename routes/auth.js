const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const db = require('../db');

// Message users must sign
const LOGIN_MESSAGE = "Log in to SOAP";

router.post('/auth/wallet-login', async (req, res) => {
  const { wallet, signature } = req.body;

  try {
    // Recover address from signature
    const recovered = ethers.utils.verifyMessage(LOGIN_MESSAGE, signature);

    // Check if it matches provided wallet
    if (recovered.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Lookup or create user
    let user = await db('users').where({ wallet_address: wallet }).first();

    if (!user) {
      [user] = await db('users')
        .insert({ wallet_address: wallet, user_type: 'wallet' })
        .returning('*');
    }

    // Return basic info (token/session system optional)
    res.json({
      userId: user.id,
      wallet: user.wallet_address,
      sbx_balance: user.sbx_balance
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
