#!/usr/bin/env node
const { ConfigService } = require('@nestjs/config');
const fastify = require('fastify');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');

async function bootstrap() {
  console.log('Creating Fastify instance...');
  const fastifyInstance = fastify({ logger: false });
  
  console.log('Creating NestJS app with FastifyAdapter...');
  const { FastifyAdapter } = require('@nestjs/platform-fastify');
  const adapter = new FastifyAdapter(fastifyInstance);
  
  console.log('Calling NestFactory.create...');
  const app = await NestFactory.create(AppModule, adapter, { logger: false });
  
  console.log('Getting ConfigService...');
  const configService = app.get(ConfigService);
  console.log('ConfigService loaded');
  
  const port = configService.get('PORT') || 3401;
  console.log(`Attempting to listen on port ${port}...`);
  
  try {
    await app.listen(port, '0.0.0.0');
    console.log(`SUCCESS: Server is listening on port ${port}!`);
  } catch (err) {
    console.error(`FAILED to listen on port ${port}:`, err.message);
  }
  
  await app.close();
  process.exit(0);
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});