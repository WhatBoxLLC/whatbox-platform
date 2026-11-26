import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { buildModule, ErrorFilter } from './app';
import { config } from './config';
import { createPlatform } from './db';
import { LocalPhotoStore } from './photos';

async function main() {
  const { platform, photos } = createPlatform();
  const app = await NestFactory.create(buildModule(platform), { bodyParser: false, logger: ['error', 'warn', 'log'] });
  app.use(json({ limit: config.photoStore === 'inline' ? '8mb' : '256kb' }));
  app.useGlobalFilters(new ErrorFilter());
  app.enableCors({ origin: config.corsOrigins, allowedHeaders: ['Content-Type', 'Authorization', 'X-Site', 'X-Client-Platform'] });
  const http = app.getHttpAdapter().getInstance() as import('express').Express;
  http.set('trust proxy', true);
  http.disable('x-powered-by');
  if (photos instanceof LocalPhotoStore) {
    // Dev only: serves signed photo URLs from disk. In Azure, browsers fetch from Blob storage directly.
    http.get('/files/:slug/:member/:photo', async (req, res) => {
      const { slug, member, photo } = req.params;
      const buf = await photos.read(slug, `${member}/${photo}`, Number(req.query.e), String(req.query.s ?? ''));
      if (!buf) { res.status(404).end(); return; }
      res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' }).send(buf);
    });
  }
  await app.listen(config.port);
  console.log(`WhatBox API listening on :${config.port}`);
}
main();
