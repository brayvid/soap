// Copyright 2024-2025 soap.fyi <https://soap.fyi>

exports.up = function(knex) {
    return knex.schema.alterTable('politicians', function(table) {
      table.unique('name');
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.alterTable('politicians', function(table) {
      table.dropUnique('name');
    });
  };