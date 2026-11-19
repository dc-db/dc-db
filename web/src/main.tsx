import ReactDOM from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/space-grotesk'
import './shadcn.css'
import './styles.css'
import App from './App'

const root = ReactDOM.createRoot(document.getElementById('app')!)

// The wordmark uses Space Grotesk. Rendering before it loads lets the browser
// paint a fallback and swap later, which shifts the centred brand on the login
// page; wait for the face (with a short cap) so the first paint is final.
const fonts = Promise.all([
  document.fonts.load('700 40px "Space Grotesk Variable"'),
  document.fonts.load('400 16px "Geist Variable"'),
]).catch(() => [])

Promise.race([fonts, new Promise(resolve => window.setTimeout(resolve, 1200))])
  .finally(() => root.render(<App />))
