export class Logger {
  constructor(private prefix: string) {}

  log(...args: any[]) {
    console.log(`[${new Date().toISOString()}] [${this.prefix}]`, ...args);
  }

  error(...args: any[]) {
    console.error(`[${new Date().toISOString()}] [${this.prefix}] ERROR:`, ...args);
  }

  success(...args: any[]) {
    console.log(`[${new Date().toISOString()}] [${this.prefix}] ✅`, ...args);
  }

  warn(...args: any[]) {
    console.warn(`[${new Date().toISOString()}] [${this.prefix}] ⚠️`, ...args);
  }
}