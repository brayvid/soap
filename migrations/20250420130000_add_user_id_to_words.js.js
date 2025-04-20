exports.up = function(knex) {
  return knex.schema.table('words', function(table) {
    table.integer('user_id').references('id').inTable('users');
  });
};

exports.down = function(knex) {
  return knex.schema.table('words', function(table) {
    table.dropColumn('user_id');
  });
};