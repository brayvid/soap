// Copyright 2024-2025 soap.fyi <https://soap.fyi>

const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

module.exports = db;
