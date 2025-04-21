// Copyright 2025 Blake Rayvid <https://github.com/brayvid>

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