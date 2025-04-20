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