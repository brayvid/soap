// Copyright 2025 Blake Rayvid <https://github.com/brayvid>

exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id').primary();
    table.string('ip').notNullable();  // 👈 this is the critical line
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
