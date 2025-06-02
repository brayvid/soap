// Copyright 2024-2025 soap.fyi <https://soap.fyi>

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.table('politicians', function(table) {
    //   table.text('chamber');
      table.text('bioguide_id');
      table.integer('person_id');
      table.text('title');
      table.date('start_date');
      table.date('end_date');
      table.text('slug');
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.dropColumn('chamber');
      table.dropColumn('bioguide_id');
      table.dropColumn('person_id');
      table.dropColumn('title');
      table.dropColumn('start_date');
      table.dropColumn('end_date');
      table.dropColumn('slug');
    });
  };
  