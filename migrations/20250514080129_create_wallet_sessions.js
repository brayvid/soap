exports.up = function(knex) {
  return knex.schema.createTable('wallet_sessions', function(table) {
    table.increments('id').primary();
    table.string('wallet_address');
    table.string('session_token');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at');
    table.index(['wallet_address', 'session_token']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('wallet_sessions');
};
