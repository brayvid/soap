exports.up = function(knex) {
  return knex.schema.createTable('token_activity_log', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.string('action'); // e.g., 'vote', 'submit_word'
    table.decimal('amount', 14, 4);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.text('meta'); // optional JSON string
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('token_activity_log');
};
