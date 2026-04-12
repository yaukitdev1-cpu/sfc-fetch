const fastify = require('fastify');

async function test() {
  const app = fastify({ logger: false });
  
  app.get('/health', async () => ({ status: 'ok' }));
  
  try {
    await app.listen({ port: 3401, host: '0.0.0.0' });
    console.log('Fastify listening on 3401');
    const resp = await app.inject({ method: 'GET', url: '/health' });
    console.log('Health response:', resp.body);
    await app.close();
    process.exit(0);
  } catch (err) {
    console.error('Fastify failed:', err.message);
    process.exit(1);
  }
}

test();