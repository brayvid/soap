/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.timestamp('last_updated');
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.dropColumn('last_updated');
    });
  };
  