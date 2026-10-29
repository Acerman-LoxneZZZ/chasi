import ReactDOM from 'react-dom/client'
import '@fontsource-variable/manrope'
import '@fontsource/cormorant-garamond/latin-400.css'
import '@fontsource/cormorant-garamond/cyrillic-400.css'
import { App } from './app/App'
import './styles/tokens.css'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
