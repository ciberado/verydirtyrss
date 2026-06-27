import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Application-wide logger.
 *
 * - **Production** (`NODE_ENV=production`): JSON output at `info` level.
 * - **Development**: pretty-printed output at `debug` level.
 * - Override with `LOG_LEVEL` env var (e.g. `LOG_LEVEL=warn`).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }),
});
