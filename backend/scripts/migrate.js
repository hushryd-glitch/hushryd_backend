#!/usr/bin/env node
/**
 * Database Migration Runner for HushRyd Backend
 * 
 * This script runs database migrations for MongoDB/Mongoose.
 * Migrations are stored in backend/migrations/ directory.
 * 
 * Usage:
 *   npm run migrate           - Run all pending migrations
 *   npm run migrate:staging   - Run migrations for staging environment
 *   npm run migrate:production - Run migrations for production environment
 *   npm run migrate:status    - Show migration status
 *   npm run migrate:rollback  - Rollback last migration
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Migration tracking schema
const migrationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  appliedAt: { type: Date, default: Date.now },
  environment: { type: String, required: true }
});

const Migration = mongoose.model('Migration', migrationSchema);

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }
  
  console.log('Connecting to database...');
  await mongoose.connect(mongoUri);
  console.log('Database connected successfully');
}

async function disconnectDatabase() {
  await mongoose.disconnect();
  console.log('Database disconnected');
}

async function getAppliedMigrations() {
  const migrations = await Migration.find().sort({ appliedAt: 1 });
  return migrations.map(m => m.name);
}

async function getPendingMigrations() {
  const applied = await getAppliedMigrations();
  
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('No migrations directory found. Creating...');
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    return [];
  }
  
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();
  
  return files.filter(f => !applied.includes(f));
}


async function runMigration(filename) {
  const migrationPath = path.join(MIGRATIONS_DIR, filename);
  const migration = require(migrationPath);
  
  console.log(`Running migration: ${filename}`);
  
  if (typeof migration.up !== 'function') {
    throw new Error(`Migration ${filename} does not export an 'up' function`);
  }
  
  await migration.up(mongoose);
  
  await Migration.create({
    name: filename,
    environment: process.env.NODE_ENV || 'development'
  });
  
  console.log(`Migration ${filename} completed successfully`);
}

async function rollbackMigration(filename) {
  const migrationPath = path.join(MIGRATIONS_DIR, filename);
  const migration = require(migrationPath);
  
  console.log(`Rolling back migration: ${filename}`);
  
  if (typeof migration.down !== 'function') {
    throw new Error(`Migration ${filename} does not export a 'down' function`);
  }
  
  await migration.down(mongoose);
  await Migration.deleteOne({ name: filename });
  
  console.log(`Migration ${filename} rolled back successfully`);
}

async function runAllMigrations() {
  const pending = await getPendingMigrations();
  
  if (pending.length === 0) {
    console.log('No pending migrations');
    return;
  }
  
  console.log(`Found ${pending.length} pending migration(s)`);
  
  for (const migration of pending) {
    await runMigration(migration);
  }
  
  console.log('All migrations completed');
}

async function showStatus() {
  const applied = await getAppliedMigrations();
  const pending = await getPendingMigrations();
  
  console.log('\n=== Migration Status ===\n');
  
  if (applied.length > 0) {
    console.log('Applied migrations:');
    applied.forEach(m => console.log(`  ✓ ${m}`));
  } else {
    console.log('No migrations have been applied');
  }
  
  console.log('');
  
  if (pending.length > 0) {
    console.log('Pending migrations:');
    pending.forEach(m => console.log(`  ○ ${m}`));
  } else {
    console.log('No pending migrations');
  }
  
  console.log('');
}

async function rollbackLast() {
  const applied = await getAppliedMigrations();
  
  if (applied.length === 0) {
    console.log('No migrations to rollback');
    return;
  }
  
  const lastMigration = applied[applied.length - 1];
  await rollbackMigration(lastMigration);
}

async function main() {
  const command = process.argv[2] || 'up';
  
  try {
    await connectDatabase();
    
    switch (command) {
      case 'up':
        await runAllMigrations();
        break;
      case 'status':
        await showStatus();
        break;
      case 'rollback':
        await rollbackLast();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log('Available commands: up, status, rollback');
        process.exit(1);
    }
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

main();
