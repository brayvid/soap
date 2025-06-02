// Copyright 2024-2025 soap.fyi <https://soap.fyi>

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.text('profile_url').unique();
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.dropColumn('profile_url');
    });
  };
  
