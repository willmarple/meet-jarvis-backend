import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, 'server.log');

function formatLogMessage(level: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
  return `${timestamp} [${level}] ${message}${dataStr}\n`;
}

function writeToFile(logMessage: string): void {
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

export const logger = {
  info: (message: string, data?: unknown): void => {
    const logMessage = formatLogMessage('INFO', message, data);
    console.log(logMessage.trim());
    writeToFile(logMessage);
  },
  
  error: (message: string, data?: unknown): void => {
    const logMessage = formatLogMessage('ERROR', message, data);
    console.error(logMessage.trim());
    writeToFile(logMessage);
  },
  
  warn: (message: string, data?: unknown): void => {
    const logMessage = formatLogMessage('WARN', message, data);
    console.warn(logMessage.trim());
    writeToFile(logMessage);
  },
  
  debug: (message: string, data?: unknown): void => {
    const logMessage = formatLogMessage('DEBUG', message, data);
    console.log(logMessage.trim());
    writeToFile(logMessage);
  },

  request: (req: Request, res: Response, next?: NextFunction): void => {
    const start = Date.now();
    const { method, url, headers } = req;
    
    logger.info(`${method} ${url}`, {
      userAgent: headers['user-agent'],
      authorization: headers.authorization ? 'Bearer [REDACTED]' : 'none'
    });

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${method} ${url} - ${res.statusCode}`, {
        duration: `${duration}ms`,
        contentLength: res.get('content-length')
      });
    });

    if (next) next();
  }
};

export default logger;