// knexfile.cjs

// This line allows us to use the .env file to load the database URL
require('dotenv').config();

// We need to export the configuration using the older `module.exports` syntax
// because this file is being read by the Knex command-line tool.
module.exports = {

  development: {
    client: 'pg', // PostgreSQL client
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './migrations'
    }
  },

  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      // Railway requires SSL for its PostgreSQL connections
      ssl: { rejectUnauthorized: false } 
    },
    migrations: {
      directory: './migrations'
    },
    pool: {
      min: 2,
      max: 10
    }
  }

};