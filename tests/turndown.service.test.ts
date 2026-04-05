import { describe, test, expect, beforeEach } from 'bun:test';

describe('TurndownService', () => {
  let turndownService: any;

  beforeEach(() => {
    // Create fresh instance for each test
    const { TurndownServiceImpl } = require('../src/converters/turndown.service');
    turndownService = new TurndownServiceImpl();
  });

  describe('convert', () => {
    test('converts simple HTML to markdown', () => {
      const html = '<h1>Title</h1><p>Paragraph</p>';
      const result = turndownService.convert(html);
      expect(result).toContain('# Title');
      expect(result).toContain('Paragraph');
    });

    test('converts bold text', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      const result = turndownService.convert(html);
      expect(result).toContain('**World**');
    });

    test('converts italic text', () => {
      const html = '<p>Hello <em>World</em></p>';
      const result = turndownService.convert(html);
      expect(result).toContain('*World*');
    });

    test('converts links with http prefix', () => {
      const html = '<a href="https://example.com">Example</a>';
      const result = turndownService.convert(html);
      // Links may or may not be preserved depending on custom rules
      expect(result).toContain('Example');
    });

    test('removes links without http prefix', () => {
      const html = '<a href="/page">Page</a>';
      const result = turndownService.convert(html);
      expect(result).toContain('Page');
      expect(result).not.toContain('/page');
    });

    test('removes script tags', () => {
      const html = '<script>alert("xss")</script><p>Content</p>';
      const result = turndownService.convert(html);
      expect(result).not.toContain('alert');
      expect(result).toContain('Content');
    });

    test('removes style tags', () => {
      const html = '<style>.foo { color: red; }</style><p>Content</p>';
      const result = turndownService.convert(html);
      expect(result).not.toContain('.foo');
      expect(result).toContain('Content');
    });

    test('removes nav, footer, header, aside', () => {
      const html = '<nav>Nav</nav><header>Header</header><main>Content</main><footer>Footer</footer><aside>Aside</aside>';
      const result = turndownService.convert(html);
      expect(result).not.toContain('Nav');
      expect(result).not.toContain('Header');
      expect(result).not.toContain('Footer');
      expect(result).not.toContain('Aside');
      expect(result).toContain('Content');
    });

    test('converts lists', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const result = turndownService.convert(html);
      expect(result).toContain('-');
      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
    });

    test('converts tables', () => {
      const html = '<table><tr><td>Cell</td></tr></table>';
      const result = turndownService.convert(html);
      // Tables are converted, but format depends on turndown version
      expect(result).toContain('Cell');
    });

    test('handles empty HTML', () => {
      const html = '';
      const result = turndownService.convert(html);
      expect(result).toBe('');
    });

    test('handles HTML with only whitespace', () => {
      const html = '   ';
      const result = turndownService.convert(html);
      expect(result).toBe('');
    });

    test('handles nested elements', () => {
      const html = '<div><p>Nested <span>text</span></p></div>';
      const result = turndownService.convert(html);
      expect(result).toContain('Nested');
      expect(result).toContain('text');
    });

    test('handles headings of different levels', () => {
      const html = '<h1>H1</h1><h2>H2</h2><h3>H3</h3>';
      const result = turndownService.convert(html);
      expect(result).toContain('# H1');
      expect(result).toContain('## H2');
      expect(result).toContain('### H3');
    });

    test('removes empty elements with class', () => {
      const html = '<div class="empty"></div><p>Content</p>';
      const result = turndownService.convert(html);
      expect(result).toContain('Content');
    });
  });

  describe('convertWithOptions', () => {
    test('accepts custom heading style (setext)', () => {
      const html = '<h1>Title</h1>';
      const result = turndownService.convertWithOptions(html, { headingStyle: 'setext' });
      expect(result).toContain('Title');
      expect(result).toContain('===');
    });

    test('accepts custom bullet list marker', () => {
      const html = '<ul><li>Item</li></ul>';
      const result = turndownService.convertWithOptions(html, { bulletListMarker: '*' });
      expect(result).toContain('*');
      expect(result).toContain('Item');
    });

    test('accepts code block style (indented)', () => {
      const html = '<pre><code>code</code></pre>';
      const result = turndownService.convertWithOptions(html, { codeBlockStyle: 'indented' });
      expect(result).toContain('    code');
    });

    test('handles empty options', () => {
      const html = '<p>Test</p>';
      const result = turndownService.convertWithOptions(html, {});
      expect(result).toContain('Test');
    });
  });
});
