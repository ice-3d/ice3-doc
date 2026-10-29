import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkRepository } from './check-docs.mjs';
import { findLanguageViolations } from './chinese-language.mjs';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const fixtures = join(scriptsDirectory, 'fixtures');
const validFixtureRoot = join(fixtures, 'docs-valid');
const invalidFixtureRoot = join(fixtures, 'docs-invalid');

test('accepts one titled document with valid metadata', async () => {
  const report = await checkRepository(validFixtureRoot, { expectedArea: 'DOC' });
  assert.deepEqual(report.errors, []);
});

test('excludes root repository agent instructions from product documentation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-docs-'));
  try {
    await writeFile(join(root, 'README.md'), [
      '# Placeholder Repository',
      '',
      '> Document ID: ICE3-DOC-RM-001',
      '>',
      '> Status: Placeholder',
      '>',
      '> Owner: Documentation tests',
      '',
      'No public implementation exists yet.',
      '',
    ].join('\n'));
    await writeFile(join(root, 'AGENTS.md'), [
      '# Repository Agent Instructions',
      '',
      '> Document ID: ICE3-DOC-POL-001',
      '>',
      '> Status: Active',
      '>',
      '> Owner: Documentation tests',
      '',
      'These instructions govern repository work.',
      '',
    ].join('\n'));

    const report = await checkRepository(root, { expectedArea: 'DOC' });
    assert.equal(report.documentCount, 1);
    assert.deepEqual(report.errors, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
  assert.match(
    report.errors.join('\n'),
    /README does not link docs\/README\.md/,
  );
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

test('accepts a Chinese specification without an English summary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-docs-'));
  try {
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'README.md'), [
      '# 仓库',
      '',
      '> Document ID: ICE3-DOC-RM-001',
      '>',
      '> Status: Active',
      '>',
      '> Owner: Documentation tests',
      '',
      '[索引](docs/README.md)',
      '',
    ].join('\n'));
    await writeFile(join(root, 'docs', 'README.md'), [
      '# 文档索引',
      '',
      '> Document ID: ICE3-DOC-IDX-001',
      '>',
      '> Status: Active',
      '>',
      '> Owner: Documentation tests',
      '',
      '- [README](../README.md)',
      '- [规格](spec.md)',
      '',
    ].join('\n'));
    await writeFile(join(root, 'docs', 'spec.md'), [
      '# 中文规格',
      '',
      '> Document ID: ICE3-DOC-SPEC-001',
      '>',
      '> Status: Draft',
      '>',
      '> Owner: Documentation tests',
      '',
      '本文定义中文文档规则。',
      '',
    ].join('\n'));

    const report = await checkRepository(root, { expectedArea: 'DOC' });
    assert.deepEqual(report.errors, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('accepts Chinese narrative with retained technical terms', () => {
  const source = [
    '# 场景与 Selection',
    '',
    '当前 Selection 保存在 Scene 中，并在相机变化后保持稳定。',
    '',
  ].join('\n');

  assert.deepEqual(findLanguageViolations(source, 'README.md'), []);
});

test('rejects an English-only heading', () => {
  const violations = findLanguageViolations(
    '# Scene and Selection\n\n当前 Selection 保持稳定。\n',
    'README.md',
  );

  assert.equal(violations[0].code, 'ICE3_DOC_ENGLISH_HEADING');
  assert.equal(violations[0].line, 1);
});

test('rejects an English-only prose paragraph', () => {
  const violations = findLanguageViolations([
    '# 示例',
    '',
    'The current selection remains stable while the camera moves through the scene.',
    '',
  ].join('\n'), 'README.md');

  assert.equal(violations[0].code, 'ICE3_DOC_ENGLISH_PROSE');
  assert.equal(violations[0].line, 3);
});

test('ignores English inside fenced and inline code', () => {
  const source = [
    '# 示例',
    '',
    '使用 `findSelectionById` 查询当前 Selection。',
    '',
    '```ts',
    'const selection = findSelectionById("device-01");',
    'console.log(selection);',
    '```',
    '',
  ].join('\n');

  assert.deepEqual(findLanguageViolations(source, 'README.md'), []);
});

test('accepts technical table values without Chinese descriptions', () => {
  const source = [
    '# 字段',
    '',
    '| Field | Type |',
    '| --- | --- |',
    '| selectionId | string |',
    '| nodeId | string |',
    '',
  ].join('\n');

  assert.deepEqual(findLanguageViolations(source, 'README.md'), []);
});

test('excludes legal notices and source fixtures by path', () => {
  const english = '# Third Party Notices\n\nUpstream license text remains unchanged.\n';
  assert.deepEqual(
    findLanguageViolations(english, 'THIRD_PARTY_NOTICES.md'),
    [],
  );
  assert.deepEqual(
    findLanguageViolations(
      english,
      'tests/fixtures/3d-tiles-1.1-schema/SOURCE.md',
    ),
    [],
  );
});

test('flags English AGENTS prose without requiring an index entry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-docs-'));
  try {
    await writeFile(join(root, 'README.md'), [
      '# 占位仓库',
      '',
      '> Document ID: ICE3-DOC-RM-001',
      '>',
      '> Status: Placeholder',
      '>',
      '> Owner: Documentation tests',
      '',
      '当前没有公开实现。',
      '',
    ].join('\n'));
    await writeFile(join(root, 'AGENTS.md'), [
      '# Repository Rules And Verification',
      '',
      '> Document ID: ICE3-DOC-POL-001',
      '>',
      '> Status: Active',
      '>',
      '> Owner: Documentation tests',
      '',
      'All repository changes must follow the verification rules.',
      '',
    ].join('\n'));

    const report = await checkRepository(root, {
      expectedArea: 'DOC',
      language: true,
    });
    const errors = report.errors.join('\n');
    assert.match(errors, /AGENTS\.md:1: ICE3_DOC_ENGLISH_HEADING/);
    assert.doesNotMatch(errors, /index does not link/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('language file CLI checks only the requested path', () => {
  const result = spawnSync(
    process.execPath,
    [
      join(scriptsDirectory, 'check-language-files.mjs'),
      '--root',
      invalidFixtureRoot,
      'README.md',
    ],
    { encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ICE3_DOC_ENGLISH_HEADING/);
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

test('discovers repository worktrees in workspace mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-workspace-'));
  const repository = join(root, 'ice3-doc');
  const gitDirectory = join(root, 'git-directory');
  try {
    await mkdir(repository);
    execFileSync('git', [
      'init',
      '--separate-git-dir',
      gitDirectory,
      repository,
    ]);
    await mkdir(join(repository, 'docs'));
    await writeFile(join(repository, 'README.md'), [
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
    await writeFile(join(repository, 'docs', 'README.md'), [
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
    execFileSync('git', ['-C', repository, 'add', '.']);
    execFileSync('git', [
      '-C',
      repository,
      '-c',
      'user.name=Documentation Tests',
      '-c',
      'user.email=docs@example.test',
      'commit',
      '-m',
      'fixture',
    ]);

    const result = spawnSync(
      process.execPath,
      [
        join(scriptsDirectory, 'check-docs.mjs'),
        '--workspace-root',
        root,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ice3-doc: 2 documents valid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
