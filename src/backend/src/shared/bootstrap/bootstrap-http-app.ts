import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';

const configureCors = (app: Awaited<ReturnType<typeof NestFactory.create>>) => {
  const configuredOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        return callback(null, true);
      }

      if (configuredOrigins.includes(origin) || localhostPattern.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  });
};

export const bootstrapHttpApp = async (
  moduleClass: Parameters<typeof NestFactory.create>[0],
  options: {
    port: number;
    globalPrefix?: string;
    enableCors?: boolean;
  },
) => {
  const app = await NestFactory.create(moduleClass);
  app.use(cookieParser());

  if (options.enableCors) {
    configureCors(app);
  }

  if (options.globalPrefix) {
    app.setGlobalPrefix(options.globalPrefix);
  }

  await app.listen(options.port);
  console.log(`HTTP service running on http://127.0.0.1:${options.port}${options.globalPrefix ? `/${options.globalPrefix}` : ''}`);
};
