import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Editor } from './pages/Editor'
import { Viewer } from './pages/Viewer'

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '')

export default function App() {
  return (
    <BrowserRouter basename={routerBasename || undefined}>
      <Routes>
        <Route path="/" element={<Viewer />} />
        <Route path="/v" element={<Viewer />} />
        <Route path="/edit" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  )
}
