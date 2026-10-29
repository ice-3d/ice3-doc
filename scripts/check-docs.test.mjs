import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
  assert.match(errors, /Chinese specification lacks English summary/);
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

test('rejects placeholder claims', async () => {
  const report = await checkRepository(invalidFixtureRoot, { expectedArea: 'DOC' });
  const errors = report.errors.join('\n');
  assert.match(errors, /Placeholder document contains executable content/);
});

test('rejects local absolute paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-docs-'));
  try {
    const localPath = ['', 'Users', 'example', 'project', 'model.glb'].join('/');
    await writeFile(join(root, 'README.md'), [
      '# Invalid Local Path',
      '',
      '> Document ID: ICE3-DOC-RM-001',
      '>',
      '> Status: Active',
      '>',
      '> Owner: Documentation tests',
      '',
      `Local asset: ${localPath}`,
      '',
    ].join('\n'));

    const report = await checkRepository(root, { expectedArea: 'DOC' });
    assert.match(report.errors.join('\n'), /local absolute path/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test('excludes invalid validator fixtures from product documentation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-docs-'));
  try {
    await mkdir(join(root, 'docs'));
    await mkdir(join(root, 'scripts', 'fixtures'), { recursive: true });
    await writeFile(join(root, 'README.md'), [
      '# Repository',
      '',
      '> Document ID: ICE3-DOC-RM-001',
      '>',
      '> Status: Active',
      '>',
      '> Owner: Documentation tests',
      '',
      '[Index](docs/README.md#documents)',
      '',
    ].join('\n'));
    await writeFile(join(root, 'docs', 'README.md'), [
      '# Documents',
      '',
      '> Document ID: ICE3-DOC-IDX-001',
      '>',
      '> Status: Active',
      '>',
      '> Owner: Documentation tests',
      '',
      '## Documents',
      '',
      '- [README](../README.md)',
      '',
    ].join('\n'));
    await writeFile(
      join(root, 'scripts', 'fixtures', 'README.md'),
      '# Invalid fixture\n\nThis file intentionally has no metadata.\n',
    );

    const report = await checkRepository(root, { expectedArea: 'DOC' });
    assert.deepEqual(report.errors, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
