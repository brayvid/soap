exports.up = function(knex) {
  return knex.schema.table('users', function(table) {
    table.string('wallet_address').unique();
    table.decimal('sbx_balance', 14, 4).defaultTo(0);
    table.integer('reputation_score').defaultTo(0);
    table.enu('user_type', ['guest', 'wallet', 'admin']).defaultTo('guest');
  });
};

exports.down = function(knex) {
  return knex.schema.table('users', function(table) {
    table.dropColumn('wallet_address');
    table.dropColumn('sbx_balance');
    table.dropColumn('reputation_score');
    table.dropColumn('user_type');
  });
};
