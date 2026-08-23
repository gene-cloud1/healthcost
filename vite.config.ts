import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

// 로컬 dev 서버에서 Vercel 서버리스 함수(api/*.ts)를 그대로 흉내낸다.
// 배포 시에는 Vercel이 api/ 폴더를 직접 실행하므로 이 플러그인은 로컬 확인용으로만 쓰인다.
// api/ 밑에 파일을 추가하면 자동으로 /api/<파일명>으로 라우팅된다.
function localApiPlugin(): Plugin {
  return {
    name: 'local-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const routeName = url.pathname.replace(/^\/?/, '') || 'index'
          const mod = await server.ssrLoadModule(`/api/${routeName}.ts`)
          const query: Record<string, string> = {}
          url.searchParams.forEach((value, key) => {
            query[key] = value
          })
          const vercelRes = {
            status(code: number) {
              res.statusCode = code
              return vercelRes
            },
            json(body: unknown) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(body))
            },
          }
          await mod.default({ query } as never, vercelRes as never)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
})
