import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs"

// 빌드 산출물(dist) 안의 pdfjs 소스맵(.map ~9MB)을 제거하는 플러그인.
// 정적 viewer 동작에는 .map이 불필요하며 일반 사용자는 내려받지 않음 → 배포 용량만 차지.
// ※ 개발용 원본 public/pdfjs 는 건드리지 않는다 (dist 만 정리).
function stripPdfjsSourcemaps(): Plugin {
  const walk = (dir: string, onMap: (file: string) => void) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full, onMap)
      else if (name.endsWith('.map')) onMap(full)
    }
  }
  return {
    name: 'strip-pdfjs-sourcemaps',
    apply: 'build',
    closeBundle() {
      let removed = 0
      walk(path.resolve(__dirname, 'dist/pdfjs'), (file) => {
        unlinkSync(file)
        removed += 1
      })
      if (removed > 0) console.log(`[strip-pdfjs-sourcemaps] dist/pdfjs .map ${removed}개 제거`)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), stripPdfjsSourcemaps()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: '/',
  // 프로덕션 빌드에서만 디버그 노이즈 제거 (개발 환경 디버깅에는 영향 없음).
  // console.error 는 보존 — ErrorBoundary·데이터 로드 실패 등 실제 에러 로깅 유지.
  // (log/info/debug/warn 만 pure 로 표시해 미니파이 시 제거)
  esbuild:
    command === 'build'
      ? { drop: ['debugger'], pure: ['console.log', 'console.info', 'console.debug', 'console.warn'] }
      : {},
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // firebase(app/firestore/auth)를 별도 vendor 청크로 — 앱 코드가 바뀌어도
          // 이 청크는 캐시가 유지되어 재방문 로딩에 유리.
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/auth'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0'
  }
}))
