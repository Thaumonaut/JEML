import { defineConfig } from 'vite'
import solidJotl from 'solid-jotl/vite'
import solid from 'vite-plugin-solid'

// Treat .jot as a JSX-emitting file. We register the plugin BEFORE solid()
// so the JOTL source is rewritten to TSX before vite-plugin-solid sees it.
export default defineConfig({
  plugins: [solidJotl(), solid({ extensions: ['.jot'] })],
})
