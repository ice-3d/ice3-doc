import {
  readFile,
  readdir,
  stat,
} from 'node:fs/promises';
import {
  extname,
  join,
  relative,
  resolve,
} from 'node:path';
import { findLanguageViolations } from './chinese-language.mjs';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.superpowers',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);

const rootIndex = process.argv.indexOf('--root');
const root = resolve(
  rootIndex >= 0 && process.argv[rootIndex + 1]
    ? process.argv[rootIndex + 1]
    : process.cwd(),
);
const targets = process.argv
  .slice(2)
  .filter((value, index, values) => (
    value !== '--root'
    && values[index - 1] !== '--root'
  ));

if (targets.length === 0) {
  process.stderr.write('usage: check-language-files.mjs --root <repository> <path...>\n');
  process.exitCode = 2;
} else {
  const files = new Set();
  for (const target of targets) {
    await collectMarkdownFiles(resolve(root, target), files);
  }

  let violationCount = 0;
  for (const file of [...files].sort()) {
    const relativePath = relative(root, file).replaceAll('\\', '/');
    const source = await readFile(file, 'utf8');
    for (const violation of findLanguageViolations(source, relativePath)) {
      process.stderr.write(
        `${relativePath}:${violation.line}: ${violation.code}: ${violation.message}\n`,
      );
      violationCount += 1;
    }
  }

  if (violationCount > 0) {
    process.exitCode = 1;
  } else {
    process.stdout.write(`${files.size} Markdown files use Chinese narrative.\n`);
  }
}

async function collectMarkdownFiles(path, files) {
  const details = await stat(path);
  if (details.isFile()) {
    if (extname(path) === '.md') files.add(path);
    return;
  }
  if (!details.isDirectory()) return;

  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(child, files);
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      files.add(child);
    }
  }
}
