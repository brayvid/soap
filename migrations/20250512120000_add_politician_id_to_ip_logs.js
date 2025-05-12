// Copyright 2024-2025 soap.fyi <https://soap.fyi>

exports.up = function(knex) {
  return knex.schema.table('ip_logs', function(table) {
    table.integer('politician_id').unsigned().nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('ip_logs', function(table) {
    table.dropColumn('politician_id');
  });
};