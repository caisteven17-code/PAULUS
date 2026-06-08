#!/usr/bin/env node
/**
 * Test script to verify subsidy_type implementation
 * Run: node test-subsidy-type.js
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(level, message) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  const color = {
    info: colors.blue,
    success: colors.green,
    error: colors.red,
    warning: colors.yellow,
  }[level] || colors.reset;
  console.log(`${color}[${timestamp}] ${level.toUpperCase()}${colors.reset} ${message}`);
}

async function checkFileContent(filePath, pattern, description) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes(pattern)) {
      log('success', `✓ ${description}`);
      return true;
    } else {
      log('error', `✗ ${description}`);
      return false;
    }
  } catch (error) {
    log('error', `✗ Could not read ${filePath}: ${error.message}`);
    return false;
  }
}

async function checkMigration(filePath, description) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('subsidy_type')) {
        log('success', `✓ ${description} exists and contains subsidy_type`);
        return true;
      } else {
        log('error', `✗ ${description} exists but missing subsidy_type`);
        return false;
      }
    } else {
      log('error', `✗ ${description} not found at ${filePath}`);
      return false;
    }
  } catch (error) {
    log('error', `✗ Error checking ${description}: ${error.message}`);
    return false;
  }
}

async function runTests() {
  log('info', 'Starting subsidy_type implementation verification...\n');

  let passed = 0;
  let failed = 0;

  console.log(`${colors.blue}=== FRONTEND CHECKS ===${colors.reset}`);

  if (await checkFileContent(
    'src/frontend/src/components/settings/EntityManagementControl.tsx',
    'subsidyType',
    'Frontend form state includes subsidyType field'
  )) {
    passed++;
  } else {
    failed++;
  }

  if (await checkFileContent(
    'src/frontend/src/components/settings/EntityManagementControl.tsx',
    'subsidy_type: formState.subsidyType',
    'Frontend converts subsidyType to subsidy_type in payload'
  )) {
    passed++;
  } else {
    failed++;
  }

  if (await checkFileContent(
    'src/frontend/src/components/settings/EntityManagementControl.tsx',
    'Subsidy Type',
    'Frontend UI has Subsidy Type label'
  )) {
    passed++;
  } else {
    failed++;
  }

  console.log(`\n${colors.blue}=== BACKEND CHECKS ===${colors.reset}`);

  if (await checkFileContent(
    'src/backend/src/services/entity.service.ts',
    'syncInstitutionFields',
    'Entity service has syncInstitutionFields method'
  )) {
    passed++;
  } else {
    failed++;
  }

  if (await checkFileContent(
    'src/backend/src/services/entity.service.ts',
    "payload.subsidy_type = subsidyType",
    'syncInstitutionFields sets subsidy_type in payload'
  )) {
    passed++;
  } else {
    failed++;
  }

  if (await checkFileContent(
    'src/backend/src/services/entity.service.ts',
    'normalizeEntityResponse',
    'Entity service has normalizeEntityResponse method'
  )) {
    passed++;
  } else {
    failed++;
  }

  if (await checkFileContent(
    'src/backend/src/services/entity.service.ts',
    'entity.subsidy_type',
    'normalizeEntityResponse handles subsidy_type field'
  )) {
    passed++;
  } else {
    failed++;
  }

  console.log(`\n${colors.blue}=== DATABASE MIGRATION CHECKS ===${colors.reset}`);

  if (await checkMigration(
    'supabase/portable_migrations/179_add_subsidy_type_entity_tables.sql',
    'Migration 179 (Entity tables)'
  )) {
    passed++;
  } else {
    failed++;
  }

  if (await checkMigration(
    'supabase/portable_migrations/180_add_subsidy_type_to_institutions.sql',
    'Migration 180 (Central institutions table)'
  )) {
    passed++;
  } else {
    failed++;
  }

  console.log(`\n${colors.blue}=== SUMMARY ===${colors.reset}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  console.log(`Total: ${passed + failed}`);

  if (failed === 0) {
    log('success', '\n✓ All checks passed! Implementation is complete.');
    log('info', 'Next step: Apply database migrations');
    log('info', '  1. Run migration 179 in Supabase SQL Editor');
    log('info', '  2. Run migration 180 in Supabase SQL Editor');
    log('info', '  3. Test the form by editing an entity and changing Subsidy Type');
    process.exit(0);
  } else {
    log('error', '\n✗ Some checks failed. Please review the errors above.');
    process.exit(1);
  }
}

runTests().catch(error => {
  log('error', `Fatal error: ${error.message}`);
  process.exit(1);
});
