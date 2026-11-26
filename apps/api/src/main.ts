import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { buildModule, ErrorFilter } from './app';
import { config } from './config';
import { createPlatform } from './db';

async function main() {
  const { platform } = createPlatform();
  const app = await NestFactory.create(buildModule(platform), { bodyParser: false, logger: ['error', 'warn', 'log'] });
  app.use(json({ limit: '8mb' }));
  app.useGlobalFilters(new ErrorFilter());
  app.enableCors({ origin: config.corsOrigins, allowedHeaders: ['Content-Type', 'Authorization', 'X-Site', 'X-Client-Platform'] });
  (app.getHttpAdapter().getInstance() as any).set('trust proxy', true);
  await app.listen(config.port);
  console.log(`WhatBox API listening on :${config.port}`);
}
main();
