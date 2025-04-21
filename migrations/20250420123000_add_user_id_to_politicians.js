// Copyright 2025 Blake Rayvid <https://github.com/brayvid>

exports.up = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.integer('user_id').references('id').inTable('users');
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.dropColumn('user_id');
    });
  };
  