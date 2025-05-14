const { ethers } = require('ethers');
const db = require('../db');

const LOGIN_MESSAGE = "Log in to SOAP";

async function verifyWallet(req, res, next) {
  const { wallet, signature } = req.body;

  if (!wallet || !signature) {
    return res.status(400).json({ error: "Missing wallet or signature" });
  }

  try {
    const recovered = ethers.utils.verifyMessage(LOGIN_MESSAGE, signature);

    if (recovered.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(401).json({ error: "Signature does not match wallet" });
    }

    // Find or create user
    let user = await db('users').where({ wallet_address: wallet }).first();

    if (!user) {
      [user] = await db('users')
        .insert({ wallet_address: wallet, user_type: 'wallet' })
        .returning('*');
    }

    // Attach user to request for downstream use
    req.user = user;
    next();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Wallet verification failed" });
  }
}

module.exports = verifyWallet;
