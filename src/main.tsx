import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Bell, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, Circle,
  Clock3, FileText, Flame, FolderOpen, History, Home, LibraryBig, ListOrdered, LoaderCircle, LockKeyhole, LogOut,
  Menu, Mic, MicOff, MoreHorizontal, Plus, RefreshCcw, Send, Shuffle, Sparkles, Trash2, UploadCloud, X, XCircle,
} from 'lucide-react';
import { api, ApiClientError } from './services/api';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import type { Evaluation, ExamHistoryItem, ExamSummary, PublicExam, QuestionOrder, QuestionProgressItem, QuestionSourceContext, StudyMaterial, Subject } from './types/domain';
import { buildSubjectRhythm, WEEKDAY_NAMES, type SubjectRhythm } from './utils/courseSchedule';
import './styles.css';

type View = 'home' | 'materials' | 'history' | 'session';
const MAX_UPLOAD = 4 * 1024 * 1024;

const textUploadFileName = (requestedName: string, className: string) => {
  const base = (requestedName.trim() || className.trim() || 'apunte').replace(/\.txt$/iu, '');
  const safe = base.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 80);
  return `${safe || 'apunte'}.txt`;
};

function App() {
  const [auth, setAuth] = useState<'checking' | 'in' | 'out'>('checking');
  const [view, setView] = useState<View>('home');
  const [mobileNav, setMobileNav] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [history, setHistory] = useState<ExamHistoryItem[]>([]);
  const [materialsSubjectId, setMaterialsSubjectId] = useState('');
  const [exam, setExam] = useState<PublicExam | null>(null);
  const [summary, setSummary] = useState<ExamSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [subjectData, materialData, historyData] = await Promise.all([api.subjects(), api.materials(), api.history()]);
      setSubjects(subjectData.subjects);
      setMaterials(materialData.materials);
      setHistory(historyData.history);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'UNAUTHORIZED') setAuth('out');
      else setError(err instanceof Error ? err.message : 'No pudimos cargar tus datos.');
    } finally { setLoadingData(false); }
  }, []);

  useEffect(() => {
    api.session().then(() => { setAuth('in'); return loadData(); }).catch(() => setAuth('out'));
  }, [loadData]);

  const go = (next: View) => { setView(next); setMobileNav(false); setError(null); };
  const openMaterials = (subjectId?: string) => {
    if (subjectId) setMaterialsSubjectId(subjectId);
    go('materials');
  };
  const logout = async () => { await api.logout().catch(() => undefined); setAuth('out'); setExam(null); };

  if (auth === 'checking') return <Splash />;
  if (auth === 'out') return <Login onSuccess={() => { setAuth('in'); loadData(); }} />;

  return (
    <div className="app-shell">
      <Sidebar view={view} go={go} subjects={subjects} selectedSubjectId={materialsSubjectId} openMaterials={openMaterials} open={mobileNav} logout={logout} />
      {mobileNav && <button className="scrim" aria-label="Cerrar menú" onClick={() => setMobileNav(false)} />}
      <main className="main-area">
        <Topbar openMenu={() => setMobileNav(true)} />
        {error && <Toast message={error} close={() => setError(null)} />}
        {view === 'home' && <HomePage subjects={subjects} materials={materials} history={history} loading={loadingData} onStart={(nextExam) => { setExam(nextExam); setSummary(null); go('session'); }} goMaterials={openMaterials} onError={setError} />}
        {view === 'materials' && <MaterialsPage subjects={subjects} materials={materials} selected={materialsSubjectId} setSelected={setMaterialsSubjectId} reload={loadData} onError={setError} />}
        {view === 'history' && <HistoryPage history={history} openExam={async (id) => { try { const data = await api.exam(id); setExam(data.exam); setSummary(data.summary); go('session'); } catch (err) { setError(err instanceof Error ? err.message : 'No pudimos abrir el examen.'); } }} />}
        {view === 'session' && exam && <ExamPage exam={exam} setExam={setExam} summary={summary} setSummary={setSummary} exit={() => { loadData(); go('home'); }} onError={setError} />}
        {view === 'session' && !exam && <EmptyState title="No hay un repaso abierto" copy="Configurá el repaso de hoy desde el inicio." action="Volver a hoy" onAction={() => go('home')} />}
      </main>
    </div>
  );
}

function Splash() { return <div className="splash"><span className="brand-mark">M</span><span>margen</span></div>; }

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try { await api.login(password); onSuccess(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No pudimos iniciar sesión.'); }
    finally { setLoading(false); }
  };
  return <main className="login-page">
    <div className="login-brand"><span className="brand-mark">M</span><span>margen</span></div>
    <section className="login-sheet page-enter">
      <span className="login-icon"><LockKeyhole size={19} /></span>
      <p className="eyebrow">ACCESO PERSONAL</p>
      <h1>Volvé a tus apuntes.</h1>
      <p>Tu biblioteca, evaluaciones y devoluciones están protegidas.</p>
      <form onSubmit={submit}>
        <label htmlFor="password">Contraseña</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus placeholder="Ingresá tu contraseña" />
        {error && <div className="inline-error"><AlertCircle size={14} />{error}</div>}
        <button className="primary-button" disabled={!password || loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <>Entrar <ArrowRight size={17} /></>}</button>
      </form>
    </section>
    <div className="login-foot">Estudio y repaso con IA · Acceso privado</div>
  </main>;
}

function Sidebar({ view, go, subjects, selectedSubjectId, openMaterials, open, logout }: { view: View; go: (view: View) => void; subjects: Subject[]; selectedSubjectId: string; openMaterials: (subjectId?: string) => void; open: boolean; logout: () => void }) {
  return <aside className={`sidebar ${open ? 'sidebar--open' : ''}`}>
    <button className="brand brand-button" onClick={() => go('home')}><span className="brand-mark">M</span><span>margen</span></button>
    <nav className="primary-nav">
      <button className={`nav-item ${view === 'home' ? 'active' : ''}`} onClick={() => go('home')}><Home size={18} /> Hoy</button>
      <button className={`nav-item ${view === 'materials' ? 'active' : ''}`} onClick={() => openMaterials()}><LibraryBig size={18} /> Materias y apuntes</button>
      <button className={`nav-item ${view === 'history' ? 'active' : ''}`} onClick={() => go('history')}><History size={18} /> Historial</button>
    </nav>
    <div className="sidebar-section"><div className="sidebar-label">MIS MATERIAS</div>
      {subjects.slice(0, 5).map((subject, index) => <button className={`subject-nav ${view === 'materials' && selectedSubjectId === subject.id ? 'active' : ''}`} aria-current={view === 'materials' && selectedSubjectId === subject.id ? 'page' : undefined} key={subject.id} onClick={() => openMaterials(subject.id)}><span className="subject-dot" style={{ background: ['#c85d46','#647660','#706b91','#a38154'][index % 4] }} /><span>{subject.name}</span></button>)}
      {!subjects.length && <p className="sidebar-empty">Todavía no creaste materias.</p>}
    </div>
    <div className="sidebar-bottom">
      <div className="streak-mini"><Flame size={18} /><div><strong>Tu espacio de estudio</strong><span>Repasos basados en tus apuntes</span></div></div>
      <button className="profile-row" onClick={logout}><span className="avatar">PT</span><span className="profile-copy"><strong>Pablo</strong><small>Cerrar sesión</small></span><LogOut size={16} /></button>
    </div>
  </aside>;
}

function Topbar({ openMenu }: { openMenu: () => void }) {
  const date = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()).toUpperCase();
  return <header className="topbar"><button className="mobile-menu" aria-label="Abrir menú" onClick={openMenu}><Menu size={20} /></button><div className="topbar-date"><span>{date.split(' ')[0]}</span> {date.split(' ').slice(1).join(' ')}</div><div className="topbar-actions"><div className="telegram-status"><Send size={14} /> Recordatorio diario activo</div><button className="icon-button" aria-label="Notificaciones"><Bell size={18} /><span className="notification-dot" /></button></div></header>;
}

type DailyPracticeStatus = 'pending' | 'active' | 'completed';

const argentinaDay = (date: string | Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
}).format(typeof date === 'string' ? new Date(date) : date);

const dailyPracticeBySubject = (history: ExamHistoryItem[], date = new Date()) => {
  const day = argentinaDay(date);
  const statuses = new Map<string, DailyPracticeStatus>();
  history.forEach((item) => {
    const completedToday = item.status === 'completed' && argentinaDay(item.completedAt || item.createdAt) === day;
    if (completedToday) {
      statuses.set(item.subjectId, 'completed');
      return;
    }
    const activeToday = item.status === 'active' && argentinaDay(item.createdAt) === day;
    if (activeToday && statuses.get(item.subjectId) !== 'completed') statuses.set(item.subjectId, 'active');
  });
  return statuses;
};

function HomePage({ subjects, materials, history, loading, onStart, goMaterials, onError }: { subjects: Subject[]; materials: StudyMaterial[]; history: ExamHistoryItem[]; loading: boolean; onStart: (exam: PublicExam) => void; goMaterials: (subjectId?: string) => void; onError: (message: string) => void }) {
  const [selectedSubject, setSelectedSubject] = useState(subjects[0]?.id || '');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [regenerate, setRegenerate] = useState(false);
  const [questionOrder, setQuestionOrder] = useState<QuestionOrder>('ordered');
  const [allQuestionProgress, setAllQuestionProgress] = useState<QuestionProgressItem[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const plannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!selectedSubject && subjects[0]) setSelectedSubject(subjects[0].id); }, [subjects, selectedSubject]);
  useEffect(() => setSelectedClasses([]), [selectedSubject]);
  const ready = materials.filter((m) => m.subjectId === selectedSubject && m.status === 'ready' && m.questionExtractionStatus === 'ready');
  const readyVersion = materials.filter((material) => material.status === 'ready' && material.questionExtractionStatus === 'ready').map((material) => `${material.id}:${material.extractedQuestionCount}`).join('|');
  useEffect(() => {
    let current = true;
    setProgressLoading(true);
    setProgressLoaded(false);
    api.questionProgress()
      .then(({ progress }) => { if (current) { setAllQuestionProgress(progress); setProgressLoaded(true); } })
      .catch((err) => { if (current) onError(err instanceof Error ? err.message : 'No pudimos calcular el orden de las preguntas.'); })
      .finally(() => { if (current) setProgressLoading(false); });
    return () => { current = false; };
  }, [readyVersion, onError]);
  const questionProgress = allQuestionProgress.filter((item) => item.subjectId === selectedSubject);
  const rhythms = useMemo(() => subjects.map((subject) => buildSubjectRhythm(subject, materials, allQuestionProgress)), [subjects, materials, allQuestionProgress]);
  const classes = [...ready.reduce((map, material) => {
    const current = map.get(material.classId) || { name: material.className, count: 0 };
    current.count += material.extractedQuestionCount;
    map.set(material.classId, current);
    return map;
  }, new Map<string, { name: string; count: number }>()).entries()];
  const selectedMaterials = selectedClasses.length ? ready.filter((material) => selectedClasses.includes(material.classId)) : ready;
  const selectedMaterialIds = new Set(selectedMaterials.map((material) => material.id));
  const scopedProgress = questionProgress.filter((item) => selectedMaterialIds.has(item.materialId));
  const poolSize = selectedMaterials.reduce((sum, material) => sum + material.extractedQuestionCount, 0);
  const dailyCount = poolSize ? Math.ceil(poolSize / 5) : 0;
  const progressReady = progressLoaded && !progressLoading;
  const unseenCount = Math.max(poolSize - scopedProgress.length, 0) + scopedProgress.filter((item) => item.validAnswerCount === 0).length;
  const firstPassRequired = poolSize > 0 && (!progressReady || unseenCount > 0);
  const today = argentinaDay(new Date());
  const todayExam = history.find((item) => item.subjectId === selectedSubject && argentinaDay(item.createdAt) === today);
  const dailyPractice = useMemo(() => dailyPracticeBySubject(history), [history]);
  const active = todayExam?.status === 'active' ? todayExam : undefined;
  const activeOrderLocked = Boolean(active && !regenerate);
  const displayedOrder = activeOrderLocked ? active?.questionOrder || 'random' : questionOrder;
  useEffect(() => { if (firstPassRequired) setQuestionOrder('ordered'); }, [firstPassRequired]);
  const start = async () => {
    setStarting(true);
    try { const data = await api.startExam({ subjectId: selectedSubject, selectedClassIds: selectedClasses, regenerate: regenerate || todayExam?.status === 'completed', questionOrder }); onStart(data.exam); }
    catch (err) { onError(err instanceof Error ? err.message : 'No pudimos preparar el repaso.'); }
    finally { setStarting(false); }
  };
  const focusSubject = (subjectId: string) => {
    setSelectedSubject(subjectId);
    window.setTimeout(() => plannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  };
  return <div className="home-screen page-enter">
    <section className="daily-header"><div><p className="eyebrow">REPASO DIARIO</p><h1>Buenas tardes, Pablo.</h1><p>Elegí la materia y las clases. Vas a responder las preguntas definidas al final de tus apuntes.</p></div><div className="daily-progress-ring" style={{ '--progress': '0deg' } as React.CSSProperties}><div><strong>{history.filter((e) => e.status === 'completed').length}</strong><span>hechos</span></div></div></section>
    {!subjects.length && !loading ? <EmptyState title="Primero, creá una materia" copy="Cada materia tendrá su propio índice privado de apuntes en Gemini File Search." action="Crear materia" onAction={() => goMaterials()} /> : <>
    <CourseRhythmPanel rhythms={rhythms} loading={progressLoading && !progressLoaded} focusSubject={focusSubject} configureSubject={goMaterials} />
    <div className="planner-layout" ref={plannerRef}>
      <section className="planner-main">
        <div className="section-heading"><h2>Preparar el repaso de hoy</h2><span>{dailyCount} {dailyCount === 1 ? 'pregunta' : 'preguntas'}</span></div>
        <div className="field-group subject-field"><div className="subject-picker-heading"><label>Materia</label><span><i /> Pendiente hasta completar un repaso hoy</span></div><div className="subject-picker">{subjects.map((subject, index) => {
          const count = materials.filter((m) => m.subjectId === subject.id && m.questionExtractionStatus === 'ready').reduce((sum, item) => sum + item.extractedQuestionCount, 0);
          const practiceStatus = dailyPractice.get(subject.id) || 'pending';
          const practiceLabel = practiceStatus === 'completed' ? 'Practicada hoy' : practiceStatus === 'active' ? 'Repaso en curso' : 'Pendiente hoy';
          const StatusIcon = practiceStatus === 'completed' ? CheckCircle2 : practiceStatus === 'active' ? Clock3 : Circle;
          return <button key={subject.id} data-practice-status={practiceStatus} className={`subject-picker-row subject-picker-row--${practiceStatus} ${selectedSubject === subject.id ? 'selected' : ''}`} onClick={() => setSelectedSubject(subject.id)} aria-label={`${subject.name}. ${practiceLabel}. ${count} preguntas encontradas.`}>
            <span className="subject-picker-index">{String(index + 1).padStart(2,'0')}</span><strong>{subject.name}</strong>
            <span className="subject-picker-status"><StatusIcon size={15} /><span>{practiceLabel}</span><small>{count} {count === 1 ? 'pregunta' : 'preguntas'}</small></span>
            {selectedSubject === subject.id && <Check className="subject-selected-check" size={16} />}
          </button>;
        })}</div></div>
        <div className="field-group"><div className="label-row"><label>Clases para el pool</label><button onClick={() => setSelectedClasses([])}>Toda la materia</button></div>
          {classes.length ? <div className="class-picker"><button className={!selectedClasses.length ? 'selected' : ''} onClick={() => setSelectedClasses([])}>Todas · {ready.reduce((sum, item) => sum + item.extractedQuestionCount, 0)}</button>{classes.map(([id,data]) => <button key={id} className={selectedClasses.includes(id) ? 'selected' : ''} onClick={() => setSelectedClasses((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current,id])}>{selectedClasses.includes(id) && <Check size={12} />}{data.name} · {data.count}</button>)}</div> : <div className="no-materials"><FolderOpen size={18} /><span>No hay apuntes con un bloque “Preguntas” disponible.</span><button onClick={() => goMaterials(selectedSubject)}>Revisar apuntes</button></div>}
        </div>
        <div className="question-bank-summary"><div><span>PREGUNTAS EN EL ALCANCE</span><strong>{poolSize}</strong></div><ArrowRight size={18} /><div><span>PARA RESPONDER HOY</span><strong>{dailyCount}</strong></div><p>Se toma una quinta parte del banco y se redondea hacia arriba.</p></div>
        {poolSize > 0 && <div className={`question-order ${firstPassRequired ? 'question-order--locked' : ''}`}><div className="question-order-copy"><span>ORDEN DEL RECORRIDO</span><strong>{activeOrderLocked ? `Repaso activo · ${displayedOrder === 'ordered' ? 'En orden' : 'Aleatorio'}` : firstPassRequired ? 'Primera vuelta obligatoria' : 'Elegí cómo recorrerlas'}</strong><small>{activeOrderLocked ? 'El orden ya quedó definido. Activá “Regenerar” para cambiarlo.' : progressLoading ? 'Calculando el avance del alcance elegido…' : firstPassRequired ? `${unseenCount} ${unseenCount === 1 ? 'pregunta todavía está' : 'preguntas todavía están'} en cero. Se tomarán desde la primera pendiente, respetando el orden del apunte.` : 'Todas las preguntas del alcance tienen al menos una respuesta válida.'}</small></div><div className="question-order-options" role="radiogroup" aria-label="Orden de las preguntas"><button role="radio" aria-checked={displayedOrder === 'ordered'} className={displayedOrder === 'ordered' ? 'selected' : ''} disabled={firstPassRequired || activeOrderLocked} onClick={() => setQuestionOrder('ordered')}><ListOrdered size={17} /><span><strong>En orden</strong><small>Según el apunte</small></span>{displayedOrder === 'ordered' && <Check size={14} />}</button><button role="radio" aria-checked={displayedOrder === 'random'} className={displayedOrder === 'random' ? 'selected' : ''} disabled={firstPassRequired || activeOrderLocked} onClick={() => setQuestionOrder('random')}><Shuffle size={17} /><span><strong>Aleatorio</strong><small>Salteadas</small></span>{displayedOrder === 'random' && <Check size={14} />}</button></div></div>}
        {active && <label className="regenerate-toggle"><input type="checkbox" checked={regenerate} onChange={(e) => setRegenerate(e.target.checked)} /><span><RefreshCcw size={15} /><strong>Regenerar la selección de hoy</strong><small>El repaso activo se archivará y se elegirán otras preguntas del banco.</small></span></label>}
        {todayExam?.status === 'completed' && <div className="regenerate-toggle"><input type="checkbox" checked readOnly /><span><RefreshCcw size={15} /><strong>Crear otra selección para hoy</strong><small>Ya completaste el repaso anterior; se elegirán otras preguntas del mismo banco.</small></span></div>}
        <button className="primary-button planner-submit" disabled={!selectedSubject || !poolSize || starting} onClick={start}>{starting ? <><LoaderCircle className="spin" size={17} /> Seleccionando las preguntas de hoy…</> : <>{active && !regenerate ? 'Continuar repaso' : todayExam?.status === 'completed' ? 'Regenerar selección de hoy' : 'Comenzar repaso de hoy'} <ArrowRight size={17} /></>}</button>
      </section>
      <aside className="home-insights"><div className="insight-block"><div className="insight-icon"><FileText size={18} /></div><span className="insight-label">PREGUNTAS DEL APUNTE</span><p>De <em>{poolSize}</em> preguntas escritas en tus clases, hoy vas a responder <em>{dailyCount}</em>. No se crean preguntas nuevas.</p></div><div className="privacy-note"><LockKeyhole size={16} /><div><strong>Apunte privado</strong><span>La IA consulta el archivo original sólo para corregir la pregunta que estás respondiendo.</span></div></div></aside>
    </div></>}
  </div>;
}

function CourseRhythmPanel({ rhythms, loading, focusSubject, configureSubject }: { rhythms: SubjectRhythm[]; loading: boolean; focusSubject: (subjectId: string) => void; configureSubject: (subjectId: string) => void }) {
  return <section className="course-rhythm" aria-labelledby="course-rhythm-title"><header className="course-rhythm-head"><div><p className="eyebrow">RITMO DE CURSADA</p><h2 id="course-rhythm-title">Antes de la próxima clase</h2><p>Una pregunta cuenta como completa cuando recibió al menos una respuesta válida.</p></div><CalendarDays size={22} /></header>
    {loading ? <div className="rhythm-loading"><LoaderCircle className="spin" size={18} /> Calculando el avance semanal…</div> : <div className="rhythm-list">{rhythms.map((rhythm) => {
      const scheduled = rhythm.weeklyClassDay !== undefined;
      const complete = rhythm.totalQuestions > 0 && rhythm.pendingQuestions === 0;
      const hasBacklog = rhythm.backlogClasses.length > 0;
      const deadline = rhythm.daysUntilClass === 0 ? 'HOY' : String(rhythm.daysUntilClass ?? '—').padStart(2, '0');
      return <article className={`rhythm-row ${hasBacklog ? 'rhythm-row--late' : complete ? 'rhythm-row--complete' : ''}`} key={rhythm.subjectId}>
        <div className="rhythm-deadline"><strong>{deadline}</strong><span>{rhythm.daysUntilClass === 0 ? 'día de clase' : scheduled ? rhythm.daysUntilClass === 1 ? 'día restante' : 'días restantes' : 'sin día'}</span></div>
        <div className="rhythm-main"><div className="rhythm-title"><div><span>{rhythm.subjectName}</span><strong>{rhythm.currentClass?.className || 'Todavía sin clases cargadas'}</strong></div>{scheduled && <small>Próxima clase · {WEEKDAY_NAMES[rhythm.weeklyClassDay!]}</small>}</div>
          {rhythm.totalQuestions > 0 && <><div className="rhythm-progress"><span style={{ width: `${Math.round((rhythm.completedQuestions / rhythm.totalQuestions) * 100)}%` }} /></div><div className="rhythm-copy"><span>{complete ? 'Primera vuelta completa' : `${rhythm.pendingQuestions} ${rhythm.pendingQuestions === 1 ? 'pregunta pendiente' : 'preguntas pendientes'}`}</span><small>{rhythm.completedQuestions} de {rhythm.totalQuestions} respondidas al menos una vez</small></div></>}
          {hasBacklog && <div className="rhythm-backlog"><AlertTriangle size={14}/><span><strong>En falta</strong>{rhythm.backlogClasses.map((item) => `${item.className}: ${item.pendingQuestions}`).join(' · ')}</span></div>}
        </div>
        <div className="rhythm-target">{scheduled ? <button onClick={() => focusSubject(rhythm.subjectId)} disabled={!rhythm.totalQuestions}>Practicar pendientes <ArrowRight size={13}/></button> : <button onClick={() => configureSubject(rhythm.subjectId)}>Configurar día <ArrowRight size={13}/></button>}</div>
      </article>;
    })}</div>}
  </section>;
}

function SubjectScheduleEditor({ subject, rhythm, saving, update }: { subject: Subject; rhythm: SubjectRhythm; saving: boolean; update: (day: number | null) => void }) {
  const scheduled = subject.weeklyClassDay !== undefined;
  return <section className="subject-schedule"><div className="schedule-icon"><CalendarDays size={20}/></div><div className="schedule-copy"><span>RITMO SEMANAL</span><strong>{scheduled ? `Cada ${WEEKDAY_NAMES[subject.weeklyClassDay!]}` : 'Asigná el día de esta materia'}</strong><small>{scheduled ? rhythm.daysUntilClass === 0 ? 'Hoy es día de clase. Las preguntas nuevas abren el próximo ciclo.' : `Faltan ${rhythm.daysUntilClass} ${rhythm.daysUntilClass === 1 ? 'día' : 'días'} para la próxima clase.` : 'Se usará para repartir las preguntas en hasta cinco jornadas y detectar clases rezagadas.'}</small></div><label><span>Día de clase</span><div className="schedule-select-wrap"><select value={subject.weeklyClassDay ?? ''} disabled={saving} onChange={(event) => update(event.target.value === '' ? null : Number(event.target.value))}><option value="">Sin configurar</option>{WEEKDAY_NAMES.map((day, index) => <option value={index} key={day}>{day[0].toUpperCase() + day.slice(1)}</option>)}</select>{saving && <LoaderCircle className="spin" size={15}/>}</div></label></section>;
}

function MaterialsPage({ subjects, materials, selected, setSelected, reload, onError }: { subjects: Subject[]; materials: StudyMaterial[]; selected: string; setSelected: (id: string) => void; reload: () => Promise<void>; onError: (message: string) => void }) {
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);
  const [deletingSubject, setDeletingSubject] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [className, setClassName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadMode, setUploadMode] = useState<'file' | 'text'>('file');
  const [pastedName, setPastedName] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [busy, setBusy] = useState(false);
  const [questionProgress, setQuestionProgress] = useState<QuestionProgressItem[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressRevision, setProgressRevision] = useState(0);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const extractingRef = useRef(new Set<string>());
  useEffect(() => {
    if (deletingSubject) return;
    if (selected && !subjects.some((subject) => subject.id === selected)) setSelected(subjects[0]?.id || '');
    else if (!selected && subjects[0]) setSelected(subjects[0].id);
  }, [subjects, selected, deletingSubject]);
  useEffect(() => {
    if (!subjectToDelete) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !deletingSubject) setSubjectToDelete(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [subjectToDelete, deletingSubject]);
  const current = materials.filter((m) => m.subjectId === selected);
  const currentSubject = subjects.find((subject) => subject.id === selected);
  const materialProgressVersion = current.map((material) => `${material.id}:${material.questionExtractionStatus}:${material.extractedQuestionCount}`).join('|');
  useEffect(() => {
    if (!selected) { setQuestionProgress([]); return; }
    let active = true;
    setProgressLoading(true);
    api.questionProgress(selected)
      .then(({ progress }) => { if (active) setQuestionProgress(progress); })
      .catch((err) => { if (active) onError(err instanceof Error ? err.message : 'No pudimos cargar el seguimiento de preguntas.'); })
      .finally(() => { if (active) setProgressLoading(false); });
    return () => { active = false; };
  }, [selected, materialProgressVersion, progressRevision, onError]);
  useEffect(() => {
    if (!current.some((material) => material.status === 'processing' || material.questionExtractionStatus === 'extracting')) return;
    const timer = window.setInterval(() => { void reload(); }, 5000);
    return () => window.clearInterval(timer);
  }, [current, reload]);
  useEffect(() => {
    const pending = current.filter((material) => material.status === 'ready' && material.questionExtractionStatus === 'pending' && !extractingRef.current.has(material.id));
    pending.forEach((material) => {
      extractingRef.current.add(material.id);
      api.extractMaterialQuestions(material.id)
        .catch((err) => onError(err instanceof Error ? err.message : 'No pudimos identificar las preguntas.'))
        .finally(() => { extractingRef.current.delete(material.id); void reload(); });
    });
  }, [current, onError, reload]);
  const createSubject = async () => { if (!newSubject.trim()) return; setBusy(true); try { const { subject } = await api.createSubject(newSubject); setNewSubject(''); await reload(); setSelected(subject.id); } catch (err) { onError(err instanceof Error ? err.message : 'No se pudo crear la materia.'); } finally { setBusy(false); } };
  const chooseFiles = (list: FileList | null) => { if (!list) return; const next = [...list]; const oversized = next.find((file) => file.size > MAX_UPLOAD); if (oversized) { onError(`${oversized.name} supera el límite de 4 MB.`); return; } setFiles(next); };
  const upload = async () => { if (!selected || !className.trim() || !files.length) return; setBusy(true); try { for (const file of files) { const form = new FormData(); form.append('subjectId', selected); form.append('className', className); form.append('file', file); await api.uploadMaterial(form); } setFiles([]); setClassName(''); if (inputRef.current) inputRef.current.value = ''; await reload(); } catch (err) { onError(err instanceof Error ? err.message : 'No se pudo subir el archivo.'); } finally { setBusy(false); } };
  const pastedBytes = new Blob([pastedText]).size;
  const uploadPastedText = async () => {
    if (!selected || !className.trim() || !pastedText.trim() || pastedBytes > MAX_UPLOAD) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('subjectId', selected);
      form.append('className', className);
      form.append('file', new File([pastedText], textUploadFileName(pastedName, className), { type: 'text/plain' }));
      await api.uploadMaterial(form);
      setPastedName('');
      setPastedText('');
      setClassName('');
      await reload();
    } catch (err) { onError(err instanceof Error ? err.message : 'No se pudo guardar el texto.'); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => { if (!confirm('¿Eliminar este apunte del índice de la materia?')) return; try { await api.deleteMaterial(id); await reload(); } catch (err) { onError(err instanceof Error ? err.message : 'No se pudo eliminar.'); } };
  const removeSubject = async () => {
    if (!subjectToDelete || deletingSubject) return;
    setDeletingSubject(true);
    try {
      await api.deleteSubject(subjectToDelete.id);
      const nextSubject = subjects.find((subject) => subject.id !== subjectToDelete.id);
      if (selected === subjectToDelete.id) setSelected(nextSubject?.id || '');
      setSubjectToDelete(null);
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo eliminar la materia.');
    } finally { setDeletingSubject(false); }
  };
  const retryExtraction = async (id: string) => { try { await api.extractMaterialQuestions(id); await reload(); } catch (err) { onError(err instanceof Error ? err.message : 'No pudimos identificar las preguntas.'); } };
  const updateClassDay = async (weeklyClassDay: number | null) => {
    if (!currentSubject || scheduleSaving) return;
    setScheduleSaving(true);
    try { await api.updateSubjectSchedule(currentSubject.id, weeklyClassDay); await reload(); }
    catch (err) { onError(err instanceof Error ? err.message : 'No pudimos guardar el día de clase.'); }
    finally { setScheduleSaving(false); }
  };
  const currentRhythm = currentSubject ? buildSubjectRhythm(currentSubject, materials, questionProgress) : null;
  return <div className="admin-page page-enter"><section className="admin-head"><div><p className="eyebrow">BIBLIOTECA</p><h1>Materias y apuntes</h1><p>Organizá cada archivo por clase. El profesor sólo consultará el material que elijas.</p></div><div className="new-subject"><input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Nombre de la nueva materia" onKeyDown={(e) => e.key === 'Enter' && createSubject()} /><button onClick={createSubject} disabled={busy || !newSubject.trim()}><Plus size={16} /> Crear materia</button></div></section>
    <div className="admin-layout"><aside className="subject-admin-list"><span className="context-label">MATERIAS</span>{subjects.map((subject) => <div className={`subject-admin-entry ${selected === subject.id ? 'active' : ''}`} key={subject.id}><button className="subject-select" onClick={() => setSelected(subject.id)}><BookOpen size={16} /><span><strong>{subject.name}</strong><small>{materials.filter((m) => m.subjectId === subject.id).length} materiales</small></span><ArrowRight size={14} /></button><button className="subject-delete" aria-label={`Eliminar ${subject.name}`} title="Eliminar materia" onClick={() => setSubjectToDelete(subject)}><Trash2 size={14} /></button></div>)}</aside>
      <section className="materials-workspace">{selected ? <>{currentSubject && currentRhythm && <SubjectScheduleEditor subject={currentSubject} rhythm={currentRhythm} saving={scheduleSaving} update={updateClassDay} />}<div className="upload-zone"><div><UploadCloud size={25} /><span><strong>Agregar apuntes</strong><small>Debe terminar con “# Preguntas”; admite apartados “### n. Tema” · máximo 4 MB</small></span></div><div className="upload-mode-tabs" role="tablist" aria-label="Forma de agregar el apunte"><button role="tab" aria-selected={uploadMode === 'file'} className={uploadMode === 'file' ? 'active' : ''} onClick={() => setUploadMode('file')}><FileText size={15} /> Elegir archivo</button><button role="tab" aria-selected={uploadMode === 'text'} className={uploadMode === 'text' ? 'active' : ''} onClick={() => setUploadMode('text')}><Plus size={15} /> Pegar texto</button></div>{uploadMode === 'file' ? <div className="upload-fields"><label><span>Clase o apartado</span><input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Ej. Clase 07 — Actos jurídicos" /></label><label className="file-control"><input ref={inputRef} type="file" multiple accept=".pdf,.txt,.md,.docx" onChange={(e) => chooseFiles(e.target.files)} /><span><FileText size={15} />{files.length ? `${files.length} archivo${files.length > 1 ? 's' : ''}` : 'Elegir archivos'}</span></label><button className="primary-button" disabled={busy || !files.length || !className.trim()} onClick={upload}>{busy ? <LoaderCircle className="spin" size={16} /> : 'Subir e identificar'}</button></div> : <div className="text-upload-fields" role="tabpanel"><div className="text-upload-meta"><label><span>Clase o apartado</span><input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Ej. Clase 07 — Actos jurídicos" /></label><label><span>Nombre del apunte <small>opcional</small></span><input value={pastedName} onChange={(e) => setPastedName(e.target.value)} placeholder={textUploadFileName('', className)} /></label></div><label className="text-upload-editor"><span>Contenido completo del apunte</span><textarea value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder={'Pegá acá el contenido teórico completo.\n\n# Preguntas\n### 1. Nombre del apartado\n1. Primera pregunta\n2. Segunda pregunta'} /></label><div className="text-upload-footer"><div><strong className={pastedBytes > MAX_UPLOAD ? 'over-limit' : ''}>{(pastedBytes / 1024).toFixed(pastedBytes ? 1 : 0)} KB de 4 MB</strong><span>Se guardará como {textUploadFileName(pastedName, className)}</span></div><button className="primary-button" disabled={busy || !className.trim() || !pastedText.trim() || pastedBytes > MAX_UPLOAD} onClick={uploadPastedText}>{busy ? <><LoaderCircle className="spin" size={16} /> Guardando…</> : <>Guardar e identificar preguntas <ArrowRight size={16} /></>}</button></div></div>}</div>
        <div className="materials-list"><div className="section-heading"><h2>Materiales cargados</h2><button onClick={reload}><RefreshCcw size={13} /> Actualizar estados</button></div>{current.length ? current.map((material) => { const extracting = material.status === 'ready' && ['pending','extracting'].includes(material.questionExtractionStatus); const readyQuestions = material.status === 'ready' && material.questionExtractionStatus === 'ready'; const questionError = material.status === 'ready' && material.questionExtractionStatus === 'error'; return <div className="material-row" key={material.id}><span className={`file-status file-status--${readyQuestions ? 'ready' : questionError ? 'error' : material.status}`}>{readyQuestions ? <Check size={15} /> : questionError || material.status === 'error' ? <X size={15} /> : <LoaderCircle className="spin" size={15} />}</span><div><strong>{material.name}</strong><small>{material.className} · {(material.size / 1024 / 1024).toFixed(2)} MB{questionError && <> · {material.questionExtractionError}</>}</small></div><span className={`status-label status-label--${readyQuestions ? 'ready' : questionError ? 'error' : material.status}`}>{readyQuestions ? `${material.extractedQuestionCount} preguntas` : questionError ? <button className="retry-inline" onClick={() => retryExtraction(material.id)}>Reintentar</button> : extracting ? 'Identificando preguntas' : material.status === 'processing' ? 'Procesando archivo' : 'Error'}</span><button className="delete-button" onClick={() => remove(material.id)}><Trash2 size={16} /></button></div>; }) : <div className="empty-materials"><FileText size={25} /><p>Todavía no hay apuntes en esta materia.</p></div>}</div><QuestionProgressTracker items={questionProgress} loading={progressLoading} refresh={() => setProgressRevision((value) => value + 1)} /></> : <EmptyState title="Creá tu primera materia" copy="Después vas a poder cargar sus clases y apuntes." action="" onAction={() => undefined} />}</section>
    </div>
    {subjectToDelete && <div className="confirm-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingSubject) setSubjectToDelete(null); }}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-subject-title"><span className="confirm-icon"><Trash2 size={19} /></span><p className="eyebrow">ACCIÓN PERMANENTE</p><h2 id="delete-subject-title">¿Eliminar “{subjectToDelete.name}”?</h2><p>Se borrarán {materials.filter((material) => material.subjectId === subjectToDelete.id).length} apuntes, todas sus preguntas y el historial de repasos de esta materia. No se puede deshacer.</p><div className="confirm-actions"><button autoFocus disabled={deletingSubject} onClick={() => setSubjectToDelete(null)}>Cancelar</button><button className="danger-button" disabled={deletingSubject} onClick={removeSubject}>{deletingSubject ? <><LoaderCircle className="spin" size={15} /> Eliminando…</> : <><Trash2 size={15} /> Eliminar materia</>}</button></div></section></div>}
    </div>;
}

function QuestionProgressTracker({ items, loading, refresh }: { items: QuestionProgressItem[]; loading: boolean; refresh: () => void }) {
  const groups = [...items.reduce((map, item) => {
    const group = map.get(item.materialId) || { id: item.materialId, name: item.sourceLabel, className: item.className, items: [] as QuestionProgressItem[] };
    group.items.push(item);
    map.set(item.materialId, group);
    return map;
  }, new Map<string, { id: string; name: string; className: string; items: QuestionProgressItem[] }>()).values()];
  const unanswered = items.filter((item) => item.validAnswerCount === 0).length;
  const validAnswers = items.reduce((sum, item) => sum + item.validAnswerCount, 0);
  return <section className="question-tracker"><div className="tracker-head"><div><p className="eyebrow">ROTACIÓN DEL BANCO</p><h2>Seguimiento de preguntas</h2><p>Las menos respondidas aparecen primero en los próximos repasos. Sólo cuentan respuestas aceptadas como OK o PARCIAL.</p></div><button onClick={refresh} disabled={loading}><RefreshCcw className={loading ? 'spin' : ''} size={14} /> Actualizar</button></div>
    <div className="tracker-stats"><div><strong>{items.length}</strong><span>preguntas</span></div><div><strong>{unanswered}</strong><span>sin responder</span></div><div><strong>{validAnswers}</strong><span>respuestas válidas</span></div></div>
    {loading && !items.length ? <div className="tracker-loading"><LoaderCircle className="spin" size={18} /> Calculando el historial…</div> : groups.length ? <div className="tracker-groups">{groups.map((group) => { const groupUnanswered = group.items.filter((item) => item.validAnswerCount === 0).length; return <details className="tracker-group" key={group.id}><summary><div><strong>{group.name}</strong><small>{group.className} · {group.items.length} preguntas</small></div><span>{groupUnanswered ? `${groupUnanswered} sin responder` : 'Todas practicadas'}</span><ChevronDown size={16} /></summary><div className="tracker-questions">{group.items.map((item) => { const section = item.sectionTitle ? item.sectionNumber ? `Apartado ${item.sectionNumber} · ${item.sectionTitle}` : item.sectionTitle : item.className; return <div className="tracker-question" key={item.id}><span className="tracker-question-number">{item.sourceNumber || '—'}</span><div><small>{section}</small><p><InlineBold text={item.question} /></p></div><strong className={item.validAnswerCount === 0 ? 'empty' : ''}><span>{item.validAnswerCount}</span>{item.validAnswerCount === 1 ? ' válida' : ' válidas'}</strong></div>; })}</div></details>; })}</div> : <div className="tracker-loading">Todavía no hay preguntas identificadas para seguir.</div>}
  </section>;
}

function HistoryPage({ history, openExam }: { history: ExamHistoryItem[]; openExam: (id: string) => void }) {
  return <div className="history-page page-enter"><section className="admin-head"><div><p className="eyebrow">MI PROGRESO</p><h1>Historial de repasos</h1><p>Cada examen conserva sus respuestas, notas y devolución pedagógica.</p></div></section><div className="history-list"><div className="history-table-head"><span>Materia</span><span>Alcance</span><span>Fecha</span><span>Resultado</span></div>{history.length ? history.map((item) => <button className="history-row" key={item.id} onClick={() => openExam(item.id)}><div><strong>{item.subjectName}</strong><small>{item.totalQuestions} preguntas</small></div><span>{item.selectedClassNames.length ? item.selectedClassNames.join(', ') : 'Toda la materia'}</span><span>{new Intl.DateTimeFormat('es-AR', { day:'2-digit', month:'short', year:'numeric' }).format(new Date(item.createdAt))}</span><span className={`history-score ${item.status}`}><strong>{item.finalScore ?? (item.status === 'active' ? 'En curso' : '—')}</strong>{typeof item.finalScore === 'number' && <small>/ 10</small>}</span><ArrowRight size={16} /></button>) : <EmptyState title="Todavía no hay repasos" copy="Tu primer examen aparecerá acá cuando lo generes." action="" onAction={() => undefined} />}</div></div>;
}

function ExamPage({ exam, setExam, summary, setSummary, exit, onError }: { exam: PublicExam; setExam: (exam: PublicExam) => void; summary: ExamSummary | null; setSummary: (summary: ExamSummary | null) => void; exit: () => void; onError: (message: string) => void }) {
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<'answering'|'evaluating'|'feedback'>('answering');
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [pendingExam, setPendingExam] = useState<PublicExam | null>(null);
  const [skippingFollowUp, setSkippingFollowUp] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceContext, setSourceContext] = useState<QuestionSourceContext | null>(null);
  const [sourceError, setSourceError] = useState('');
  const [evaluationError, setEvaluationError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const appendSpeech = useCallback((text: string) => setAnswer((current) => `${current}${current.trim() ? ' ' : ''}${text}`), []);
  const speech = useSpeechRecognition(appendSpeech);
  useEffect(() => { if (status === 'answering') setTimeout(() => textarea.current?.focus(), 80); }, [exam.currentQuestion?.id, status]);
  useEffect(() => { setSourceOpen(false); setSourceContext(null); setSourceError(''); setEvaluationError(''); }, [exam.currentQuestion?.id]);
  useEffect(() => {
    if (!sourceOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSourceOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape); };
  }, [sourceOpen]);
  if (exam.status === 'completed' && summary) return <Completion exam={exam} summary={summary} exit={exit} />;
  const submit = async () => {
    if (!exam.currentQuestion || status !== 'answering') return;
    speech.stop();
    setEvaluationError('');
    setStatus('evaluating');
    try {
      const data = await api.answer(exam.id, exam.currentQuestion.id, answer);
      if (data.completed && !data.summary) {
        const finished = await api.exam(exam.id);
        data.exam = finished.exam;
        data.summary = finished.summary;
      }
      setEvaluation(data.evaluation);
      setPendingExam(data.exam);
      if (data.summary) setSummary(data.summary);
      setStatus('feedback');
    } catch (err) {
      setStatus('answering');
      setEvaluationError(err instanceof Error ? err.message : 'No pudimos evaluar la respuesta. Intentá nuevamente.');
    }
  };
  const continueFlow = () => { if (!evaluation || !pendingExam) return; if (evaluation.verdict === 'incorrect' && !evaluation.finalForQuestion) { setAnswer(''); setEvaluation(null); setPendingExam(null); setStatus('answering'); return; } setExam(pendingExam); setAnswer(''); setEvaluation(null); setPendingExam(null); setStatus('answering'); };
  const question = exam.currentQuestion;
  if (!question) return <EmptyState title="Cargando siguiente pregunta" copy="" action="" onAction={() => undefined} />;
  const skipFollowUp = async () => {
    if (!evaluation || evaluation.score < 7 || !pendingExam?.currentQuestion?.followUp || skippingFollowUp) return;
    setSkippingFollowUp(true);
    try {
      const data = await api.skipFollowUp(exam.id, question.id);
      if (data.completed && !data.summary) {
        const finished = await api.exam(exam.id);
        data.exam = finished.exam;
        data.summary = finished.summary;
      }
      if (data.summary) setSummary(data.summary);
      setExam(data.exam);
      setAnswer('');
      setEvaluation(null);
      setPendingExam(null);
      setStatus('answering');
    } catch (err) { onError(err instanceof Error ? err.message : 'No pudimos omitir la repregunta.'); }
    finally { setSkippingFollowUp(false); }
  };
  const openSource = async () => {
    setSourceOpen(true);
    if (sourceContext) return;
    setSourceLoading(true);
    setSourceError('');
    try { setSourceContext((await api.questionSource(exam.id, question.id)).context); }
    catch (err) { setSourceError(err instanceof Error ? err.message : 'No pudimos abrir el fragmento del apunte.'); }
    finally { setSourceLoading(false); }
  };
  const sectionLabel = question.sectionTitle
    ? question.sectionNumber ? `Apartado ${question.sectionNumber} · ${question.sectionTitle}` : question.sectionTitle
    : '';
  const questionContext = question.followUp
    ? ['Repregunta del profesor', sectionLabel]
    : [question.className || exam.selectedClassNames.join(' · ') || 'Toda la materia', sectionLabel];
  return <div className="session-screen page-enter"><div className="session-topline"><button className="back-button" onClick={exit}><ArrowLeft size={17} /> Salir de la sesión</button><div className="session-title"><span>{exam.subjectName}</span><small>Repaso de hoy</small></div><div className="question-count"><strong>{String(Math.min(exam.currentQuestionIndex + 1, exam.totalQuestions)).padStart(2,'0')}</strong> / {String(exam.totalQuestions).padStart(2,'0')}</div></div><div className="progress-track"><span style={{ width: `${Math.max((exam.currentQuestionIndex / exam.totalQuestions) * 100, 4)}%` }} /></div>
    <div className="study-layout"><section className="question-workspace"><div className="question-meta"><span>{questionContext.filter(Boolean).join(' · ')}</span><div className="question-meta-actions"><span className="question-valid-count">Respondida {question.validAnswerCount} {question.validAnswerCount === 1 ? 'vez' : 'veces'}</span>{question.sourceLabel && <button className="source-open-button" onClick={openSource}><BookOpen size={14} /><span>Ver apunte</span><small>{question.sourceLabel}</small></button>}</div></div><h1><InlineBold text={question.question} /></h1>{question.followUp && <div className="hint"><Sparkles size={16}/><span><strong>Una precisión más</strong>Esta repregunta no suma una pregunta al total.</span></div>}
      <div className={`answer-area answer-area--${status}`}><div className="answer-label"><label htmlFor="answer">Tu respuesta</label><span>{answer.length} caracteres</span></div><textarea id="answer" ref={textarea} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={status !== 'answering'} placeholder="Explicalo con tus palabras…" />{speech.interimTranscript && <div className="interim-text">{speech.interimTranscript}…</div>}
        {status === 'answering' && evaluationError && <div className="answer-evaluation-error" role="alert"><AlertCircle size={19}/><div><strong>No pudimos completar la corrección</strong><span>{evaluationError}</span><small>Tu respuesta quedó guardada en pantalla.</small></div></div>}
        {status === 'answering' && <div className="answer-actions"><div className="speech-controls">{speech.supported ? <button className={speech.isListening ? 'listening' : ''} onClick={speech.isListening ? speech.stop : speech.start}>{speech.isListening ? <MicOff size={16}/> : <Mic size={16}/>} {speech.isListening ? 'Detener dictado' : 'Responder por voz'}</button> : <span><MicOff size={14}/> Voz no disponible en este navegador</span>}{speech.error === 'MICROPHONE_DENIED' && <small>Habilitá el micrófono en los permisos del navegador.</small>}</div><button className="primary-button" disabled={answer.trim().length < 3} onClick={submit}>{evaluationError ? <><RefreshCcw size={16}/> Reintentar corrección</> : <>Enviar respuesta <ArrowRight size={17}/></>}</button></div>}
        {status === 'evaluating' && <div className="evaluating-state"><span className="ai-loader"><Sparkles size={17}/></span><div><strong>El profesor está leyendo tu respuesta</strong><small>Contrasta tu respuesta con el contenido del apunte…</small></div></div>}
      </div>{status === 'feedback' && evaluation && <ExamFeedback evaluation={evaluation} onContinue={continueFlow} onSkipFollowUp={skipFollowUp} skippingFollowUp={skippingFollowUp} nextIsFollowUp={Boolean(pendingExam?.currentQuestion?.followUp)} completed={pendingExam?.status === 'completed'} />}</section>
      <aside className="session-context"><span className="context-label">EN ESTA SESIÓN</span><div className="question-list">{Array.from({ length: exam.totalQuestions }, (_, index) => <div className={`question-step ${index === exam.currentQuestionIndex ? 'active' : ''} ${index < exam.currentQuestionIndex ? 'done' : ''}`} key={index}><span>{index < exam.currentQuestionIndex ? <Check size={13}/> : String(index + 1).padStart(2,'0')}</span><div><strong>Pregunta {index + 1}</strong><small>{index < exam.currentQuestionIndex ? 'Respondida' : index === exam.currentQuestionIndex ? (question.followUp ? 'Repregunta' : 'En curso') : 'Pendiente'}</small></div></div>)}</div><div className="session-note"><Clock3 size={17}/><div><strong>{exam.totalQuestions - exam.currentQuestionIndex} por responder</strong><span>Los avances se guardan automáticamente</span></div></div></aside>
    </div>{sourceOpen && createPortal(<SourceContextModal context={sourceContext} loading={sourceLoading} error={sourceError} close={() => setSourceOpen(false)} />, document.body)}</div>;
}

function SourceContextModal({ context, loading, error, close }: { context: QuestionSourceContext | null; loading: boolean; error: string; close: () => void }) {
  return <div className="source-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="source-dialog" role="dialog" aria-modal="true" aria-labelledby="source-dialog-title">
    <header className="source-dialog-head"><div><p className="eyebrow">FUENTE DE LA PREGUNTA</p><h2 id="source-dialog-title">Fragmentos del apunte</h2><p>Consultalos como ayuda mientras preparás tu respuesta.</p></div><button autoFocus aria-label="Cerrar fragmentos" onClick={close}><X size={19} /></button></header>
    <div className="source-dialog-body">
      {loading && <div className="source-loading"><LoaderCircle className="spin" size={22} /><div><strong>Buscando el contexto exacto</strong><span>Localizando la sección vinculada con esta pregunta…</span></div></div>}
      {!loading && error && <div className="source-error"><AlertCircle size={20} /><div><strong>No pudimos mostrar el fragmento</strong><span>{error}</span></div></div>}
      {!loading && context && <><div className="source-origin"><BookOpen size={18} /><div><span>{context.className}</span><strong>{context.sourceLabel}</strong></div><small>{context.fragments.length} {context.fragments.length === 1 ? 'fragmento' : 'fragmentos'}</small></div><div className="source-fragments">{context.fragments.map((fragment, index) => <article className="source-fragment" key={`${fragment.title}-${index}`} style={{ animationDelay: `${index * 55}ms` }}><header><span>{String(index + 1).padStart(2, '0')}</span><div><small>SECCIÓN DEL APUNTE</small><h3>{fragment.title}</h3></div></header><p><InlineBold text={fragment.content} /></p></article>)}</div></>}
    </div>
    <footer className="source-dialog-foot"><span>El profesor corrige usando este mismo contexto.</span><button onClick={close}>Volver a responder <ArrowRight size={16} /></button></footer>
  </section></div>;
}

function ExamFeedback({ evaluation, onContinue, onSkipFollowUp, skippingFollowUp, nextIsFollowUp, completed }: { evaluation: Evaluation; onContinue: () => void; onSkipFollowUp: () => void; skippingFollowUp: boolean; nextIsFollowUp: boolean; completed: boolean }) {
  const failed = evaluation.verdict === 'incorrect';
  const partial = evaluation.verdict === 'partial';
  const canSkipFollowUp = nextIsFollowUp && evaluation.score >= 7;
  return <div className={`feedback feedback--${failed ? 'failed' : 'ok'}`}><div className="feedback-head"><div className="result-badge">{failed ? <XCircle size={20}/> : <CheckCircle2 size={20}/>}<strong>{failed ? 'FALLÓ' : partial ? 'PARCIAL' : 'OK'}</strong></div><span>Nota {evaluation.score.toFixed(1)} / 10</span></div><div className="professor-copy"><div className="professor-avatar"><Sparkles size={17}/></div><div><span>DEVOLUCIÓN DEL PROFESOR IA</span><p>{evaluation.feedback}</p></div></div>{evaluation.strengths.length > 0 && <div className="feedback-columns"><div><strong>Fortalezas</strong>{evaluation.strengths.map((item) => <span key={item}><Check size={12}/>{item}</span>)}</div>{(evaluation.missingConcepts.length > 0 || evaluation.errors.length > 0) && <div><strong>A revisar</strong>{[...evaluation.missingConcepts,...evaluation.errors].map((item) => <span key={item}><Circle size={7} fill="currentColor"/>{item}</span>)}</div>}</div>}<div className={`feedback-actions ${canSkipFollowUp ? 'feedback-actions--choice' : ''}`}><div className="feedback-action-buttons">{canSkipFollowUp && <button className="secondary-button" disabled={skippingFollowUp} onClick={onSkipFollowUp}>{skippingFollowUp ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} Avanzar con esta nota</button>}<button className="primary-button" disabled={skippingFollowUp} onClick={onContinue}>{failed ? <><RefreshCcw size={16}/> Reintentar pregunta</> : nextIsFollowUp ? <>Responder repregunta <ArrowRight size={17}/></> : completed ? <>Ver resultado final <ArrowRight size={17}/></> : <>Siguiente pregunta <ArrowRight size={17}/></>}</button></div><span>{failed ? 'La pregunta seguirá pendiente' : canSkipFollowUp ? `Podés conservar el ${evaluation.score.toFixed(1)} o intentar mejorarlo` : nextIsFollowUp ? 'La repregunta es necesaria para avanzar' : 'Respuesta guardada'}</span></div></div>;
}

function Completion({ exam, summary, exit }: { exam: PublicExam; summary: ExamSummary; exit: () => void }) {
  return <div className="completion completion-full page-enter"><div className="completion-mark"><Check size={38}/></div><p className="eyebrow">SESIÓN COMPLETADA</p><h1>Repaso terminado.</h1><p>{summary.generalFeedback}</p><div className="score-hero"><strong>{summary.finalScore.toFixed(1)}</strong><span>/ 10<br/>nota final</span></div><div className="summary-grid"><section><span>FORTALEZAS</span>{summary.strengths.map((item) => <p key={item}><CheckCircle2 size={15}/>{item}</p>)}</section><section><span>TEMAS PARCIALMENTE DOMINADOS</span>{summary.weakTopics.map((item) => <p key={item}><Circle size={8} fill="currentColor"/>{item}</p>)}</section><section><span>ERRORES FRECUENTES</span>{summary.frequentErrors.length ? summary.frequentErrors.map((item) => <p key={item}><XCircle size={15}/>{item}</p>) : <p><Check size={15}/>No se detectaron errores repetidos</p>}</section><section><span>CONVIENE REPASAR</span>{summary.conceptsToReview.map((item) => <p key={item}><RefreshCcw size={14}/>{item}</p>)}</section></div><button className="primary-button" onClick={exit}>Volver a hoy <ArrowRight size={17}/></button></div>;
}

function EmptyState({ title, copy, action, onAction }: { title: string; copy: string; action: string; onAction: () => void }) { return <div className="empty-state"><span><BookOpen size={22}/></span><h2>{title}</h2>{copy && <p>{copy}</p>}{action && <button className="primary-button" onClick={onAction}>{action} <ArrowRight size={16}/></button>}</div>; }
function InlineBold({ text }: { text: string }) { return <>{text.split(/(\*\*[\s\S]+?\*\*)/gu).filter(Boolean).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>)}</>; }
function Toast({ message, close }: { message: string; close: () => void }) { return <div className="toast"><AlertCircle size={17}/><span>{message}</span><button onClick={close}><X size={15}/></button></div>; }

createRoot(document.getElementById('root')!).render(<App />);
