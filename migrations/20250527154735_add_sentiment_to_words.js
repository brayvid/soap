// Copyright 2024-2025 soap.fyi <https://soap.fyi>

exports.up = function(knex) {
  return knex.schema.table('words', function(table) {
    table.float('sentiment_score').nullable(); // stores VADER compound score
  });
};

exports.down = function(knex) {
  return knex.schema.table('words', function(table) {
    table.dropColumn('sentiment_score');
  });
};
