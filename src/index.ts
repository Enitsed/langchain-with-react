import { routes } from './routes';

const server = Bun.serve({
  routes,
  development: process.env.NODE_ENV !== 'production' && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
