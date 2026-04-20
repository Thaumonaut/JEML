import { defineConfig } from 'vite'
import solidJotlang from 'solid-jotlang/vite'
import solid from 'vite-plugin-solid'

// Treat .jot as a JSX-emitting file. We register the plugin BEFORE solid()
// so the JOTLANG source is rewritten to TSX before vite-plugin-solid sees it.
export default defineConfig({
  plugins: [solidJotlang(), solid({ extensions: ['.jot'] })],
})
