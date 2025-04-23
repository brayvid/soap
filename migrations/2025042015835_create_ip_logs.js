// Copyright 2024-2025 soap.fyi <https://soap.fyi>

exports.up = function(knex) {
    return knex.schema.createTable('ip_logs', function(table) {
      table.increments('id').primary();
      table.string('ip').notNullable();
      table.string('action').notNullable(); // e.g. 'vote', 'add_politician'
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.dropTable('ip_logs');
  };
  