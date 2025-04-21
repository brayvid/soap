// Copyright 2025 Blake Rayvid <https://github.com/brayvid>

exports.up = function(knex) {
  return knex.schema.createTable('words', table => {
    table.increments('word_id').primary();
    table.string('word').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('words');
};