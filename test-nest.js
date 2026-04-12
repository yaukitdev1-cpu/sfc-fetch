const { NestFactory } = require('@nestjs/core');
const { Module } = require('@nestjs/common');
const { ConfigModule } = require('@nestjs/config');
const { FastifyAdapter } = require('@nestjs/platform-fastify');

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
class TestModule {}

async function test() {
  console.log('Starting NestFactory.create...');
  const adapter = new FastifyAdapter({ logger: false });
  console.log('Adapter created');
  
  const app = await NestFactory.create(TestModule, adapter, { logger: false });
  console.log('App created');
  
  const port = 3401;
  await app.listen(port, '0.0.0.0');
  console.log(`Listening on ${port}`);
  
  await app.close();
  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});