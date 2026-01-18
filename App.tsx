
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SourceFile, SourceType, SourceCategory, Message, SourceTheme } from './types';
import { Icons } from './constants';
import { generateAssistantResponseStream, generateSpeech, decodePCM, decodeAudioData } from './services/geminiService';
import { saveSourcesToDB, getSourcesFromDB } from './services/storageService';

const App: React.FC = () => {
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeView, setActiveView] = useState<SourceCategory>('advisor');
  const [activeAdminTab, setActiveAdminTab] = useState<SourceCategory>('advisor');
  const [selectedRepoSource, setSelectedRepoSource] = useState<SourceFile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAutoSpeak, setIsAutoSpeak] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [isPreparingAudio, setIsPreparingAudio] = useState<string | null>(null);

  const [advisorMessages, setAdvisorMessages] = useState<Message[]>([]);
  const [repositoryMessages, setRepositoryMessages] = useState<Message[]>([]);
  
  // Admin Inputs
  const [advLinkInput, setAdvLinkInput] = useState('');
  const [advManualText, setAdvManualText] = useState('');
  const [repoLinkInput, setRepoLinkInput] = useState('');
  const [repoManualText, setRepoManualText] = useState('');
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTheme, setEditTheme] = useState<SourceTheme>('cyan');

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const advisorFileInputRef = useRef<HTMLInputElement>(null);
  const repositoryFileInputRef = useRef<HTMLInputElement>(null);

  const ADMIN_PASSWORD = "4you2025";

  // Helper to remove forbidden phrase
  const sanitizeText = (text: string) => text.replace(/في شركتنا/g, 'في الشركة').replace(/  +/g, ' ').trim();

  // 1. Initial Load from Persistent Storage
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedSources = await getSourcesFromDB();
        setSources(savedSources || []);
        
        const storedAdv = localStorage.getItem('4you_advisor_messages');
        const storedRepo = localStorage.getItem('4you_repository_messages');
        
        if (storedAdv) {
          const parsed = JSON.parse(storedAdv);
          setAdvisorMessages(parsed.map((m:any) => ({
            ...m, 
            text: sanitizeText(m.text), 
            timestamp: new Date(m.timestamp)
          })));
        } else {
          setAdvisorMessages([{ 
            id: 'w-adv', 
            role: 'assistant', 
            text: 'يا أهلاً بك.. معك المستشار المعرفي alhootah، يسعدني جداً مرافقتك في رحلة الانتقال الإيجابي من وزارة الصحة إلى الشركة القابضة. تفضل، كيف يمكنني خدمتك اليوم؟\nممكن نتشرف باسمك؟', 
            timestamp: new Date() 
          }]);
        }
        
        if (storedRepo) {
          const parsed = JSON.parse(storedRepo);
          setRepositoryMessages(parsed.map((m:any) => ({
            ...m, 
            text: sanitizeText(m.text), 
            timestamp: new Date(m.timestamp)
          })));
        } else {
          setRepositoryMessages([{ 
            id: 'w-repo', 
            role: 'assistant', 
            text: 'أهلاً بك في مكتبتك الرقمية.. المستشار المعرفي alhootah جاهز لمساعدتك في تحليل واستخراج المعلومات من الوثائق التي تختارها.\nممكن نتشرف باسمك؟', 
            timestamp: new Date() 
          }]);
        }
        
        setIsLoaded(true);
      } catch (err) {
        console.error("Error loading initial data:", err);
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  // 2. Persistent Syncing
  useEffect(() => {
    if (isLoaded) {
      saveSourcesToDB(sources);
      localStorage.setItem('4you_advisor_messages', JSON.stringify(advisorMessages));
      localStorage.setItem('4you_repository_messages', JSON.stringify(repositoryMessages));
    }
  }, [sources, advisorMessages, repositoryMessages, isLoaded]);

  // UI Utilities
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputText]);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [advisorMessages, repositoryMessages, isTyping, scrollToBottom, activeView]);

  // Admin Functions
  const processFile = (file: File, category: SourceCategory) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      const isPdf = file.type === 'application/pdf';
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      let type = SourceType.TEXT;
      if (isPdf) type = SourceType.PDF;
      else if (isExcel) type = SourceType.EXCEL;
      
      const base64Content = (isPdf || isExcel) ? result.split(',')[1] : result;
      const newSource: SourceFile = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name.replace(/\.[^/.]+$/, ""), 
        type: type,
        category: category,
        content: base64Content,
        mimeType: file.type,
        selected: true,
        theme: 'cyan'
      };
      setSources(prev => [...prev, newSource]);
    };
    if (file.type === 'application/pdf' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, category: SourceCategory) => {
    const file = event.target.files?.[0];
    if (file) processFile(file, category);
    if (event.target) event.target.value = '';
  };

  const addExternalLink = (category: SourceCategory) => {
    const input = category === 'advisor' ? advLinkInput : repoLinkInput;
    if (!input.trim()) return;
    const newSource: SourceFile = {
      id: Math.random().toString(36).substr(2, 9),
      name: "رابط خارجي",
      type: SourceType.LINK,
      category: category,
      content: input,
      mimeType: 'text/url',
      selected: true,
      theme: 'cyan'
    };
    setSources(prev => [...prev, newSource]);
    category === 'advisor' ? setAdvLinkInput('') : setRepoLinkInput('');
  };

  const addManualText = (category: SourceCategory) => {
    const input = category === 'advisor' ? advManualText : repoManualText;
    if (!input.trim()) return;
    const newSource: SourceFile = {
      id: Math.random().toString(36).substr(2, 9),
      name: `نص مضاف (${new Date().toLocaleTimeString('ar-SA')})`,
      type: SourceType.TEXT,
      category: category,
      content: input,
      mimeType: 'text/plain',
      selected: true,
      theme: 'cyan'
    };
    setSources(prev => [...prev, newSource]);
    category === 'advisor' ? setAdvManualText('') : setRepoManualText('');
  };

  const updateSource = (id: string, name: string, theme: SourceTheme) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, name, theme } : s));
    setEditingSourceId(null);
  };

  const removeSource = (id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
    if (selectedRepoSource?.id === id) setSelectedRepoSource(null);
  };

  const clearAllData = async () => {
    if (window.confirm('هل أنت متأكد من مسح كافة سجلات المنصة؟')) {
      setSources([]);
      const welcomeAdv = { id: 'w-adv', role: 'assistant', text: 'تم تصفير الذاكرة.. كيف أقدر أساعدك الآن؟', timestamp: new Date() };
      const welcomeRepo = { id: 'w-repo', role: 'assistant', text: 'المكتبة الرقمية جاهزة من جديد.. تفضل بالاختيار من الساحة.', timestamp: new Date() };
      setAdvisorMessages([welcomeAdv as Message]);
      setRepositoryMessages([welcomeRepo as Message]);
      setSelectedRepoSource(null);
      await saveSourcesToDB([]);
    }
  };

  // Chat/Voice Functions
  const stopCurrentAudio = () => {
    if (currentAudioSourceRef.current) {
      try { currentAudioSourceRef.current.stop(); } catch (e) {} 
      currentAudioSourceRef.current = null;
    }
    setCurrentPlayingId(null);
    setIsPreparingAudio(null);
  };

  const handleToggleSpeak = async (msgId: string, text: string) => {
    if (currentPlayingId === msgId) return stopCurrentAudio();
    stopCurrentAudio();
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    setIsPreparingAudio(msgId);
    try {
      const audioData = await generateSpeech(text);
      if (audioData) {
        const ctx = audioContextRef.current;
        const decoded = decodePCM(audioData);
        const audioBuffer = await decodeAudioData(decoded, ctx, 24000, 1);
        setIsPreparingAudio(null);
        setCurrentPlayingId(msgId);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => setCurrentPlayingId(null);
        currentAudioSourceRef.current = source;
        source.start(0);
      } else setIsPreparingAudio(null);
    } catch (error) { setIsPreparingAudio(null); }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isTyping) return;
    const userText = inputText.trim();
    setInputText('');
    const userMessage: Message = { id: Date.now().toString(), role: 'user', text: userText, timestamp: new Date() };
    if (activeView === 'advisor') setAdvisorMessages(prev => [...prev, userMessage]);
    else setRepositoryMessages(prev => [...prev, userMessage]);
    setIsTyping(true);
    const assistantId = (Date.now() + 1).toString();
    const placeholder: Message = { id: assistantId, role: 'assistant', text: '', timestamp: new Date() };
    if (activeView === 'advisor') setAdvisorMessages(prev => [...prev, placeholder]);
    else setRepositoryMessages(prev => [...prev, placeholder]);

    try {
      let relevantSources = activeView === 'advisor' 
        ? sources.filter(s => s.selected && s.category === 'advisor')
        : (selectedRepoSource ? [selectedRepoSource] : sources.filter(s => s.selected && s.category === 'repository'));
      const history = activeView === 'advisor' ? advisorMessages : repositoryMessages;
      const stream = generateAssistantResponseStream(userText, relevantSources, history.concat(userMessage));
      let fullText = '';
      for await (const chunk of stream) {
        if (isTyping) setIsTyping(false);
        fullText += chunk;
        const sanitized = sanitizeText(fullText);
        if (activeView === 'advisor') setAdvisorMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: sanitized } : m));
        else setRepositoryMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: sanitized } : m));
      }
      if (isAutoSpeak) handleToggleSpeak(assistantId, sanitizeText(fullText));
    } catch (error) {
      const errTxt = "اعتذر منك عزيزي ... حدث خطأ غير متوقع.";
      if (activeView === 'advisor') setAdvisorMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: errTxt } : m));
      else setRepositoryMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: errTxt } : m));
    } finally { setIsTyping(false); }
  };

  const selectSourceForChat = (source: SourceFile) => {
    setSelectedRepoSource(source);
    const welcomeMsg: Message = {
      id: `w-${source.id}-${Date.now()}`,
      role: 'assistant',
      text: `يا أهلاً بك، تم تفعيل المصدر: "${source.name}".. كيف يمكن لمستشارك المعرفي خدمتك في تحليل محتوى هذا الملف؟\nممكن نتشرف باسمك؟`,
      timestamp: new Date()
    };
    setRepositoryMessages(prev => [...prev, welcomeMsg]);
  };

  const handleAdminLogin = () => {
    if (passwordInput === ADMIN_PASSWORD) { setIsAdmin(true); setShowAdminModal(false); setPasswordInput(''); }
    else alert('كلمة المرور غير صحيحة.');
  };

  const formatTime = (date: Date) => date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  const getSourceIcon = (type: SourceType, colorClass: string) => {
    const cls = `w-6 h-6 ${colorClass}`;
    switch (type) {
      case SourceType.PDF: return <Icons.FileText className={cls} />;
      case SourceType.EXCEL: return <Icons.Excel className={cls} />;
      case SourceType.LINK: return <Icons.Link className={cls} />;
      default: return <Icons.FileText className={cls} />;
    }
  };

  const getThemeClasses = (theme?: SourceTheme) => {
    switch (theme) {
      case 'royal': return 'hover:bg-purple-500/10 hover:border-purple-500/40 text-purple-400';
      case 'emerald': return 'hover:bg-emerald-500/10 hover:border-emerald-500/40 text-emerald-400';
      case 'sunset': return 'hover:bg-orange-500/10 hover:border-orange-500/40 text-orange-400';
      case 'midnight': return 'hover:bg-indigo-500/10 hover:border-indigo-500/40 text-indigo-400';
      default: return 'hover:bg-cyan-500/10 hover:border-cyan-500/40 text-cyan-400';
    }
  };

  return (
    <div className="flex h-screen overflow-hidden font-cairo text-white bg-[#020617]" dir="rtl">
      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45] lg:hidden" onClick={() => setIsSidebarOpen(false)}/>}

      <aside className={`fixed inset-y-0 right-0 z-50 w-72 md:w-80 premium-sidebar border-l border-white/5 transform transition-transform duration-500 lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-8 border-b border-white/5 text-center relative">
            <button onClick={() => setIsSidebarOpen(false)} className="absolute top-4 left-4 p-2 text-white/30 hover:text-white lg:hidden"><Icons.Close className="w-5 h-5" /></button>
            <div className="p-4 bg-white/5 inline-block rounded-3xl mb-4 border border-white/10">
               <Icons.Logo className="w-10 h-10 text-cyan-400" />
            </div>
            <h1 className="text-xl font-black text-white/90">4you Hub</h1>
            <p className="text-[9px] font-bold text-cyan-400/60 uppercase tracking-[0.2em]">Cognitive Advisor</p>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-8">
            <section className="space-y-2">
              <button onClick={() => { setActiveView('advisor'); setSelectedRepoSource(null); }} className={`w-full text-right p-4 rounded-2xl border transition-all ${activeView === 'advisor' ? 'bg-cyan-500/10 border-cyan-500/40' : 'border-transparent hover:bg-white/5'}`}>
                <div className="flex items-center gap-3">
                  <Icons.HumanAvatar className={`w-5 h-5 ${activeView === 'advisor' ? 'text-cyan-400' : 'text-white/20'}`} />
                  <h3 className={`text-[12px] font-black uppercase ${activeView === 'advisor' ? 'text-cyan-400' : 'text-white/20'}`}>مستشارك المعرفي</h3>
                </div>
              </button>
              <button onClick={() => { setActiveView('repository'); setSelectedRepoSource(null); }} className={`w-full text-right p-4 rounded-2xl border transition-all ${activeView === 'repository' ? 'bg-cyan-500/10 border-cyan-500/40' : 'border-transparent hover:bg-white/5'}`}>
                <div className="flex items-center gap-3">
                  <Icons.BI className={`w-5 h-5 ${activeView === 'repository' ? 'text-cyan-400' : 'text-white/20'}`} />
                  <h3 className={`text-[12px] font-black uppercase ${activeView === 'repository' ? 'text-cyan-400' : 'text-white/20'}`}>المكتبة الرقمية</h3>
                </div>
              </button>
            </section>

            {isAdmin && (
              <section className="space-y-4 animate-in fade-in slide-in-from-right-2">
                <div className="px-2 border-r-2 border-cyan-500">
                  <h4 className="text-[10px] font-black text-cyan-400 uppercase">لوحة التحكم</h4>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-1 flex">
                  <button onClick={() => setActiveAdminTab('advisor')} className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-all ${activeAdminTab === 'advisor' ? 'bg-cyan-500' : 'text-white/30'}`}>المستشار</button>
                  <button onClick={() => setActiveAdminTab('repository')} className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-all ${activeAdminTab === 'repository' ? 'bg-cyan-500' : 'text-white/30'}`}>المكتبة</button>
                </div>
                
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3 text-[11px]">
                  <div onClick={() => (activeAdminTab === 'advisor' ? advisorFileInputRef : repositoryFileInputRef).current?.click()} className="py-6 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center gap-2 cursor-pointer hover:border-cyan-500/40 transition-all">
                    <Icons.Upload className="w-5 h-5 text-cyan-400" />
                    <span>رفع ملف (PDF/Excel)</span>
                  </div>
                  <input type="file" className="hidden" ref={activeAdminTab === 'advisor' ? advisorFileInputRef : repositoryFileInputRef} onChange={(e) => handleFileUpload(e, activeAdminTab)} />
                  
                  <div className="flex gap-1">
                    <input type="text" value={activeAdminTab === 'advisor' ? advLinkInput : repoLinkInput} onChange={(e) => activeAdminTab === 'advisor' ? setAdvLinkInput(e.target.value) : setRepoLinkInput(e.target.value)} placeholder="رابط خارجي..." className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 outline-none text-[10px]" />
                    <button onClick={() => addExternalLink(activeAdminTab)} className="p-2 bg-cyan-500/20 text-cyan-400 rounded-lg"><Icons.Link className="w-4 h-4" /></button>
                  </div>
                  <button onClick={() => addManualText(activeAdminTab)} className="w-full py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] hover:bg-white/10">إضافة نص يدوياً</button>

                  <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                    {sources.filter(s => s.category === activeAdminTab).map(s => (
                      <div key={s.id} className="flex items-center justify-between p-2 bg-black/20 rounded-lg border border-white/5">
                        <span className="truncate flex-1 text-white/60">{s.name}</span>
                        <button onClick={() => removeSource(s.id)} className="text-red-500/40 hover:text-red-500"><Icons.Trash className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={clearAllData} className="w-full py-3 bg-red-900/10 text-red-400 border border-red-900/20 rounded-xl text-[10px] font-black hover:bg-red-900/20 transition-all">تصفير سجلات المنصة</button>
              </section>
            )}
          </div>

          <div className="p-6 border-t border-white/5 bg-black/40">
            <button onClick={() => isAdmin ? setIsAdmin(false) : setShowAdminModal(true)} className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[11px] font-black transition-all flex items-center justify-center gap-3">
              <Icons.Logo className={`w-4 h-4 ${isAdmin ? 'text-cyan-400 animate-pulse' : 'text-white/20'}`} />
              {isAdmin ? 'مغادرة الإدارة' : 'دخول الإدارة'}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative" onClick={() => isSidebarOpen && setIsSidebarOpen(false)}>
        <header className="h-16 md:h-20 bg-black/20 backdrop-blur-xl border-b border-white/5 px-5 md:px-12 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <button onClick={(e) => { e.stopPropagation(); setIsSidebarOpen(!isSidebarOpen); }} className="lg:hidden p-2 text-white/50 hover:text-cyan-400"><Icons.BI className="w-6 h-6" /></button>
            <div>
                <h2 className="text-sm md:text-xl font-black text-white/90">
                   {activeView === 'advisor' ? 'مستشارك المعرفي' : selectedRepoSource ? `تحليل: ${selectedRepoSource.name}` : 'المكتبة الرقمية'}
                </h2>
                <p className="text-[8px] md:text-[10px] font-bold text-cyan-400 uppercase opacity-80 tracking-widest">alhootah Advisor</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeView === 'repository' && selectedRepoSource && (
              <button onClick={() => setSelectedRepoSource(null)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[11px] font-bold text-cyan-400 hover:bg-cyan-500/10">العودة للساحة</button>
            )}
            <button onClick={() => setIsAutoSpeak(!isAutoSpeak)} className={`px-4 md:px-6 py-2 rounded-full text-[10px] md:text-[12px] font-black border transition-all ${isAutoSpeak ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400 shadow-lg' : 'bg-white/5 border-white/10 text-white/30'}`}>
              {isAutoSpeak ? 'النطق تلقائي' : 'تفعيل النطق'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar">
          <div className="max-w-4xl mx-auto h-full">
            {activeView === 'repository' && !selectedRepoSource ? (
              <div className="h-full flex flex-col items-center justify-center py-12 space-y-10 animate-in zoom-in-95">
                <div className="text-center space-y-4">
                  <h3 className="text-2xl md:text-4xl font-black text-white/90">ساحة المكتبة الرقمية</h3>
                  <p className="text-sm md:text-base text-white/30 max-w-lg mx-auto">اختر أحد المصادر المرفوعة لبدء جلسة تحليل مخصصة مع مستشارك المعرفي.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                  {sources.filter(s => s.category === 'repository').map(s => (
                    <button key={s.id} onClick={() => selectSourceForChat(s)} className={`group p-8 bg-white/5 border border-white/10 rounded-[2.5rem] text-right transition-all hover:scale-[1.05] ${getThemeClasses(s.theme)}`}>
                      <div className="mb-6 p-4 bg-white/5 inline-block rounded-2xl">{getSourceIcon(s.type, '')}</div>
                      <h4 className="text-[16px] font-black text-white truncate">{s.name}</h4>
                      <p className="text-[10px] font-bold opacity-30 uppercase mt-1">{s.type}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-10 pb-12">
                {(activeView === 'advisor' ? advisorMessages : repositoryMessages).map(m => (
                  <div key={m.id} className={`flex ${m.role === 'assistant' ? 'items-start gap-4' : 'flex-col items-end animate-in slide-in-from-bottom-2'}`}>
                    {m.role === 'assistant' && <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mt-1">{activeView === 'advisor' ? <Icons.HumanAvatar className="w-5 h-5 text-cyan-400" /> : <Icons.BI className="w-5 h-5 text-cyan-400" />}</div>}
                    <div className={`relative max-w-[90%] p-6 md:p-8 rounded-[2rem] ${m.role === 'assistant' ? 'royal-night-gradient border border-white/5 rounded-tr-none' : 'bg-cyan-500/10 border border-cyan-500/20 rounded-tl-none'}`}>
                      <p className="text-[14px] md:text-[17px] leading-relaxed font-medium text-white/90 whitespace-pre-wrap">{m.text}</p>
                      {m.role === 'assistant' && m.text && (
                        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
                          <button onClick={() => handleToggleSpeak(m.id, m.text)} className={`p-3 rounded-xl transition-all ${currentPlayingId === m.id ? 'bg-cyan-500 text-white' : 'bg-white/5 text-cyan-400'}`}>
                            {isPreparingAudio === m.id ? <div className="w-4 h-4 bg-cyan-400 animate-pulse rounded-full" /> : currentPlayingId === m.id ? <Icons.Close className="w-4 h-4" /> : <Icons.Speaker className="w-5 h-5" />}
                          </button>
                          <span className="text-[9px] font-black text-white/20 uppercase">{formatTime(m.timestamp)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isTyping && <div className="flex items-center gap-3 px-12 animate-pulse"><Icons.Logo className="w-5 h-5 text-cyan-500 animate-spin" /><span className="text-sm font-black text-white/40 italic">alhootah يكتب...</span></div>}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        <footer className="p-3 pb-6 md:p-14 z-10">
          <div className={`max-w-4xl mx-auto bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2rem] md:rounded-[3rem] p-1.5 md:p-3 flex gap-2 md:gap-4 items-end transition-all ${activeView === 'repository' && !selectedRepoSource ? 'opacity-20 pointer-events-none grayscale' : ''}`}>
            <button className="w-11 h-11 md:w-16 md:h-16 flex-shrink-0 rounded-[1.2rem] md:rounded-[2rem] flex items-center justify-center text-white/20 hover:text-cyan-400 hover:bg-white/5 transition-all"><Icons.Mic className="w-5 h-5 md:w-7 md:h-7" /></button>
            <textarea ref={textareaRef} className="flex-1 bg-transparent py-4 md:py-6 px-2 outline-none resize-none font-bold text-[14px] md:text-[18px] text-white placeholder:text-white/10 custom-scrollbar max-h-[140px]" placeholder={activeView === 'advisor' ? "تحدث مع المستشار المعرفي alhootah..." : selectedRepoSource ? `تحليل: ${selectedRepoSource.name}...` : "بانتظار اختيار المصدر..."} rows={1} value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} />
            <button onClick={() => handleSendMessage()} disabled={!inputText.trim() || isTyping} className={`w-11 h-11 md:w-16 md:h-16 flex-shrink-0 rounded-[1.2rem] md:rounded-[2rem] flex items-center justify-center triple-gradient-btn text-white transition-all ${(!inputText.trim() || isTyping) ? 'opacity-20 grayscale' : 'hover:scale-105 active:scale-95'}`}><Icons.Send className="w-5 h-5 md:w-7 md:h-7" /></button>
          </div>
          <p className="text-[10px] md:text-[12px] text-white/30 text-center mt-3 font-medium select-none">
            هذه أجوبة استرشادية من كتيب الأسئلة الشائعة الصادر من القابضة
          </p>
        </footer>
      </main>

      {showAdminModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-3xl p-6 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] w-full max-sm rounded-[3rem] shadow-2xl border border-white/5 overflow-hidden">
             <div className="royal-night-gradient p-10 text-center border-b border-white/5">
                <div className="w-20 h-20 bg-white/5 rounded-3xl mx-auto mb-6 flex items-center justify-center border border-white/10"><Icons.Logo className="w-10 h-10 text-cyan-400" /></div>
                <h2 className="text-2xl font-black text-white/90">بوابة الأمان</h2>
                <p className="text-[10px] text-white/30 uppercase tracking-[0.3em] mt-1">Management Access Only</p>
             </div>
             <div className="p-10 space-y-8">
                <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full p-6 bg-black/40 border border-white/10 rounded-2xl outline-none focus:border-cyan-500 text-center text-3xl font-black text-cyan-400" placeholder="••••" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()} />
                <div className="flex gap-3">
                  <button onClick={() => setShowAdminModal(false)} className="flex-1 py-4 bg-white/5 text-white/40 rounded-2xl font-bold text-xs uppercase">إلغاء</button>
                  <button onClick={handleAdminLogin} className="flex-[2] py-4 triple-gradient-btn text-white rounded-2xl font-black text-xs uppercase shadow-cyan-500/20 shadow-xl">تأكيد</button>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
