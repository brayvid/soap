// Copyright 2024-2025 soap.fyi <https://soap.fyi>

exports.up = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.text('district');
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.dropColumn('district');
    });
  };
  