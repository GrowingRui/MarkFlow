import { describe, expect, it } from 'vitest';
import { fence, joinBlocks, mdTable } from '../src/convert/markdown.js';

describe('fence', () => {
  it('wraps text in a fenced code block and drops trailing newlines', () => {
    expect(fence('js', 'let a = 1;\n\n')).toBe('```js\nlet a = 1;\n```');
  });
  it('uses a longer fence than any run of backticks inside', () => {
    expect(fence('', 'a ``` b ```` c')).toBe('`````\na ``` b ```` c\n`````');
  });
});

describe('mdTable', () => {
  it('uses the first row as the header and pads short rows', () => {
    expect(mdTable([['A', 'B'], ['1']])).toBe('| A | B |\n| --- | --- |\n| 1 |  |');
  });
  it('escapes pipes and flattens line breaks inside cells', () => {
    expect(mdTable([['x'], ['a | b\n c']])).toBe('| x |\n| --- |\n| a \\| b c |');
  });
  it('drops blank rows and returns nothing for an empty table', () => {
    expect(mdTable([['', ' '], ['a', null]])).toBe('| a |  |\n| --- | --- |');
    expect(mdTable([[''], []])).toBe('');
  });
});

describe('joinBlocks', () => {
  it('separates blocks with a blank line but keeps list items together', () => {
    expect(joinBlocks(['# T', '- a', '  - b', '1. c', 'para'])).toBe('# T\n\n- a\n  - b\n1. c\n\npara');
  });
});
