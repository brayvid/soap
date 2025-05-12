/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.text('state');
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.dropColumn('state');
    });
  };
  
