import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './supabase.js'
import './style.css'

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState(null)
  const [message, setMessage] = useState('')

  async function criarConta() {
    setMessage('Criando conta...')

    const { data, error } = await supabase.auth.signUp({
      email,
      password
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Conta criada! Verifique seu e-mail e depois clique em Entrar.')
  }

  async function entrar() {
    setMessage('Entrando...')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setUser(data.user)
    setMessage('')
  }

  async function sair() {
    await supabase.auth.signOut()
    setUser(null)
  }

  if (user) {
    return (
      <main className="app">
        <section className="card">
          <div className="logo">CF</div>
          <h1>Bem-vindo ao CargaFit</h1>
          <p>Login realizado com sucesso.</p>

          <button onClick={sair}>Sair</button>

          <hr />

          <h2>Próxima etapa</h2>
          <p>Aqui vamos colocar seus treinos, cargas e histórico.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <section className="card">
        <div className="logo">CF</div>
        <h1>CargaFit</h1>
        <p>Seu diário de cargas na academia.</p>

        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <div className="buttons">
          <button onClick={entrar}>Entrar</button>
          <button className="secondary" onClick={criarConta}>
            Criar conta
          </button>
        </div>

        {message && <p className="message">{message}</p>}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
