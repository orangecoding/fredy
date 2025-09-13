import winston from 'winston';

const env = process.env.NODE_ENV || 'development';

const logger = winston.createLogger({
  level: env !== 'development' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`),
  ),
  transports: [new winston.transports.Console()],
});

export default logger;
