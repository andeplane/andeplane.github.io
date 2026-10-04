import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export function hasPrivatePearl(root: string): boolean {
  return ['black-pearl.glb', 'black-pearl.json'].every(name => existsSync(resolve(root, '.private', name)));
}
export function usePrivatePearl(mode: string, root: string, publicBuild = process.env.BROADSIDE_PUBLIC_BUILD): boolean {
  return mode !== 'public' && publicBuild !== '1' && hasPrivatePearl(root);
}
/** Paid files live outside public/. Site builds explicitly disable this plugin. */
export function privateAssets(enabled: boolean, root: string): Plugin {
  const files: [string, string][] = [
    ['assets/private/black-pearl.glb', 'model/gltf-binary'],
    ['assets/private/black-pearl.json', 'application/json'],
    ...(existsSync(resolve(root, '.private', 'black-pearl-mobile.glb'))
      ? [['assets/private/black-pearl-mobile.glb', 'model/gltf-binary'] as [string, string]] : []),
  ];
  const filePath = (name: string) => resolve(root, '.private', name.split('/').at(-1)!);
  return {
    name: 'broadside-private-assets',
    configResolved() {
      if (enabled) for (const [name] of files)
        if (!existsSync(filePath(name))) throw new Error(`Import the purchased model first: missing ${filePath(name)}`);
    },
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        const file = files.find(([name]) => pathname === server.config.base + name);
        if (!file) { next(); return; }
        const data = readFileSync(filePath(file[0]));
        res.setHeader('Content-Type', file[1]);
        res.setHeader('Content-Length', data.length);
        res.setHeader('Cache-Control', 'no-store');
        res.end(req.method === 'HEAD' ? undefined : data);
      });
    },
    generateBundle() {
      if (enabled) for (const [name] of files)
        this.emitFile({ type: 'asset', fileName: name, source: readFileSync(filePath(name)) });
    },
  };
}
