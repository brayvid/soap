exports.up = function(knex) {
  return knex.schema.createTable('token_withdrawals', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.decimal('amount', 14, 4);
    table.string('status'); // e.g., 'pending', 'complete', 'failed'
    table.timestamp('requested_at').defaultTo(knex.fn.now());
    table.timestamp('processed_at');
    table.string('to_wallet_address');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('token_withdrawals');
};
