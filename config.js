'use strict';

module.exports = {
  migrationsRepo: process.env.MIGRATIONS_REPO || 'modern-slavery-schema',
  tableName: process.env.TABLE_NAME || 'reports',
  serviceType: process.env.SERVICE_TYPE || 'modern-slavery'
};
