declare module 'fs-extra' {
  import * as fs from 'fs';
  export * from 'fs';
  export function ensureDir(path: string): Promise<void>;
  export function pathExists(path: string): Promise<boolean>;
  export function copy(src: string, dest: string): Promise<void>;
  export function remove(path: string): Promise<void>;
  export function readFile(path: string, encoding?: string): Promise<string | Buffer>;
  export function writeFile(path: string, data: string | Buffer, encoding?: string): Promise<void>;
  export function stat(path: string): Promise<fs.Stats>;
  export function readdir(path: string, opts?: { withFileTypes?: boolean }): Promise<string[] | any[]>;
}

declare module 'fs' {
  export interface Dirent {
    isDirectory(): boolean;
    isFile(): boolean;
    name: string;
  }
}

declare module 'adm-zip' {
  export default class AdmZip {
    constructor(zipPath?: string);
    addLocalFile(localPath: string, zipPath?: string): void;
    addLocalFolder(localPath: string, zipPath?: string): void;
    writeZip(zipPath: string): void;
    getEntries(): any[];
    extractEntryTo(entry: any, destPath: string, keepOrigAttributes?: boolean, overwrite?: boolean): void;
  }
}

declare module 'turndown' {
  interface TurndownOptions {
    headingStyle?: 'atx' | 'setext';
    codeBlockStyle?: 'fenced' | 'indented';
    bulletListMarker?: '-' | '*' | '+';
    emDelimiter?: '*' | '_';
  }
  class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(html: string): string;
    addRule(name: string, rule: any): void;
  }
  export = TurndownService;
}

declare module 'p-throttle' {
  interface ThrottleOptions {
    limit: number;
    interval: number;
  }
  function pThrottle(options: ThrottleOptions): <T extends (...args: any[]) => any>(fn: T) => T & { (...args: any[]): any };
  export = pThrottle;
}

declare module 'better-queue' {
  interface QueueOptions {
    concurrent?: number;
    maxRetries?: number;
    retryDelay?: number;
    retryBackoff?: boolean;
  }
  interface Job {
    id: string;
  }
  type QueueCallback = (error: any, result?: any) => void;
  type QueueProcessor = (job: Job, cb: QueueCallback) => void;
  class Queue {
    constructor(processor: QueueProcessor, options?: QueueOptions);
    push(job: Job, cb?: QueueCallback): void;
    pause(): void;
    resume(): void;
    destroy(): void;
    get length(): number;
    get running(): number;
    on(event: 'task_finish', callback: (taskId: string, result: any) => void): void;
    on(event: 'task_failed', callback: (taskId: string, error: any) => void): void;
  }
  export = Queue;
}

declare module 'uuid' {
  export function v4(): string;
}
