# ICE3 Documentation Repository Rules

> Document ID: ICE3-DOC-POL-001
>
> Status: Active
>
> Owner: ICE3 documentation maintainers

## Cross-repository contracts

- This repository is the single source of truth for cross-project formats, metrics, budgets, compatibility rules, shared diagnostics, and their versioning.
- Each contract must define its scope, compatibility window, consumers, frozen examples, and validation requirements.
- Consumer repositories link to canonical contract documents instead of maintaining independent complete copies.
- A contract change requires checking every consumer and passing all cross-repository documentation and conformance checks.
- Every product Markdown document has a unique `ICE3-<AREA>-<TYPE>-<NNN>` ID, explicit title, status, owner, index entry, and valid relative references.

## Delivery

- Use Node.js 24.22.1 LTS from `.nvmrc`.
- Develop on a feature branch and merge to `main` only after the full verification gate passes.
- Keep generated indexes, contract references, and repository links deterministic.
- Do not weaken validation tests to make an invalid document pass.

## Commit identity

- Every Git author and committer name in this repository must be `damoqiongqiu`.
- Verify the configured and recorded names before committing, merging, or pushing.

## Naming and legal boundary

- Do not use competitor, vendor, or third-party product names in documents, links, diagrams, metadata, examples, or commits.
- Do not expose prohibited names indirectly through URLs, screenshots, package names, repository names, class names, or other identifiers.
- Describe comparisons only with neutral approved categories.
- Keep necessary source research outside product repositories and subject it to legal review.

## Customer asset protection

- Real customer model assets remain in a controlled local directory outside every repository.
- Original models and derived assets must not enter documentation, screenshots, examples, diagrams, logs, build output, or Git history.
- Derived assets include converted models, simplified models, previews, thumbnails, extracted textures, and other identifiable content.
- Do not stage, commit, push, or upload customer assets or derivative data to any remote service.
- Public documentation uses synthetic, sanitized, or explicitly redistributable material.
- Before completing asset-related work, inspect Git status, tracked files, ignore rules, and staged content.

## Verification

```bash
npm test
npm run docs:check
npm run docs:check:workspace
```

## Related Documents

- `ICE3-DOC-IDX-001` — [Documentation index](docs/README.md)
- `ICE3-DOC-ARC-001` — [Family architecture](docs/architecture.md)
