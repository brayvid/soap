// Copyright 2025 Blake Rayvid <https://github.com/brayvid>

exports.up = function(knex) {
  return knex.schema.createTable('votes', table => {
    table.increments('vote_id').primary();
    table.integer('user_id').notNullable();
    table.integer('politician_id').unsigned().notNullable()
         .references('politician_id').inTable('politicians')
         .onDelete('CASCADE');
    table.integer('word_id').unsigned().notNullable()
         .references('word_id').inTable('words')
         .onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('votes');
};