// db.js

import knex from 'knex';
// We need to use a dynamic import for the .cjs file
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const config = require('./knexfile.cjs');

// Determine the environment, default to 'development'
const environment = process.env.NODE_ENV || 'development';

// Get the correct configuration for the environment
const dbConfig = config[environment];

// Create the Knex instance
const db = knex(dbConfig);

// Export the instance as the default export
export default db;