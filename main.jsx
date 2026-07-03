import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './style.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const defaultDays = [
  { day_name: 'Segunda', title: 'Peito + Tríceps', exercises: [['Supino reto barra','5','5-6',120],['Supino inclinado halteres','4','6-8',90],['Supino máquina','3','8-10',90],['Crossover','3','12-15',60],['Tríceps corda','3','10-12',60]] },
  { day_name: 'Terça', title: 'Costas + Bíceps + Panturrilha', exercises: [['Barra fixa','4','falha',90],['Remada curvada','4','6-8',90],['Puxador aberto','4','8-10',75],['Rosca direta','4','8-10',60],['Panturrilha em pé','5','12-15',45]] },
  { day_name: 'Quarta', title: 'Glúteo pesado', exercises: [['Hip Thrust','5','6-8',120],['Terra romeno','4','8-10',90],['Búlgaro','4','10',75],['Mesa flexora','4','10-12',60],['Abdutora','4','20',45]] },
  { day_name: 'Quinta', title: 'Ombro + Peito', exercises: [['Desenvolvimento','5','6-8',90],['Elevação lateral','4','12',60],['Posterior','4','12-15',60],['Supino inclinado Smith','4','8-10',90],['Peck Deck','4','12-15',60]] },
  { day_name: 'Sexta', title: 'Pernas + Glúteo', exercises: [['Agachamento','5','6-8',120],['Leg Press','4','10',90],['Stiff','4','8-10',90],['Extensora','4','12',60],['Elevação pélvica','4','12',75]] },
  { day_name: 'Domingo', title: 'Peito Pump + Superior', exercises: [['Supino máquina','4','12',75],['Crucifixo máquina','4','15',60],['Crossover','4','15-20',45],['Remada unilateral','4','10',75],['Tríceps corda','3','12',60]] }
];

function App(){
  const [session,setSession]=useState(null);
  const [loading,setLoading]=useState(true);
  const [screen,setScreen]=useState('home');
  const [workouts,setWorkouts]=useState([]);
  const [selected,setSelected]=useState(null);
  const [days,setDays]=useState([]);
  const [exercises,setExercises]=useState([]);
  const [logs,setLogs]=useState({});
  const [msg,setMsg]=useState('');

  useEffect(()=>{
    if(!supabase){ setLoading(false); return; }
    supabase.auth.getSession().then(({data})=>{ setSession(data.session); setLoading(false); });
    const { data:{subscription} }=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{ if(session) loadWorkouts(); },[session]);

  async function signIn(email){
    setMsg('Enviando link de acesso...');
    const {error}= await supabase.auth.signInWithOtp({email, options:{ emailRedirectTo: window.location.origin }});
    setMsg(error? error.message : 'Link enviado. Abra seu e-mail para entrar.');
  }
  async function loadWorkouts(){
    const {data,error}= await supabase.from('workouts').select('*').order('created_at',{ascending:false});
    if(error){ setMsg(error.message); return; }
    setWorkouts(data||[]);
  }
  async function createDefaultWorkout(){
    setMsg('Criando sua ficha inicial...');
    const {data:w,error}=await supabase.from('workouts').insert({name:'Ficha 12 semanas',description:'Foco em peito e glúteo',user_id:session.user.id}).select().single();
    if(error){ setMsg(error.message); return; }
    for(let i=0;i<defaultDays.length;i++){
      const d=defaultDays[i];
      const {data:day}=await supabase.from('workout_days').insert({workout_id:w.id,day_name:d.day_name,title:d.title,sort_order:i}).select().single();
      const rows=d.exercises.map((e,idx)=>({workout_day_id:day.id,name:e[0],sets:e[1],reps:e[2],rest_seconds:e[3],sort_order:idx}));
      await supabase.from('exercises').insert(rows);
    }
    setMsg('Ficha criada.'); loadWorkouts();
  }
  async function openWorkout(w){
    setSelected(w); setScreen('workout');
    const {data:d}=await supabase.from('workout_days').select('*').eq('workout_id',w.id).order('sort_order');
    setDays(d||[]); setExercises([]);
  }
  async function openDay(day){
    setScreen('day'); setSelected({...selected, day});
    const {data:e}=await supabase.from('exercises').select('*').eq('workout_day_id',day.id).order('sort_order');
    setExercises(e||[]);
    setLogs({});
  }
  function updateLog(exId,setNum,field,value){
    setLogs(prev=>({ ...prev, [`${exId}-${setNum}`]: { ...(prev[`${exId}-${setNum}`]||{}), [field]: value }}));
  }
  async function saveSession(){
    const {data:s,error}=await supabase.from('workout_sessions').insert({user_id:session.user.id, workout_day_id:selected.day.id}).select().single();
    if(error){ setMsg(error.message); return; }
    const rows=[];
    exercises.forEach(ex=>{
      const n=parseInt(ex.sets)||1;
      for(let i=1;i<=n;i++){
        const l=logs[`${ex.id}-${i}`]||{};
        if(l.weight || l.reps) rows.push({session_id:s.id,exercise_id:ex.id,exercise_name:ex.name,set_number:i,weight:l.weight||null,reps:l.reps||null});
      }
    });
    if(rows.length) await supabase.from('exercise_logs').insert(rows);
    setMsg('Treino salvo na nuvem.'); setLogs({});
  }
  async function addExercise(name){
    if(!name) return;
    await supabase.from('exercises').insert({workout_day_id:selected.day.id,name,sets:'3',reps:'10-12',rest_seconds:60,sort_order:exercises.length});
    openDay(selected.day);
  }
  async function importPdfPlaceholder(file){
    if(!file) return;
    await supabase.from('pdf_imports').insert({user_id:session.user.id,file_name:file.name,status:'pending',raw_text:'Arquivo recebido. Leitura automática será ativada na próxima versão.'});
    setMsg('PDF registrado. Na próxima versão vamos converter automaticamente em treino editável.');
  }

  if(loading) return <div className="center">Carregando...</div>;
  if(!supabase) return <div className="center card"><h1>CargaFit</h1><p>Variáveis do Supabase não configuradas.</p></div>;
  if(!session) return <Login onLogin={signIn} msg={msg}/>;
  return <main>
    <header><div><b>CargaFit</b><small>{session.user.email}</small></div><button onClick={()=>supabase.auth.signOut()}>Sair</button></header>
    {msg && <p className="toast">{msg}</p>}
    {screen==='home' && <section><h1>Meus treinos</h1><button className="primary" onClick={createDefaultWorkout}>+ Criar ficha inicial do Eliezer</button><label className="upload">📄 Importar PDF<input type="file" accept="application/pdf" onChange={e=>importPdfPlaceholder(e.target.files[0])}/></label><div className="grid">{workouts.map(w=><button className="card" onClick={()=>openWorkout(w)} key={w.id}><h2>{w.name}</h2><p>{w.description||'Treino personalizado'}</p></button>)}</div></section>}
    {screen==='workout' && <section><button onClick={()=>setScreen('home')}>← Voltar</button><h1>{selected.name}</h1><div className="grid">{days.map(d=><button className="card" key={d.id} onClick={()=>openDay(d)}><h2>{d.day_name}</h2><p>{d.title}</p></button>)}</div></section>}
    {screen==='day' && <section><button onClick={()=>setScreen('workout')}>← Dias</button><h1>{selected.day.title}</h1>{exercises.map(ex=><Exercise key={ex.id} ex={ex} logs={logs} updateLog={updateLog}/>) }<AddExercise onAdd={addExercise}/><button className="primary sticky" onClick={saveSession}>Salvar treino</button></section>}
  </main>
}
function Login({onLogin,msg}){ const [email,setEmail]=useState(''); return <div className="center"><div className="login"><h1>CargaFit</h1><p>Seu diário de cargas na nuvem.</p><input placeholder="seu e-mail" value={email} onChange={e=>setEmail(e.target.value)}/><button onClick={()=>onLogin(email)}>Entrar / Criar conta</button>{msg&&<small>{msg}</small>}</div></div> }
function Exercise({ex,logs,updateLog}){ const n=parseInt(ex.sets)||1; return <div className="card exercise"><h2>{ex.name}</h2><p>{ex.sets} séries • {ex.reps} reps • descanso {ex.rest_seconds}s</p>{Array.from({length:n},(_,i)=>i+1).map(num=><div className="set" key={num}><span>Série {num}</span><input type="number" placeholder="kg" value={logs[`${ex.id}-${num}`]?.weight||''} onChange={e=>updateLog(ex.id,num,'weight',e.target.value)}/><input type="number" placeholder="reps" value={logs[`${ex.id}-${num}`]?.reps||''} onChange={e=>updateLog(ex.id,num,'reps',e.target.value)}/></div>)}</div> }
function AddExercise({onAdd}){ const [name,setName]=useState(''); return <div className="card"><h2>Adicionar exercício</h2><input placeholder="Nome do exercício" value={name} onChange={e=>setName(e.target.value)}/><button onClick={()=>{onAdd(name);setName('')}}>Adicionar</button></div> }
createRoot(document.getElementById('root')).render(<App/>);
