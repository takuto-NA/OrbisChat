/**
 * logger - ログ管理システム
 * 
 * このファイルは、アプリケーション全体のログ出力を管理するシステムです。
 * デバッグモードの制御、ログレベルの分類、パフォーマンスログ、APIリクエストログ、
 * 思考ログなどの特殊なログ出力機能を提供し、開発とデバッグを支援します。
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogContext {
  personaId?: number;
  roomId?: number;
  [key: string]: unknown;
}

class Logger {
  private debugMode: boolean = false;

  setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): string {
    const timestamp = new Date().toISOString();
    const contextStr = context
      ? ` ${JSON.stringify(context)}`
      : '';
    return `[${timestamp}] [${level}] ${message}${contextStr}`;
  }

  private log(level: LogLevel, message: string, context?: LogContext) {
    const formatted = this.formatMessage(level, message, context);

    switch (level) {
      case LogLevel.DEBUG:
        if (this.debugMode) {
          console.debug(formatted);
        }
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: LogContext) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: LogContext) {
    this.log(LogLevel.ERROR, message, context);
  }

  // Performance logging
  logPerformance(
    operation: string,
    duration: number,
    context?: LogContext
  ) {
    this.debug(`Performance: ${operation} took ${duration}ms`, context);
  }

  // API request logging
  logAPIRequest(
    endpoint: string,
    duration: number,
    success: boolean,
    context?: LogContext
  ) {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    this.log(
      level,
      `API Request: ${endpoint} - ${success ? 'Success' : 'Failed'} (${duration}ms)`,
      context
    );
  }

  // Thought log output (always in debug mode)
  logThought(personaId: number, thought: string, roomId?: number) {
    if (this.debugMode) {
      console.group(`🧠 Persona ${personaId} Thought`);
      console.log(thought);
      if (roomId) {
        console.log(`Room: ${roomId}`);
      }
      console.groupEnd();
    }
  }
}

export const logger = new Logger();

