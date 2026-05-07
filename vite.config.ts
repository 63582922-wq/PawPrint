import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const devProxy =
    env.DEV_HTTP_PROXY ||
    env.DEV_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    'http://127.0.0.1:33210';

  const devSocksProxy =
    env.DEV_SOCKS_PROXY ||
    env.DEV_SOCKS5_PROXY ||
    env.DEV_PROXY_SOCKS ||
    'socks5://127.0.0.1:33211';
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'dev-proxy',
        configureServer(server) {
          server.middlewares.use('/api/openai', async (req, res, next) => {
            try {
              if (!req.url) return next();
              if (req.method === 'OPTIONS') {
                res.statusCode = 204;
                res.end();
                return;
              }

              const {fetch: undiciFetch, ProxyAgent, Socks5ProxyAgent} = await import('undici');

              const pickDispatcher = (proxyUrl: string) => {
                if (!proxyUrl) return undefined;
                const u = String(proxyUrl);
                if (u.startsWith('socks5://') || u.startsWith('socks://')) {
                  return new Socks5ProxyAgent(u, { allowH2: false } as any);
                }
                if (u.startsWith('http://') || u.startsWith('https://')) {
                  return new ProxyAgent({ uri: u, allowH2: false } as any);
                }
                return new ProxyAgent({ uri: u, allowH2: false } as any);
              };

              const primaryDispatcher = pickDispatcher(devProxy);
              const secondaryDispatcher = devSocksProxy ? pickDispatcher(devSocksProxy) : undefined;
              const upstreamUrl = `https://api.apiyi.com${req.url}`;

              const chunks: Buffer[] = [];
              await new Promise<void>((resolve, reject) => {
                req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
                req.on('end', () => resolve());
                req.on('error', reject);
              });
              const body = chunks.length ? Buffer.concat(chunks) : undefined;

              const headers: Record<string, string> = {};
              for (const [k, v] of Object.entries(req.headers)) {
                if (!v) continue;
                if (k.toLowerCase() === 'host') continue;
                if (k.toLowerCase() === 'content-length') continue;
                if (k.toLowerCase() === 'accept-encoding') continue;
                if (k.toLowerCase() === 'origin') continue;
                headers[k] = Array.isArray(v) ? v.join(',') : String(v);
              }
              const apiyiApiKey =
                env.APIYI_API_KEY ||
                env.OPENAI_API_KEY ||
                process.env.APIYI_API_KEY ||
                process.env.OPENAI_API_KEY ||
                "";
              if (!apiyiApiKey) {
                res.statusCode = 500;
                res.setHeader("content-type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ error: "missing_apiyi_api_key" }));
                return;
              }
              headers["authorization"] = `Bearer ${apiyiApiKey}`;

              const tryDispatchers = [primaryDispatcher, secondaryDispatcher].filter(Boolean) as any[];
              let upstreamRes: any;
              let lastErr: any;
              for (const dispatcher of tryDispatchers.length ? tryDispatchers : [undefined]) {
                try {
                  upstreamRes = await undiciFetch(upstreamUrl, {
                    method: req.method,
                    headers,
                    body,
                    ...(dispatcher ? { dispatcher } : {}),
                  } as any);
                  lastErr = undefined;
                  break;
                } catch (e) {
                  lastErr = e;
                }
              }
              if (!upstreamRes) throw lastErr || new Error("fetch failed");

              res.statusCode = upstreamRes.status;
              upstreamRes.headers.forEach((value: string, key: string) => {
                if (key.toLowerCase() === 'transfer-encoding') return;
                if (key.toLowerCase() === 'content-encoding') return;
                if (key.toLowerCase() === 'content-length') return;
                res.setHeader(key, value);
              });

              const arrayBuffer = await upstreamRes.arrayBuffer();
              res.end(Buffer.from(arrayBuffer));
            } catch (e) {
              res.statusCode = 502;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(
                JSON.stringify({
                  error: "OpenAI proxy fetch failed",
                  message: String((e as any)?.message || e),
                  code: (e as any)?.code,
                  cause: (e as any)?.cause
                    ? {
                        message: String((e as any)?.cause?.message || ""),
                        code: (e as any)?.cause?.code,
                      }
                    : undefined,
                })
              );
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api/dashscope': {
          target: 'https://dashscope.aliyuncs.com',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/api\/dashscope/, ''),
        },
      },
    },
  };
});
