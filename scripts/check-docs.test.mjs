import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkRepository } from './check-docs.mjs';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const fixtures = join(scriptsDirectory, 'fixtures');
const validFixtureRoot = join(fixtures, 'docs-valid');
const invalidFixtureRoot = join(fixtures, 'docs-invalid');

test('accepts one titled document with valid metadata', async () => {
  const report = await checkRepository(validFixtureRoot, { expectedArea: 'DOC' });
  assert.deepEqual(report.errors, []);
});

test('rejects duplicate IDs and missing metadata', async () => {
  const report = await checkRepository(invalidFixtureRoot, { expectedArea: 'DOC' });
  const errors = report.errors.join('\n');
  assert.match(errors, /missing Document ID/);
  assert.match(errors, /duplicate Document ID/);
  assert.match(errors, /unsupported Status/);
});

test('rejects incomplete indexes', async () => {
  const report = await checkRepository(invalidFixtureRoot, { expectedArea: 'DOC' });
  assert.match(report.errors.join('\n'), /index does not link/);
});

test('rejects broken files, anchors, and cross-repository URLs', async () => {
  const report = await checkRepository(invalidFixtureRoot, { expectedArea: 'DOC' });
  const errors = report.errors.join('\n');
  assert.match(errors, /broken relative link/);
  assert.match(errors, /missing anchor/);
  assert.match(errors, /invalid cross-repository URL/);
});

test('rejects local absolute paths and placeholder claims', async () => {
  const report = await checkRepository(invalidFixtureRoot, { expectedArea: 'DOC' });
  const errors = report.errors.join('\n');
  assert.match(errors, /local absolute path/);
  assert.match(errors, /Placeholder document contains executable content/);
});

test('CLI reports JSON and a non-zero status for invalid documentation', () => {
  const result = spawnSync(
    process.execPath,
    [
      join(scriptsDirectory, 'check-docs.mjs'),
      '--root',
      invalidFixtureRoot,
      '--expected-area',
      'DOC',
      '--json',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.valid, false);
  assert.ok(report.errors.length > 0);
});
