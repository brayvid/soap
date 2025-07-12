// Copyright 2024-2025 soap.fyi <https://soap.fyi>

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