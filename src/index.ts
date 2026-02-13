import { routes } from './server/routes';

const server = Bun.serve({
  routes,
  development: process.env.NODE_ENV !== 'production' && {
    hmr: true,
    console: true,
  },
  port: 8080,
});

console.log(`Server running at ${server.url}`);
