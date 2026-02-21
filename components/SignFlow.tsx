/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { validateSignGesture } from '../services/geminiService';
import { SignLesson, SignValidation, DebugInfo, Language } from '../types';
import { ALPHABET_LESSONS } from '../src/constants/lessons';
import { 
  Camera, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  ChevronLeft, 
  Info, 
  Loader2, 
  Sparkles,
  RefreshCw,
  Hand,
  Languages,
  User,
  Gamepad2,
  Keyboard,
  Trophy
} from 'lucide-react';

const LESSONS: SignLesson[] = [
  ...ALPHABET_LESSONS.slice(0, 5), // Use first 5 letters as intro
  { 
    id: 'hello', 
    label: { en: 'Hello', es: 'Hola' }, 
    description: { 
      en: 'Place hand at temple and move it away, like a salute.',
      es: 'Coloca la mano en la sien y aléjala, como un saludo.'
    },
    imageUrl: '/spainma.gif'
  },
];

const SignFlow: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [language, setLanguage] = useState<Language>(() => (sessionStorage.getItem('signflow_lang') as Language) || 'en');
  const [currentLessonIdx, setCurrentLessonIdx] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<SignValidation | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [handsDetectedCount, setHandsDetectedCount] = useState(0);
  const [autoValidate, setAutoValidate] = useState(true);
  const [isBlurEnabled, setIsBlurEnabled] = useState(true);
  const [blurAmount, setBlurAmount] = useState(15);
  const blurAmountRef = useRef(blurAmount);
  const isBlurEnabledRef = useRef(isBlurEnabled);

  // Game Mode State
  const [isGameMode, setIsGameMode] = useState(false);
  const [gameName, setGameName] = useState('');
  const [gameCharIdx, setGameCharIdx] = useState(0);
  const [showGameSuccess, setShowGameSuccess] = useState(false);

  // Sync blur settings to refs for use in MediaPipe callback
  useEffect(() => {
    blurAmountRef.current = blurAmount;
    isBlurEnabledRef.current = isBlurEnabled;
  }, [blurAmount, isBlurEnabled]);

  const currentLesson = isGameMode 
    ? ALPHABET_LESSONS.find(l => l.id === gameName[gameCharIdx]?.toLowerCase()) || ALPHABET_LESSONS[0]
    : LESSONS[currentLessonIdx];

  const lastValidationTime = useRef<number>(0);
  const handLandmarksRef = useRef<any[]>([]);

  const handleValidate = useCallback(async () => {
    if (!canvasRef.current || isValidating) return;

    setIsValidating(true);
    
    try {
      const screenshot = canvasRef.current.toDataURL("image/jpeg", 0.6);
      const response = await validateSignGesture(screenshot, currentLesson, language);
      
      setValidationResult(response.validation);
      setDebugInfo(response.debug);
      lastValidationTime.current = Date.now();

      // Game Logic: Advance if correct
      if (response.validation.isValid) {
        if (isGameMode) {
          if (gameCharIdx < gameName.length - 1) {
            setTimeout(() => {
              setGameCharIdx(prev => prev + 1);
              setValidationResult(null);
            }, 2000);
          } else {
            setShowGameSuccess(true);
          }
        } else {
          // Regular Lesson Mode: Advance to next lesson
          setTimeout(() => {
            setCurrentLessonIdx((prev) => (prev + 1) % LESSONS.length);
            setValidationResult(null);
          }, 2000);
        }
      }
    } catch (error) {
      console.error("Validation error:", error);
    } finally {
      setIsValidating(false);
    }
  }, [currentLesson, language, isValidating, isGameMode, gameName, gameCharIdx]);

  // Real-time validation loop
  useEffect(() => {
    if (!autoValidate || handsDetectedCount === 0 || isValidating) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastValidationTime.current > 3000) { // Validate every 3 seconds
        handleValidate();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [autoValidate, handsDetectedCount, isValidating, handleValidate]);

  const nextLesson = () => {
    setCurrentLessonIdx((prev) => (prev + 1) % LESSONS.length);
    setValidationResult(null);
  };

  const prevLesson = () => {
    setCurrentLessonIdx((prev) => (prev - 1 + LESSONS.length) % LESSONS.length);
    setValidationResult(null);
  };

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'es' : 'en';
    setLanguage(newLang);
    sessionStorage.setItem('signflow_lang', newLang);
    setValidationResult(null);
  };

  const selectLanguage = (lang: Language) => {
    setLanguage(lang);
    sessionStorage.setItem('signflow_lang', lang);
    setShowWelcome(false);
  };

  useEffect(() => {
    // Don't initialize until the welcome screen is dismissed and DOM refs are available
    if (showWelcome) return;
    if (!videoRef.current || !canvasRef.current || !containerRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let camera: any = null;
    let hands: any = null;
    let selfieSegmentation: any = null;
    let isDestroyed = false;

    // Offscreen canvas for blur processing
    const blurCanvas = document.createElement('canvas');
    const blurCtx = blurCanvas.getContext('2d');

    // Reset loading state for fresh initialization
    setLoading(true);
    setCameraError(null);

    // Safety timeout for loading state
    const loadingTimeout = setTimeout(() => {
      if (!isDestroyed) {
        setLoading(false);
        //if (!cameraError && handsDetectedCount === 0) {
          console.warn("Initialization timeout reached");
        //}
      }
    }, 15000); // 15 seconds safety timeout

    const onResults = (results: any) => {
      if (loading) setLoading(false);
      
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        blurCanvas.width = canvas.width;
        blurCanvas.height = canvas.height;
      }

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // --- Background Blur Logic ---
      if (results.segmentationMask && isBlurEnabledRef.current && blurAmountRef.current > 0) {
        // 1. Prepare sharp person on offscreen canvas
        if (blurCtx) {
          blurCtx.save();
          blurCtx.clearRect(0, 0, blurCanvas.width, blurCanvas.height);
          blurCtx.drawImage(results.image, 0, 0, blurCanvas.width, blurCanvas.height);
          blurCtx.globalCompositeOperation = 'destination-in';
          blurCtx.drawImage(results.segmentationMask, 0, 0, blurCanvas.width, blurCanvas.height);
          blurCtx.restore();
        }

        // 2. Draw blurred background on main canvas
        ctx.filter = `blur(${blurAmountRef.current}px)`;
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';

        // 3. Draw sharp person on top
        ctx.drawImage(blurCanvas, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      }

      // --- Draw Hand Landmarks from Ref ---
      if (handLandmarksRef.current.length > 0) {
        for (const landmarks of handLandmarksRef.current) {
          if (window.drawConnectors && window.drawLandmarks) {
            window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
              color: '#10b981', 
              lineWidth: 2
            });
            window.drawLandmarks(ctx, landmarks, {
              color: '#ffffff', 
              lineWidth: 1, 
              radius: 3
            });
          }
        }
      }
      
      ctx.restore();
    };

    const onHandResults = (results: any) => {
      if (results.multiHandLandmarks) {
        handLandmarksRef.current = results.multiHandLandmarks;
        setHandsDetectedCount(results.multiHandLandmarks.length);
      } else {
        handLandmarksRef.current = [];
        setHandsDetectedCount(0);
      }
    };

    if (window.Hands && window.SelfieSegmentation) {
      hands = new window.Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      hands.setOptions({
        maxNumHands: 2, // Support both hands
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      hands.onResults(onHandResults);

      selfieSegmentation = new window.SelfieSegmentation({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
      });
      selfieSegmentation.setOptions({
        modelSelection: 1,
      });
      selfieSegmentation.onResults(onResults);
      
      if (window.Camera) {
        camera = new window.Camera(video, {
          onFrame: async () => {
            if (isDestroyed || !videoRef.current) return;
            
            try {
              if (selfieSegmentation) await selfieSegmentation.send({ image: videoRef.current });
              if (isDestroyed) return;
              if (hands) await hands.send({ image: videoRef.current });
            } catch (e) {
              console.warn("MediaPipe send error (likely during cleanup):", e);
            }
          },
          width: 640,
          height: 480,
        });
        
        camera.start().catch((err: any) => {
          console.error("Camera start error:", err);
          setCameraError(err.message || "Failed to start camera");
          setLoading(false);
        });
      }
    } else {
      setCameraError("MediaPipe libraries not loaded");
      setLoading(false);
    }

    return () => {
      isDestroyed = true;
      clearTimeout(loadingTimeout);
      if (camera) camera.stop();
      if (hands) {
        hands.onResults(() => {}); // Clear callback
        hands.close();
      }
      if (selfieSegmentation) {
        selfieSegmentation.onResults(() => {}); // Clear callback
        selfieSegmentation.close();
      }
    };
  }, [showWelcome]);

  const t = {
    en: {
      subtitle: 'Interactive Sign Language Learning',
      currentLesson: 'Current Lesson',
      aiFeedback: 'AI Feedback',
      positionHand: 'Position your hands in front of the camera.',
      analyzing: 'Analyzing gesture...',
      excellent: 'Excellent!',
      keepTrying: 'Keep Trying',
      tips: 'Tips',
      handsDetected: (count: number) => `${count} HAND${count !== 1 ? 'S' : '' } DETECTED`,
      noHandsDetected: 'NO HANDS DETECTED',
      validate: 'Validate Gesture',
      validating: 'Validating...',
      next: 'Next Lesson',
      autoValidate: 'Auto-Validate',
      developer: 'Developer Eduardo Arana 2026',
      reference: 'Reference',
      blur: 'Background Blur',
      gameMode: 'Name Game',
      enterName: 'Enter your name',
      startGame: 'Start Game',
      spelling: 'Spelling',
      congrats: 'Congratulations!',
      finishedName: 'You spelled your name correctly!',
      playAgain: 'Play Again',
      backToLessons: 'Back to Lessons',
      cameraNotFound: 'Camera not found. Please ensure your webcam is connected and permissions are granted.',
      cameraError: 'Camera Error',
      welcomeTitle: 'Welcome to SignFlow',
      welcomeDesc: 'Master American Sign Language with real-time AI feedback. Choose your language to begin.',
      startLearning: 'Start Learning',
      selectLang: 'Select Language'
    },
    es: {
      subtitle: 'Aprendizaje Interactivo de Lengua de Señas',
      currentLesson: 'Lección Actual',
      aiFeedback: 'Retroalimentación IA',
      positionHand: 'Coloca tus manos frente a la cámara.',
      analyzing: 'Analizando gesto...',
      excellent: '¡Excelente!',
      keepTrying: 'Sigue intentando',
      tips: 'Consejos',
      handsDetected: (count: number) => `${count} MANO${count !== 1 ? 'S' : '' } DETECTADA${count !== 1 ? 'S' : '' }`,
      noHandsDetected: 'MANOS NO DETECTADAS',
      validate: 'Validar Gesto',
      validating: 'Validando...',
      next: 'Siguiente Lección',
      autoValidate: 'Auto-Validar',
      developer: 'Desarrollador Eduardo Arana 2026',
      reference: 'Referencia',
      blur: 'Desenfoque de Fondo',
      gameMode: 'Juego del Nombre',
      enterName: 'Ingresa tu nombre',
      startGame: 'Empezar Juego',
      spelling: 'Deletreando',
      congrats: '¡Felicidades!',
      finishedName: '¡Deletreaste tu nombre correctamente!',
      playAgain: 'Jugar de Nuevo',
      backToLessons: 'Volver a Lecciones',
      cameraNotFound: 'Cámara no encontrada. Por favor asegúrate de que tu webcam esté conectada y los permisos concedidos.',
      cameraError: 'Error de Cámara',
      welcomeTitle: 'Bienvenido a SignFlow',
      welcomeDesc: 'Domina el Lenguaje de Señas con retroalimentación de IA en tiempo real. Elige tu idioma para comenzar.',
      startLearning: 'Empezar a Aprender',
      selectLang: 'Seleccionar Idioma'
    }
  }[language];

  if (showWelcome) {
    return (
      <div className="h-screen w-full bg-[#050505] text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-xl w-full space-y-12 text-center animate-in fade-in zoom-in duration-700">
          <div className="space-y-6">
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(16,185,129,0.1)]">
              <Sparkles className="w-10 h-10 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h1 className="text-5xl font-black tracking-tighter italic uppercase">SignFlow</h1>
              <p className="text-white/40 text-xs tracking-[0.3em] uppercase">{(t as any).subtitle}</p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-white/60 text-lg leading-relaxed max-w-md mx-auto">
              {(t as any).welcomeDesc}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => selectLanguage('en')}
              className={`p-4 rounded-xl border transition-all duration-300 flex flex-col items-center gap-2 ${language === 'en' ? 'bg-emerald-500 border-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'bg-white/5 border-white/10 hover:border-white/30'}`}
            >
              <span className="text-xl font-bold">English</span>
              <span className="text-[9px] uppercase tracking-widest opacity-50">USA / UK</span>
            </button>
            <button 
              onClick={() => selectLanguage('es')}
              className={`p-4 rounded-xl border transition-all duration-300 flex flex-col items-center gap-2 ${language === 'es' ? 'bg-emerald-500 border-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'bg-white/5 border-white/10 hover:border-white/30'}`}
            >
              <span className="text-xl font-bold">Español</span>
              <span className="text-[9px] uppercase tracking-widest opacity-50">Latam / ES</span>
            </button>
          </div>

          <div className="pt-4">
            <button 
              onClick={() => setShowWelcome(false)}
              className="w-full py-3 bg-white text-black rounded-xl font-bold uppercase tracking-widest hover:scale-[1.01] active:scale-[0.99] transition-all text-sm"
            >
              {(t as any).startLearning}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#050505] text-white font-sans overflow-hidden">
      
      {/* Sidebar - Lesson Info */}
      <div className="w-full lg:w-[400px] flex flex-col border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0a0a0a] z-10">
        <div className="p-8 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-emerald-500" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">SignFlow</h1>
            </div>
            <p className="text-white/50 text-[10px] uppercase tracking-wider">{t.subtitle}</p>
          </div>
          
          <button 
            onClick={toggleLanguage}
            className="p-2 rounded-lg glass hover:bg-white/10 transition-colors flex items-center gap-2 text-xs font-bold"
          >
            <Languages className="w-4 h-4" />
            {language.toUpperCase()}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* Mode Switcher */}
          <div className="flex p-1 bg-white/5 rounded-xl border border-white/10">
            <button 
              onClick={() => { setIsGameMode(false); setValidationResult(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${!isGameMode ? 'bg-emerald-500 text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
            >
              <Hand className="w-4 h-4" />
              {t.currentLesson}
            </button>
            <button 
              onClick={() => { setIsGameMode(true); setValidationResult(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${isGameMode ? 'bg-emerald-500 text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
            >
              <Gamepad2 className="w-4 h-4" />
              {t.gameMode}
            </button>
          </div>

          {/* Game Mode Setup */}
          {isGameMode && !gameName && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-semibold text-white/30">
                <Keyboard className="w-3 h-3" /> {t.enterName}
              </div>
              <div className="space-y-3">
                <input 
                  type="text" 
                  placeholder="e.g. EDUARDO"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors uppercase"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val) {
                        setGameName(val);
                        setGameCharIdx(0);
                        setShowGameSuccess(false);
                      }
                    }
                  }}
                />
                <p className="text-[10px] text-white/30 italic">Press Enter to start</p>
              </div>
            </div>
          )}

          {/* Game Success State */}
          {isGameMode && showGameSuccess && (
            <div className="p-8 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-4 animate-in zoom-in duration-500">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                <Trophy className="w-8 h-8 text-emerald-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-emerald-500">{t.congrats}</h3>
                <p className="text-sm text-white/60">{t.finishedName}</p>
              </div>
              <button 
                onClick={() => { setGameName(''); setGameCharIdx(0); setShowGameSuccess(false); }}
                className="w-full py-3 bg-emerald-500 text-black rounded-xl font-bold text-sm hover:scale-105 transition-transform"
              >
                {t.playAgain}
              </button>
            </div>
          )}

          {/* Reference Image Section */}
          {(!isGameMode || (gameName && !showGameSuccess)) && (
            <div className="space-y-3 flex flex-col items-center">
              <div className="w-full flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/30">
                  {isGameMode ? `${t.spelling}: ${gameName}` : t.reference}
                </span>
              </div>
              <div className="w-[200px] h-[200px] rounded-full overflow-hidden bg-white/5 border border-white/10 relative group shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                <img 
                  src={currentLesson.imageUrl} 
                  alt={currentLesson.label[language]}
                  className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                
                {isGameMode && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1">
                    {gameName.split('').map((char, i) => (
                      <div 
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${i === gameCharIdx ? 'bg-emerald-500' : i < gameCharIdx ? 'bg-emerald-500/40' : 'bg-white/10'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <h3 className="text-xl font-black tracking-tighter text-emerald-500 mt-2">
                {isGameMode ? gameName[gameCharIdx]?.toUpperCase() : currentLesson.label[language]}
              </h3>
            </div>
          )}

          {/* Controls Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/30">{t.blur}</span>
              <button 
                onClick={() => setIsBlurEnabled(!isBlurEnabled)}
                className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${isBlurEnabled ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white/5 text-white/30'}`}
              >
                {isBlurEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            {isBlurEnabled && (
              <input 
                type="range" 
                min="0" 
                max="30" 
                value={blurAmount} 
                onChange={(e) => setBlurAmount(parseInt(e.target.value))}
                className="w-full accent-emerald-500"
              />
            )}
          </div>

          {/* Current Lesson Details */}
          {(!isGameMode || (gameName && !showGameSuccess)) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/30">
                  {isGameMode ? `${t.spelling} ${gameCharIdx + 1}/${gameName.length}` : t.currentLesson}
                </span>
                {!isGameMode && (
                  <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                    {currentLessonIdx + 1} / {LESSONS.length}
                  </span>
                )}
              </div>
              
              <p className="text-white/60 leading-relaxed text-sm">
                {currentLesson.description[language]}
              </p>

              {!isGameMode && (
                <div className="flex items-center gap-2 pt-2">
                  <button 
                    onClick={prevLesson}
                    className="p-3 rounded-xl glass hover:bg-white/10 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={nextLesson}
                    className="flex-1 p-3 rounded-xl glass hover:bg-white/10 transition-colors flex items-center justify-center gap-2 font-medium text-sm"
                  >
                    {t.next} <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Feedback Panel */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/30">{t.aiFeedback}</span>
              <button 
                onClick={() => setAutoValidate(!autoValidate)}
                className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${autoValidate ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white/5 text-white/30'}`}
              >
                {t.autoValidate}: {autoValidate ? 'ON' : 'OFF'}
              </button>
            </div>
            
            {handsDetectedCount === 0 && !isValidating && (
              <div className="p-6 rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                  <Hand className="w-6 h-6 text-white/20" />
                </div>
                <p className="text-xs text-white/40">{t.positionHand}</p>
              </div>
            )}

            {isValidating && (
              <div className="p-8 rounded-2xl glass neon-border flex flex-col items-center justify-center text-center space-y-4 animate-pulse">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                <p className="text-sm font-medium">{t.analyzing}</p>
              </div>
            )}

            {validationResult && (
              <div className={`p-6 rounded-2xl border ${validationResult.isValid ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-orange-500/30 bg-orange-500/5'} space-y-4 transition-all duration-500`}>
                <div className="flex items-center gap-3">
                  {validationResult.isValid ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-orange-500" />
                  )}
                  <span className="font-bold text-lg">
                    {validationResult.isValid ? t.excellent : t.keepTrying}
                  </span>
                  <span className="ml-auto text-xs font-mono opacity-50">
                    {Math.round(validationResult.confidence * 100)}%
                  </span>
                </div>
                
                <p className="text-sm text-white/80 leading-relaxed">
                  {validationResult.feedback}
                </p>

                {validationResult.suggestions.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-white/30">
                      <Info className="w-3 h-3" /> {t.tips}
                    </div>
                    <ul className="space-y-1">
                      {validationResult.suggestions.map((s, i) => (
                        <li key={i} className="text-xs text-white/60 flex items-start gap-2">
                          <span className="text-emerald-500 mt-1">•</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Credits */}
        <div className="p-6 border-t border-white/10 bg-black/40">
          <div className="flex items-center justify-between text-[9px] font-mono text-white/30">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${handsDetectedCount > 0 ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500'}`} />
              {handsDetectedCount > 0 ? t.handsDetected(handsDetectedCount) : t.noHandsDetected}
            </div>
            <div className="flex items-center gap-2">
              <User className="w-3 h-3" />
              {t.developer}
            </div>
          </div>
        </div>
      </div>

      {/* Main Viewport - Camera */}
      <div ref={containerRef} className="flex-1 relative bg-black flex items-center justify-center">
        <video ref={videoRef} className="hidden" playsInline />
        
        <div className="relative w-full h-full max-w-[1280px] max-h-[720px] aspect-video overflow-hidden group">
          <canvas ref={canvasRef} className="w-full h-full object-cover transform scale-x-[-1]" />
          
          <div className="absolute inset-0 pointer-events-none border-[20px] border-black/20" />
          
          <div className="absolute top-8 left-8 w-12 h-12 border-t-2 border-l-2 border-white/20" />
          <div className="absolute top-8 right-8 w-12 h-12 border-t-2 border-r-2 border-white/20" />
          <div className="absolute bottom-8 left-8 w-12 h-12 border-b-2 border-l-2 border-white/20" />
          <div className="absolute bottom-8 right-8 w-12 h-12 border-b-2 border-r-2 border-white/20" />

          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-auto">
            <button
              onClick={handleValidate}
              disabled={isValidating || handsDetectedCount === 0}
              className={`
                group relative px-6 py-3 rounded-xl font-bold text-base tracking-tight transition-all duration-300
                ${isValidating || handsDetectedCount === 0 
                  ? 'bg-white/5 text-white/20 cursor-not-allowed' 
                  : 'bg-emerald-500 text-black hover:scale-105 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-95'}
              `}
            >
              <div className="flex items-center gap-2">
                {isValidating ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Camera className="w-5 h-5" />
                )}
                {isValidating ? t.validating : t.validate}
              </div>
            </button>
          </div>

          {handsDetectedCount === 0 && !loading && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-red-500/20 backdrop-blur-md border border-red-500/50 px-4 py-2 rounded-full flex items-center gap-2 text-xs font-bold text-red-400 animate-bounce">
              <AlertCircle className="w-4 h-4" />
              {language === 'en' ? 'POSITION HANDS IN FRAME' : 'POSICIONA TUS MANOS EN EL CUADRO'}
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 bg-black flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
              <p className="text-white/40 font-mono text-sm tracking-widest uppercase">Initializing Neural Engine</p>
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-8 text-center space-y-6 z-50">
              <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-red-500" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-2xl font-bold text-red-500">{(t as any).cameraError}</h3>
                <p className="text-white/60 text-sm">{(t as any).cameraNotFound}</p>
                <p className="text-white/20 text-[10px] font-mono mt-4">Error: {cameraError}</p>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors flex items-center gap-2 text-sm font-bold"
              >
                <RefreshCw className="w-4 h-4" />
                {language === 'en' ? 'Retry Connection' : 'Reintentar Conexión'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignFlow;
