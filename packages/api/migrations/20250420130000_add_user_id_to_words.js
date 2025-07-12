// Copyright 2024-2025 soap.fyi <https://soap.fyi>

exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('words', 'user_id');
  if (!hasColumn) {
    await knex.schema.table('words', function(table) {
      table.integer('user_id').unsigned().nullable();
    });
  }
};

exports.down = function(knex) {
  return knex.schema.table('words', function(table) {
    table.dropColumn('user_id');
  });
};
