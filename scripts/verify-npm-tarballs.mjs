import { spawnSync } from 'node:child_process';
import {
  access,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workspace = dirname(root);
const ice3Version = JSON.parse(await readFile(
  resolve(workspace, 'ice3-engine', 'packages', 'ice3', 'package.json'),
  'utf8',
)).version;
const industrialVersion = JSON.parse(await readFile(
  resolve(
    workspace,
    'ice3-industrial',
    'packages',
    'industrial-core',
    'package.json',
  ),
  'utf8',
)).version;
const tarballs = {
  ice3: resolve(
    workspace,
    'ice3-engine',
    'release',
    'artifacts',
    `ice3-${ice3Version}.tgz`,
  ),
  industrial: resolve(
    workspace,
    'ice3-industrial',
    'release',
    'artifacts',
    `ice3-industrial-core-${industrialVersion}.tgz`,
  ),
};

function run(command, args, cwd, expectedStatus = 0) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== expectedStatus) {
    throw new Error(
      `${command} ${args.join(' ')} failed with ${result.status}:\n${result.stdout}${result.stderr}`,
    );
  }
  return result;
}

for (const [name, tarball] of Object.entries(tarballs)) {
  try {
    await access(tarball);
  } catch {
    throw new Error(`ICE3_RELEASE_TARBALL_MISSING: ${name} ${tarball}`);
  }
}

const consumer = await mkdtemp(join(tmpdir(), 'ice3-npm-consumer-'));
try {
  await writeFile(
    join(consumer, 'package.json'),
    '{"private":true,"type":"module"}\n',
  );
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      tarballs.ice3,
      tarballs.industrial,
    ],
    consumer,
  );
  run(process.execPath, [
    '--input-type=module',
    '--eval',
    [
      "import { ICE3 } from 'ice3';",
      "import { ICEIndustrialWorkspace } from '@ice3/industrial-core';",
      "if (typeof ICE3 !== 'function') process.exit(1);",
      "if (typeof ICEIndustrialWorkspace !== 'function') process.exit(2);",
    ].join('\n'),
  ], consumer);

  await writeFile(
    join(consumer, 'index.ts'),
    [
      "import { ICE3, ICEScene } from 'ice3';",
      "import { ICEIndustrialWorkspace } from '@ice3/industrial-core';",
      'const engine: typeof ICE3 = ICE3;',
      'const scene: ICEScene | undefined = undefined;',
      'const industrial: typeof ICEIndustrialWorkspace = ICEIndustrialWorkspace;',
      'void engine; void scene; void industrial;',
    ].join('\n'),
  );
  await writeFile(
    join(consumer, 'tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2022',
      },
      include: ['index.ts'],
    }, null, 2)}\n`,
  );
  run(
    resolve(workspace, 'ice3-engine', 'node_modules', '.bin', 'tsc'),
    ['--project', 'tsconfig.json'],
    consumer,
  );

  for (const [name, path] of [
    ['ice3', ['ice3', 'package.json']],
    ['industrial', ['@ice3', 'industrial-core', 'package.json']],
  ]) {
    const manifest = JSON.parse(await readFile(
      join(consumer, 'node_modules', ...path),
      'utf8',
    ));
    if (
      manifest.private
      || Object.keys(manifest.dependencies ?? {})
        .some((dependency) => dependency.startsWith('@ice3/'))
    ) {
      throw new Error(`ICE3_RELEASE_MANIFEST_INVALID: ${name}`);
    }
  }
  console.info(`ICE3_NPM_TARBALLS_OK: ice3@${ice3Version}, @ice3/industrial-core@${industrialVersion}`);
} finally {
  await rm(consumer, { recursive: true, force: true });
}
