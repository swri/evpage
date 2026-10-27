export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
  context?: unknown;
}

function formatLogMessage(entry: LogEntry): string {
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.tag}] ${entry.message}`;
}

export const logger = {
  debug(tag: string, message: string, context?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      tag,
      message,
      context,
    };
    if (process.env.NODE_ENV !== 'production') {
      if (context !== undefined) {
        console.debug(formatLogMessage(entry), context);
      } else {
        console.debug(formatLogMessage(entry));
      }
    }
  },

  info(tag: string, message: string, context?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      tag,
      message,
      context,
    };
    if (context !== undefined) {
      console.info(formatLogMessage(entry), context);
    } else {
      console.info(formatLogMessage(entry));
    }
  },

  warn(tag: string, message: string, context?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      tag,
      message,
      context,
    };
    if (context !== undefined) {
      console.warn(formatLogMessage(entry), context);
    } else {
      console.warn(formatLogMessage(entry));
    }
  },

  error(tag: string, message: string, error?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      tag,
      message,
      context: error,
    };
    if (error !== undefined) {
      console.error(formatLogMessage(entry), error);
    } else {
      console.error(formatLogMessage(entry));
    }
  },
};
