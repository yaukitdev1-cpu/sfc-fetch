import { Injectable } from '@nestjs/common';
import TurndownService from 'turndown';
import * as cheerio from 'cheerio';

@Injectable()
export class TurndownServiceImpl {
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
    });

    // Custom rules for SFC HTML
    this.turndownService.addRule('sfcTables', {
      filter: 'table',
      replacement: (content: string) => {
        return '\n\n' + content + '\n\n';
      },
    });

    this.turndownService.addRule('sfcLinks', {
      filter: 'a',
      replacement: (content: string, node: any) => {
        const href = node?.attribs?.href || '';
        if (href.startsWith('http')) {
          return `[${content}](${href})`;
        }
        return content;
      },
    });
  }

  convert(html: string): string {
    // Pre-process SFC-specific HTML
    const $ = cheerio.load(html);

    // Remove common SFC wrapper elements
    $('script, style, nav, footer, header, aside').remove();

    // Clean up SFC-specific classes
    $('[class]').each((_, el) => {
      const $el = $(el);
      if ($el.children().length === 0 && $el.text().trim() === '') {
        $el.remove();
      }
    });

    const cleanedHtml = $.html();
    return this.turndownService.turndown(cleanedHtml);
  }

  convertWithOptions(html: string, options: {
    headingStyle?: 'atx' | 'setext';
    codeBlockStyle?: 'fenced' | 'indented';
    bulletListMarker?: '-' | '*' | '+';
  }): string {
    const customService = new TurndownService(options);
    return customService.turndown(html);
  }
}
