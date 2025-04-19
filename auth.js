const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// Register
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  // Trim and validate inputs
  if (
    !username || !email || !password ||
    username.trim().length < 3 ||
    !email.includes('@') ||
    password.length < 6
  ) {
    return res.status(400).json({ error: 'All fields are required. Password must be at least 6 characters.' });
  }

  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim().toLowerCase();

  try {
    // Check for existing user
    const existing = await db('users')
      .where({ username: trimmedUsername })
      .orWhere({ email: trimmedEmail })
      .first();

    if (existing) {
      return res.status(400).json({ error: 'Username or email already in use.' });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Insert user
    const [user] = await db('users')
      .insert({
        username: trimmedUsername,
        email: trimmedEmail,
        password_hash: hash
      })
      .returning(['id', 'username']);

    // Issue token
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
    console.log('Response status:', res.status);
    console.log('Response body:', data);

  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('Login request body:', req.body);

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  try {
    const user = await db('users').where({ username: username.trim() }).first();

    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Try again.' });
  }
});


module.exports = router;
