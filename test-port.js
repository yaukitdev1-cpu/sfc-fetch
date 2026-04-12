const http = require('http');
const server = http.createServer((req, res) => {
  res.end('OK');
});
server.listen(3401, '0.0.0.0', () => {
  console.log('Server listening on 3401');
  process.exit(0);
});
setTimeout(() => {
  console.log('Timeout - no connection');
  process.exit(1);
}, 5000);