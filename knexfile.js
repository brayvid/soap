// Copyright 2024-2025 soap.fyi <https://soap.fyi>

require('dotenv').config();

const isLocal = process.env.DEV_DB_URL.includes('localhost');

module.exports = {
  development: {
    client: 'pg',
    connection: {
      connectionString: process.env.DEV_DB_URL,
      ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } })
    },
    migrations: {
      directory: './migrations'
    },
    seeds: {
      directory: './seeds'
    }
  }
};
