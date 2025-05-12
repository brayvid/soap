exports.up = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.text('chamber');
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.table('politicians', function(table) {
      table.dropColumn('chamber');
    });
  };
  