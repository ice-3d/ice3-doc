import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixture = (name) => readFile(
  new URL(`./fixtures/toolchain-sidecar/${name}`, import.meta.url),
  'utf8',
).then(JSON.parse);

test('freezes contract version and required methods', async () => {
  const capabilities = await fixture('capabilities-v1.json');
  assert.equal(capabilities.contractVersion, '1.0.0');
  assert.equal(capabilities.packageVersion, '0.2.0');
  assert.deepEqual(capabilities.operations, [
    'toolchain.capabilities',
    'asset.validate',
    'asset.prepare',
    'asset.preview',
    'asset.partition',
    '$/cancel',
  ]);
});

test('preview request and result are path-confined', async () => {
  const request = await fixture('preview-request-v1.json');
  const result = await fixture('preview-result-v1.json');
  assert.equal(request.params.sourcePath, 'cache/preview/00000002-source.glb');
  assert.equal(result.contentHash.startsWith('sha256:'), true);
  assert.equal(result.primaryPath.startsWith('cache/toolchain/'), true);
  assert.equal(result.primaryPath.includes('..'), false);
});

test('schema defines all frozen payload families', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../docs/contracts/toolchain-sidecar-v1.schema.json', import.meta.url),
    'utf8',
  ));
  for (const key of [
    'assetResult',
    'capabilities',
    'errorResult',
    'previewRequest',
    'progressNotification',
  ]) {
    assert.ok(schema.$defs[key], `missing $defs.${key}`);
  }
});
