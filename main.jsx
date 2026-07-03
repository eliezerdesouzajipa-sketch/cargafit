import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { supabase } from './supabase.js'
import './style.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

const diasConhecidos = [
  'segunda',
  'terça',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
  'sabado',
  'domingo'
]

function normalizarTexto(texto) {
  return texto
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function textoTemDia(linha) {
  const lower = linha.toLowerCase()
  return diasConhecidos.some((dia) => lower.includes(dia))
}

function extrairDescanso(linha) {
  const match = linha.match(/(\d{2,3})\s*s\b/i)
  return match ? Number(match[1]) : null
}

function extrairSeriesReps(linha) {
  const match = linha.match(/(\d+)\s*x\s*([\wÀ-ÿ\-\/]+(?:\s*[-–]\s*[\wÀ-ÿ]+)?)/i)
  if (!match) return { sets: '', reps: '' }
  return { sets: match[1], reps: match[2].replace(/\s/g, '') }
}

function limparNomeExercicio(linha) {
  return linha
    .replace(/\d+\s*x\s*[\wÀ-ÿ\-\/]+(?:\s*[-–]\s*[\wÀ-ÿ]+)?/i, '')
    .replace(/\d{2,3}\s*s\b/i, '')
    .replace(/Exerc[ií]cio|S[eé]ries|Reps|Descanso/gi, '')
    .replace(/[-–|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function parseWorkoutFromText(rawText) {
  const text = normalizarTexto(rawText)
  const linhas = text
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean)

  const dias = []
  let diaAtual = null

  for (const linhaOriginal of linhas) {
    const linha = linhaOriginal.replace(/_/g, ' ').trim()
    const lower = linha.toLowerCase()

    if (
      textoTemDia(linha) &&
      !lower.includes('descanso') &&
      !lower.includes('exerc') &&
      linha.length <= 70
    ) {
      const partes = linha.split(/[-–]/).map((p) => p.trim()).filter(Boolean)
      const dayName = partes[0] || linha
      const title = partes.slice(1).join(' - ') || linha
      diaAtual = {
        day_name: dayName.toLowerCase(),
        title,
        exercises: []
      }
      dias.push(diaAtual)
      continue
    }

    const pareceExercicio = /\d+\s*x\s*/i.test(linha) || /falha/i.test(linha)

    if (diaAtual && pareceExercicio) {
      const { sets, reps } = extrairSeriesReps(linha)
      const rest_seconds = extrairDescanso(linha)
      const name = limparNomeExercicio(linha)

      if (name && name.length > 2) {
        diaAtual.exercises.push({
          name,
          sets,
          reps: /falha/i.test(linha) && !reps ? 'falha' : reps,
          rest_seconds
        })
      }
    }
  }

  return dias.filter((dia) => dia.exercises.length > 0)
}

async function extractTextFromPdf(file) {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  let fullText = ''

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items.map((item) => item.str).join('\n')
    fullText += `\n${pageText}`
  }

  return normalizarTexto(fullText)
}

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const [workouts, setWorkouts] = useState([])
  const [activeWorkout, setActiveWorkout] = useState(null)
  const [days, setDays] = useState([])
  const [selectedDay, setSelectedDay] = useState(null)
  const [exercises, setExercises] = useState([])
  const [logs, setLogs] = useState([])
  const [form, setForm] = useState({})

  const [pdfText, setPdfText] = useState('')
  const [parsedDays, setParsedDays] = useState([])
  const [workoutName, setWorkoutName] = useState('Minha ficha importada')
  const [manualDay, setManualDay] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [manualExercise, setManualExercise] = useState('')

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser()
      if (data.user) setUser(data.user)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (user) carregarTudo()
  }, [user])

  useEffect(() => {
    if (selectedDay) carregarExercicios(selectedDay.id)
  }, [selectedDay])

  const temTreino = useMemo(() => workouts.length > 0, [workouts])

  async function criarConta() {
    setMessage('Criando conta...')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) return setMessage(error.message)
    setMessage('Conta criada. Agora clique em Entrar. Se pedir, confirme no e-mail.')
  }

  async function entrar() {
    setMessage('Entrando...')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return setMessage(error.message)
    setUser(data.user)
    setMessage('')
  }

  async function sair() {
    await supabase.auth.signOut()
    setUser(null)
    setWorkouts([])
    setActiveWorkout(null)
    setDays([])
    setSelectedDay(null)
    setExercises([])
    setLogs([])
  }

  async function carregarTudo() {
    setMessage('Carregando seus treinos...')

    const { data: workoutData, error: workoutError } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (workoutError) {
      setMessage(workoutError.message)
      return
    }

    setWorkouts(workoutData || [])
    const primeiro = workoutData?.[0] || null
    setActiveWorkout(primeiro)

    if (primeiro) await carregarDias(primeiro.id)
    else {
      setDays([])
      setSelectedDay(null)
      setExercises([])
    }

    await carregarHistorico()
    setMessage('')
  }

  async function carregarDias(workoutId) {
    const { data, error } = await supabase
      .from('workout_days')
      .select('*')
      .eq('workout_id', workoutId)
      .order('sort_order')

    if (error) return setMessage(error.message)
    setDays(data || [])
    setSelectedDay(data?.[0] || null)
  }

  async function carregarExercicios(dayId) {
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .eq('workout_day_id', dayId)
      .order('sort_order')

    if (error) return setMessage(error.message)
    setExercises(data || [])
  }

  async function carregarHistorico() {
    const { data, error } = await supabase
      .from('exercise_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) return setMessage(error.message)
    setLogs(data || [])
  }

  async function importarPdf(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setMessage('Lendo PDF...')
    setParsedDays([])

    try {
      const text = await extractTextFromPdf(file)
      const dias = parseWorkoutFromText(text)
      setPdfText(text)
      setParsedDays(dias)

      await supabase.from('pdf_imports').insert({
        user_id: user.id,
        file_name: file.name,
        raw_text: text,
        status: dias.length ? 'parsed' : 'failed'
      })

      if (!dias.length) {
        setMessage('Não consegui identificar os exercícios automaticamente. Use o cadastro manual abaixo.')
        return
      }

      setWorkoutName(file.name.replace(/\.pdf$/i, ''))
      setMessage(`PDF lido: encontrei ${dias.length} dia(s) de treino. Confira e salve.`)
    } catch (error) {
      setMessage(`Erro ao ler PDF: ${error.message}`)
    }
  }

  function editarDia(index, campo, valor) {
    const copia = [...parsedDays]
    copia[index] = { ...copia[index], [campo]: valor }
    setParsedDays(copia)
  }

  function editarExercicio(dayIndex, exerciseIndex, campo, valor) {
    const copia = [...parsedDays]
    const exercises = [...copia[dayIndex].exercises]
    exercises[exerciseIndex] = { ...exercises[exerciseIndex], [campo]: valor }
    copia[dayIndex] = { ...copia[dayIndex], exercises }
    setParsedDays(copia)
  }

  function removerExercicio(dayIndex, exerciseIndex) {
    const copia = [...parsedDays]
    copia[dayIndex].exercises = copia[dayIndex].exercises.filter((_, i) => i !== exerciseIndex)
    setParsedDays(copia)
  }

  function adicionarDiaManual() {
    if (!manualDay || !manualTitle) return setMessage('Preencha o dia e o título do treino.')
    setParsedDays([
      ...parsedDays,
      { day_name: manualDay, title: manualTitle, exercises: [] }
    ])
    setManualDay('')
    setManualTitle('')
  }

  function adicionarExercicioManual(dayIndex) {
    if (!manualExercise) return setMessage('Digite o nome do exercício.')
    const copia = [...parsedDays]
    copia[dayIndex].exercises.push({
      name: manualExercise,
      sets: '',
      reps: '',
      rest_seconds: null
    })
    setParsedDays(copia)
    setManualExercise('')
  }

  async function salvarFichaImportada() {
    if (!parsedDays.length) return setMessage('Importe um PDF ou crie um treino manual primeiro.')

    setMessage('Salvando ficha no Supabase...')

    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .insert({
        user_id: user.id,
        name: workoutName || 'Ficha importada por PDF',
        description: 'Ficha criada pelo importador de PDF do CargaFit',
        is_active: true
      })
      .select()
      .single()

    if (workoutError) return setMessage(workoutError.message)

    for (let i = 0; i < parsedDays.length; i++) {
      const dia = parsedDays[i]
      const { data: workoutDay, error: dayError } = await supabase
        .from('workout_days')
        .insert({
          workout_id: workout.id,
          day_name: dia.day_name || `dia-${i + 1}`,
          title: dia.title || `Treino ${i + 1}`,
          sort_order: i
        })
        .select()
        .single()

      if (dayError) return setMessage(dayError.message)

      for (let j = 0; j < dia.exercises.length; j++) {
        const ex = dia.exercises[j]
        await supabase.from('exercises').insert({
          workout_day_id: workoutDay.id,
          name: ex.name,
          sets: ex.sets || '',
          reps: ex.reps || '',
          rest_seconds: ex.rest_seconds ? Number(ex.rest_seconds) : null,
          sort_order: j
        })
      }
    }

    setParsedDays([])
    setPdfText('')
    setMessage('Ficha salva com sucesso.')
    await carregarTudo()
  }

  async function salvarCarga(exercise) {
    const peso = form[exercise.id]?.peso
    const reps = form[exercise.id]?.reps
    const setNumber = form[exercise.id]?.serie || 1

    if (!peso || !reps) return setMessage('Preencha peso e repetições.')

    const { data: session, error: sessionError } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: user.id,
        workout_day_id: selectedDay.id
      })
      .select()
      .single()

    if (sessionError) return setMessage(sessionError.message)

    const { error } = await supabase.from('exercise_logs').insert({
      session_id: session.id,
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      set_number: Number(setNumber),
      weight: Number(peso),
      reps: Number(reps)
    })

    if (error) return setMessage(error.message)

    setForm({ ...form, [exercise.id]: { peso: '', reps: '', serie: '' } })
    setMessage(`${exercise.name} salvo.`)
    await carregarHistorico()
  }

  if (loading) {
    return <main className="app"><section className="card"><h1>CargaFit</h1><p>Carregando...</p></section></main>
  }

  if (!user) {
    return (
      <main className="app">
        <section className="card">
          <div className="logo">CF</div>
          <h1>CargaFit</h1>
          <p>Seu diário de cargas na academia.</p>
          <input placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="buttons">
            <button onClick={entrar}>Entrar</button>
            <button className="secondary" onClick={criarConta}>Criar conta</button>
          </div>
          {message && <p className="message">{message}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <section className="card">
        <div className="logo">CF</div>
        <h1>CargaFit</h1>
        <p>Importe sua ficha por PDF, registre cargas e acompanhe seu histórico.</p>
        <button onClick={sair}>Sair</button>

        <hr />

        <h2>Importar treino por PDF</h2>
        <p>Envie uma ficha em PDF. O app tentará separar dias, exercícios, séries, reps e descanso.</p>
        <input type="file" accept="application/pdf" onChange={importarPdf} />
        <input value={workoutName} onChange={(e) => setWorkoutName(e.target.value)} placeholder="Nome da ficha" />

        <h3>Criar treino manual</h3>
        <input value={manualDay} onChange={(e) => setManualDay(e.target.value)} placeholder="Dia: segunda, terça..." />
        <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Título: Peito + Tríceps" />
        <button className="secondary" onClick={adicionarDiaManual}>Adicionar dia</button>

        {parsedDays.length > 0 && (
          <div>
            <h2>Revisar ficha antes de salvar</h2>
            {parsedDays.map((dia, dayIndex) => (
              <div className="exercise" key={`${dia.day_name}-${dayIndex}`}>
                <input value={dia.day_name} onChange={(e) => editarDia(dayIndex, 'day_name', e.target.value)} />
                <input value={dia.title} onChange={(e) => editarDia(dayIndex, 'title', e.target.value)} />
                {dia.exercises.map((ex, exerciseIndex) => (
                  <div className="exercise" key={`${ex.name}-${exerciseIndex}`}>
                    <input value={ex.name} onChange={(e) => editarExercicio(dayIndex, exerciseIndex, 'name', e.target.value)} />
                    <input placeholder="Séries" value={ex.sets || ''} onChange={(e) => editarExercicio(dayIndex, exerciseIndex, 'sets', e.target.value)} />
                    <input placeholder="Reps" value={ex.reps || ''} onChange={(e) => editarExercicio(dayIndex, exerciseIndex, 'reps', e.target.value)} />
                    <input placeholder="Descanso em segundos" value={ex.rest_seconds || ''} onChange={(e) => editarExercicio(dayIndex, exerciseIndex, 'rest_seconds', e.target.value)} />
                    <button className="secondary" onClick={() => removerExercicio(dayIndex, exerciseIndex)}>Remover</button>
                  </div>
                ))}
                <input value={manualExercise} onChange={(e) => setManualExercise(e.target.value)} placeholder="Novo exercício para este dia" />
                <button className="secondary" onClick={() => adicionarExercicioManual(dayIndex)}>Adicionar exercício</button>
              </div>
            ))}
            <button onClick={salvarFichaImportada}>Salvar ficha importada</button>
          </div>
        )}

        <hr />

        <h2>Minhas fichas</h2>
        {temTreino ? (
          <div className="buttons">
            {workouts.map((workout) => (
              <button
                key={workout.id}
                className={activeWorkout?.id === workout.id ? '' : 'secondary'}
                onClick={async () => {
                  setActiveWorkout(workout)
                  await carregarDias(workout.id)
                }}
              >
                {workout.name}
              </button>
            ))}
          </div>
        ) : (
          <p>Nenhuma ficha cadastrada. Importe um PDF ou crie manualmente.</p>
        )}

        {days.length > 0 && (
          <>
            <h2>Dias de treino</h2>
            <div className="buttons">
              {days.map((day) => (
                <button key={day.id} className={selectedDay?.id === day.id ? '' : 'secondary'} onClick={() => setSelectedDay(day)}>
                  {day.day_name}
                </button>
              ))}
            </div>
          </>
        )}

        {selectedDay && <h2>{selectedDay.title}</h2>}

        {exercises.map((exercise) => (
          <div className="exercise" key={exercise.id}>
            <h3>{exercise.name}</h3>
            <p>{exercise.sets ? `${exercise.sets} séries` : ''} {exercise.reps ? `x ${exercise.reps} reps` : ''} {exercise.rest_seconds ? `• ${exercise.rest_seconds}s` : ''}</p>
            <input type="number" placeholder="Série nº" value={form[exercise.id]?.serie || ''} onChange={(e) => setForm({ ...form, [exercise.id]: { ...form[exercise.id], serie: e.target.value } })} />
            <input type="number" placeholder="Peso usado" value={form[exercise.id]?.peso || ''} onChange={(e) => setForm({ ...form, [exercise.id]: { ...form[exercise.id], peso: e.target.value } })} />
            <input type="number" placeholder="Repetições feitas" value={form[exercise.id]?.reps || ''} onChange={(e) => setForm({ ...form, [exercise.id]: { ...form[exercise.id], reps: e.target.value } })} />
            <button onClick={() => salvarCarga(exercise)}>Salvar carga</button>
          </div>
        ))}

        {message && <p className="message">{message}</p>}

        <hr />
        <h2>Histórico recente</h2>
        {logs.length ? logs.map((log) => (
          <div className="exercise" key={log.id}>
            <strong>{log.exercise_name}</strong>
            <p>Série {log.set_number}: {log.weight} kg x {log.reps} reps</p>
          </div>
        )) : <p>Nenhum registro ainda.</p>}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
