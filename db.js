// Copyright 2025 Blake Rayvid <https://github.com/brayvid>

const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

module.exports = db;
