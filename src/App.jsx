import { useState } from 'react'
import GraphCanvas from "./components/GraphCanvas"
import './App.css'

function App() {
  

  return (
   <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
    <h1 style={{ margin: "0 0 12px 0"}}>Graph Maker</h1>
    <GraphCanvas />
   </div>
  )
}

export default App
