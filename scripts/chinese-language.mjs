const CJK_PATTERN = /\p{Script=Han}/u;
const LATIN_WORD_PATTERN = /[A-Za-z][A-Za-z0-9_.:/-]*/g;
const FENCE_PATTERN = /^\s*(```|~~~)/;
const HEADING_PATTERN = /^#{1,6}\s+(.+)$/;

export function findLanguageViolations(source, relativePath) {
  if (!supportsLanguagePolicy(relativePath)) return [];

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const violations = [];
  let fence = false;
  let metadata = false;
  let paragraph = [];
  let paragraphLine = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = stripMarkdownTargets(paragraph.join(' '));
    if (!CJK_PATTERN.test(text) && latinWordCount(text) >= 8) {
      violations.push({
        code: 'ICE3_DOC_ENGLISH_PROSE',
        line: paragraphLine,
        message: '段落包含纯英文叙述',
      });
    }
    paragraph = [];
    paragraphLine = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (FENCE_PATTERN.test(line)) {
      flushParagraph();
      fence = !fence;
      continue;
    }
    if (fence) continue;

    if (metadata) {
      if (line.startsWith('>')) continue;
      if (line.trim() === '') continue;
      metadata = false;
    }

    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      flushParagraph();
      const value = stripMarkdownTargets(heading[1]);
      if (!CJK_PATTERN.test(value) && latinWordCount(value) >= 3) {
        violations.push({
          code: 'ICE3_DOC_ENGLISH_HEADING',
          line: lineNumber,
          message: '标题包含纯英文叙述',
        });
      }
      if (/^#\s+\S/.test(line)) metadata = true;
      continue;
    }

    if (line.trim() === '' || line.trimStart().startsWith('|')) {
      flushParagraph();
      continue;
    }

    if (paragraph.length === 0) paragraphLine = lineNumber;
    paragraph.push(line);
  }

  flushParagraph();
  return violations;
}

function supportsLanguagePolicy(relativePath = '') {
  const normalized = relativePath.replaceAll('\\', '/');
  return normalized !== 'THIRD_PARTY_NOTICES.md'
    && !/^tests\/fixtures\/.*\/SOURCE\.md$/.test(normalized)
    && !normalized.startsWith('scripts/fixtures/');
}

function stripMarkdownTargets(value) {
  return value
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/`[^`\n]*`/g, '');
}

function latinWordCount(value) {
  return value.match(LATIN_WORD_PATTERN)?.length ?? 0;
}
