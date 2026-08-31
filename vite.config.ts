import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('firebase')) return 'firebase';
          // lucide-react / framer-motion 을 먼저 걸러낸다.
          // 'react' 검사를 앞에 두면 'lucide-react' 가 경로에 react 를 포함해
          // ui 청크 대신 vendor 로 잘못 들어간다.
          if (id.includes('framer-motion') || id.includes('lucide-react')) return 'ui';
          if (id.includes('react')) return 'vendor';
          return 'vendor';
        }
      }
    }
  }
})
