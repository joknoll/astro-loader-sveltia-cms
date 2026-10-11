# Code style

## Tools

This repository uses the Oxfmt formatter bundled with Vite+ (`vp fmt`). Its
configuration lives in `vite.config.ts`; `.editorconfig` supplies editor defaults.
Do not hand-adjust formatter output. Change the configuration or simplify the code.

```sh
vp run format
vp run format:check
```

Oxlint enforces braces on every control-flow body and prohibits nested ternaries.
These rules are included in the existing `vp check` workflow. Formatting alone does
not add braces or perform refactoring.

The repository profile is four spaces, width 88, LF, a final newline, double quotes,
semicolons, and trailing commas in multiline lists. Short objects collapse instead
of preserving their original wrapping. Comments and Markdown prose are not reflowed.
Markdown hard line breaks are exempt from editor trailing-whitespace removal.

Imports are sorted case-sensitively in fixed groups: Node built-ins, external
packages, internal/subpath imports, relative imports, then unmatched imports.
Side-effect imports retain their order because reordering them can change behavior.
Use explicit imports; unused imports are covered by the existing lint/type checks.

The generated lockfile and example CMS content are excluded from formatting. This
avoids rewriting package-manager output or editorial content as a code-style change.

## Formatter limitations

Accept these limitations rather than maintaining hand-formatted exceptions:

- Oxfmt does not implement the exact outermost-first wrapping algorithm, all-or-none
  chain breaking, or universally operator-leading continuation lines.
- Width is a target, not a hard limit. Calls, conditional headers, import specifiers,
  and other bracket groups follow Oxfmt's layout, not a universal one-item-per-line
  rule. Import specifier ordering also follows the formatter's implementation.
- Blank lines and some layouts remain input-sensitive. This is not a fully
  syntax-tree-only canonical printer, though its output should be idempotent.
- HTML uses whitespace-sensitive formatting. Short links, long attribute lists,
  preformatted text, and inline text boundaries were checked with `vp fmt` on stdin.
  Long tags may use compact boundaries or split a closing tag to preserve whitespace,
  rather than the preferred markup layout. Never change rendered text to force layout.
- The installed formatter does not support `.astro` files. Existing Astro markup is
  left unchanged; editor defaults apply to new code. Formatting those files requires
  a separate Astro-aware formatter, which this repository does not currently install.
- Automatic closure extraction, purpose-based blank lines, member ordering, comment
  tagging, and function length are manual review rules, not formatter features.

## Manual rules

Use guard clauses and flat control flow. Name intermediate values, use simple
ternaries only, and extract long callbacks or functions at meaningful boundaries.
Keep one declaration and statement per line. Separate groups with one blank line
when their purpose changes, not after every statement.

Use domain names and typed values. Keep nested types near their only user. Prefer
explicit imports over wildcards. Comments explain why, not what; keep them concise
and within 88 columns without splitting string literals. Use scoped tags for facts
that must not be missed, such as `NOTE(protocol):`, `HACK(images):`, `SECURITY:`, or
`TODO:` with an owner or ticket. Code, identifiers, and comments are in English.

These manual rules guide edits and refactoring; the formatting command is not a
whole-repository structural rewrite.
