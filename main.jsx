import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Dumbbell, History, Plus, Upload, User, LogOut, Trophy, Play, Save, Trash2 } from 'lucide-react'
import { supabase, hasSupabase } from './supabase'
import './style.css'

const defaultPlan = [
  { day:'SEGUNDA', title:'Peito + Tríceps', exercises:[['Supino reto barra','5','5-6','120'],['Supino inclinado halteres','4','6-8','90'],['Supino máquina','3','8-10','90'],['Crucifixo inclinado','3','10-12','60'],['Crossover','3','12-15','60'],['Flexão','2','falha',''],['Tríceps testa','4','8-10','75'],['Tríceps corda','3','10-12','60'],['Tríceps francês','3','12-15','60']]},
  { day:'TERÇA', title:'Costas + Bíceps + Panturrilha', exercises:[['Barra fixa','4','falha','90'],['Remada curvada','4','6-8','90'],['Puxador aberto','4','8-10','75'],['Remada baixa','3','10-12','75'],['Pulldown','3','12-15','60'],['Rosca direta','4','8-10','60'],['Rosca inclinada','3','10-12','60'],['Rosca martelo','3','12','60']]},
  { day:'QUARTA', title:'Glúteo pesado', exercises:[['Hip Thrust','5','6-8','120'],['Terra romeno','4','8-10','90'],['Búlgaro','4','10','75'],['Mesa flexora','4','10-12','60'],['Glúteo cabo','4','12-15','60'],['Abdutora','4','20','45'],['Hip Thrust pump','2','20','45']]},
  { day:'QUINTA', title:'Ombro + Peito', exercises:[['Desenvolvimento','5','6-8','90'],['Elevação lateral','4','12','60'],['Elevação lateral unilateral','3','15','45'],['Posterior','4','12-15','60'],['Supino inclinado Smith','4','8-10','90'],['Supino reto halteres','4','10-12','75'],['Peck Deck','4','12-15','60'],['Crossover alto','3','15','45'],['Crossover baixo','3','15','45']]},
  { day:'SEXTA', title:'Pernas + Glúteo', exercises:[['Agachamento','5','6-8','120'],['Leg Press','4','10','90'],['Stiff','4','8-10','90'],['Extensora','4','12','60'],['Flexora unilateral','4','12','60'],['Elevação pélvica','4','12','75'],['Panturrilha em pé','5','15','45'],['Panturrilha sentada','4','20','45']]},
  { day:'DOMINGO', title:'Peito pump + Superior', exercises:[['Supino máquina','4','12','75'],['Crucifixo máquina','4','15','60'],['Crossover','4','15-20','45'],['Flexão','3','falha',''],['Remada unilateral','4','10','75'],['Puxador neutro','3','12','60'],['Rosca direta','3','10','60'],['Tríceps corda','3','12','60'],['Panturrilha','5','15','45']]}
]

function Auth(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[msg,setMsg]=useState('')
 async function sign(mode){
  if(!hasSupabase) return setMsg('Variáveis do Supabase não configuradas na Vercel.')
  const fn=mode==='login'?supabase.auth.signInWithPassword:supabase.auth.signUp
  const {error}=await fn({email,password})
  setMsg(error?error.message:(mode==='login'?'Entrando...':'Cadastro criado. Confirme o e-mail se o Supabase pedir.'))
 }
 return <div className="auth"><div className="card"><div className="logo" style={{margin:'0 auto 12px'}}>CF</div><h1>CargaFit</h1><p className="muted">Seu diário de cargas na academia.</p><input placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)} /><input placeholder="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)} /><div className="row"><button onClick={()=>sign('login')}>Entrar</button><button className="secondary" onClick={()=>sign('signup')}>Criar conta</button></div><p className="tiny">{msg}</p></div></div>
}

function App(){
 const [session,setSession]=useState(null),[tab,setTab]=useState('treino'),[workout,setWorkout]=useState(null),[days,setDays]=useState([]),[exercises,setExercises]=useState([]),[activeDay,setActiveDay]=useState(null),[logs,setLogs]=useState([]),[loading,setLoading]=useState(true)
 useEffect(()=>{ if(!hasSupabase){setLoading(false);return} supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)}); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return ()=>subscription.unsubscribe() },[])
 useEffect(()=>{ if(session) boot() },[session])
 async function boot(){ await ensureDefault(); await loadAll() }
 async function ensureDefault(){
  const {data:existing}=await supabase.from('workouts').select('*').eq('user_id',session.user.id).limit(1)
  if(existing?.length) return
  const {data:w}=await supabase.from('workouts').insert({user_id:session.user.id,name:'Ficha 12 semanas',description:'Foco em peito e glúteo'}).select().single()
  for(let i=0;i<defaultPlan.length;i++){
   const d=defaultPlan[i]; const {data:day}=await supabase.from('workout_days').insert({workout_id:w.id,day_name:d.day,title:d.title,sort_order:i}).select().single()
   for(let j=0;j<d.exercises.length;j++){const ex=d.exercises[j]; await supabase.from('exercises').insert({workout_day_id:day.id,name:ex[0],sets:ex[1],reps:ex[2],rest_seconds:ex[3]?Number(ex[3]):null,sort_order:j})}
  }
 }
 async function loadAll(){
  const {data:w}=await supabase.from('workouts').select('*').eq('user_id',session.user.id).eq('is_active',true).order('created_at',{ascending:true}).limit(1).single(); setWorkout(w)
  const {data:d=[]}=await supabase.from('workout_days').select('*').eq('workout_id',w.id).order('sort_order'); setDays(d); setActiveDay(a=>a||d[0]?.id)
  const ids=d.map(x=>x.id); const {data:e=[]}=await supabase.from('exercises').select('*').in('workout_day_id',ids).order('sort_order'); setExercises(e)
  const {data:l=[]}=await supabase.from('exercise_logs').select('*').order('created_at',{ascending:false}).limit(200); setLogs(l)
 }
 async function saveSet(ex,setNumber,weight,reps){
  let {data:sess}=await supabase.from('workout_sessions').insert({user_id:session.user.id,workout_day_id:activeDay}).select().single()
  await supabase.from('exercise_logs').insert({session_id:sess.id,exercise_id:ex.id,exercise_name:ex.name,set_number:setNumber,weight:weight?Number(weight):null,reps:reps?Number(reps):null})
  await loadAll()
 }
 async function addManualExercise(){ const name=prompt('Nome do exercício'); if(!name)return; await supabase.from('exercises').insert({workout_day_id:activeDay,name,sets:'3',reps:'10-12',rest_seconds:60,sort_order:99}); await loadAll() }
 async function addDay(){ const title=prompt('Nome do treino. Ex: Peito + Tríceps'); if(!title)return; await supabase.from('workout_days').insert({workout_id:workout.id,day_name:'NOVO',title,sort_order:days.length}); await loadAll() }
 async function importPdf(e){ const file=e.target.files?.[0]; if(!file)return; await supabase.from('pdf_imports').insert({user_id:session.user.id,file_name:file.name,status:'uploaded',raw_text:'PDF recebido. A leitura automática será ativada na próxima versão.'}); alert('PDF recebido. Próxima versão fará a leitura automática.') }
 if(loading) return <div className="auth"><div className="card">Carregando...</div></div>
 if(!session) return <Auth />
 const current=days.find(d=>d.id===activeDay), currentExercises=exercises.filter(e=>e.workout_day_id===activeDay)
 const records=Object.values(logs.reduce((acc,l)=>{ if(!acc[l.exercise_name]||Number(l.weight)>Number(acc[l.exercise_name].weight||0))acc[l.exercise_name]=l; return acc },{})).sort((a,b)=>(b.weight||0)-(a.weight||0)).slice(0,10)
 return <div className="app"><div className="top"><div className="brand"><div className="logo">CF</div><div><h2>CargaFit</h2><p className="muted">{session.user.email}</p></div></div><button className="secondary" onClick={()=>supabase.auth.signOut()}><LogOut size={16}/> Sair</button></div>
 {tab==='treino'&&<><div className="card"><h2>{workout?.name}</h2><p className="muted">Escolha o treino e registre suas cargas por série.</p><div className="tabs">{days.map(d=><button key={d.id} className={'pill '+(d.id===activeDay?'active':'')} onClick={()=>setActiveDay(d.id)}>{d.day_name} · {d.title}</button>)}<button className="pill" onClick={addDay}><Plus size={14}/> Dia</button></div></div><div className="card"><h2>{current?.title}</h2>{currentExercises.map(ex=><Exercise key={ex.id} ex={ex} logs={logs} onSave={saveSet}/>) }<button onClick={addManualExercise}><Plus size={16}/> Adicionar exercício</button></div></>}
 {tab==='historico'&&<div className="card"><h2>Histórico</h2><div className="list">{logs.map(l=><div className="exercise" key={l.id}><div><b>{l.exercise_name}</b><p className="tiny">Série {l.set_number} · {new Date(l.created_at).toLocaleDateString('pt-BR')}</p></div><span className="badge">{l.weight||'-'} kg · {l.reps||'-'} reps</span></div>)}</div></div>}
 {tab==='recordes'&&<div className="card"><h2>Recordes</h2>{records.map(r=><div className="exercise" key={r.id}><b>{r.exercise_name}</b><span className="badge">{r.weight} kg</span></div>)}</div>}
 {tab==='pdf'&&<div className="card"><h2>Importar PDF</h2><p className="muted">Envie a ficha. Esta versão salva o PDF/importação no banco; a leitura automática entra na próxima etapa.</p><input type="file" accept="application/pdf" onChange={importPdf}/></div>}
 <div className="bottom"><button className={tab==='treino'?'active':''} onClick={()=>setTab('treino')}><Dumbbell size={17}/> Treino</button><button className={tab==='historico'?'active':''} onClick={()=>setTab('historico')}><History size={17}/> Histórico</button><button className={tab==='recordes'?'active':''} onClick={()=>setTab('recordes')}><Trophy size={17}/> PR</button><button className={tab==='pdf'?'active':''} onClick={()=>setTab('pdf')}><Upload size={17}/> PDF</button></div></div>
}
function Exercise({ex,logs,onSave}){ const [open,setOpen]=useState(false); const sets=Number(ex.sets)||3; const last=logs.find(l=>l.exercise_name===ex.name); return <div><div className="exercise" onClick={()=>setOpen(!open)}><div><b>{ex.name}</b><p className="tiny">{ex.sets} séries · {ex.reps} reps · {ex.rest_seconds||'-'}s</p></div><span className="badge">Último: {last?.weight?`${last.weight}kg`:'-'}</span></div>{open&&<div className="card">{Array.from({length:sets}).map((_,i)=><SetRow key={i} ex={ex} n={i+1} onSave={onSave}/>)}</div>}</div> }
function SetRow({ex,n,onSave}){ const [w,setW]=useState(''),[r,setR]=useState(''); return <div className="row"><span className="badge">Série {n}</span><input inputMode="decimal" placeholder="kg" value={w} onChange={e=>setW(e.target.value)}/><input inputMode="numeric" placeholder="reps" value={r} onChange={e=>setR(e.target.value)}/><button onClick={()=>onSave(ex,n,w,r)}><Save size={15}/></button></div> }

createRoot(document.getElementById('root')).render(<App />)
