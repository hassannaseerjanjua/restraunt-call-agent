import { useState, useEffect, useRef } from 'react';
import { 
  Phone, PhoneOff, Mic, Volume2, Database, ShoppingBag, 
  History, User, MapPin, 
  Utensils, Calendar, X, Play, Pause, RefreshCw, CheckCircle2, ChevronRight
} from './icons';
import { VoiceManager } from './voice';

// Type definitions
interface MenuItem {
  id: number;
  name: string;
  price: number;
  is_available: boolean;
}

interface OrderItemInfo {
  id: number;
  name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface OrderInfo {
  id: number;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  total_price: number;
  status: string;
  created_at: string;
  items: OrderItemInfo[];
}

interface ChatPart {
  text?: string;
  functionCall?: {
    name: string;
    args: any;
  };
  functionResponse?: {
    name: string;
    response: {
      output: string;
    };
  };
}

interface ChatMessage {
  role: 'user' | 'model' | 'function';
  parts: ChatPart[];
}

interface CallInfo {
  id: string;
  transcript: ChatMessage[];
  recording_url: string | null;
  created_at: string;
}

// Global voice manager instance
const voiceManager = new VoiceManager();

export default function App() {
  const [activeTab, setActiveTab] = useState<'agent' | 'orders' | 'calls'>('agent');
  
  // Voice Agent State
  const [isInCall, setIsInCall] = useState(false);
  const [callState, setCallState] = useState<'idle' | 'listening' | 'speaking' | 'connecting'>('idle');
  const [callId, setCallId] = useState<string>('');
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  
  // Real-time parsed order state
  const [liveOrderItems, setLiveOrderItems] = useState<{ name: string; quantity: number; price?: number }[]>([]);
  const [liveOrderTotal, setLiveOrderTotal] = useState<number>(0);
  const [liveCustomer, setLiveCustomer] = useState<{ name: string; phone: string; address: string }>({
    name: '',
    phone: '',
    address: ''
  });
  const [isOrderConfirmed, setIsOrderConfirmed] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);

  // Dashboards Data State
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [calls, setCalls] = useState<CallInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Modals & Detailed View
  const [selectedCall, setSelectedCall] = useState<CallInfo | null>(null);
  const [currentlyPlayingAudio, setCurrentlyPlayingAudio] = useState<string | null>(null);

  // Neural AI Voices (Male & Female)
  const NEURAL_VOICES = [
    { id: 'ur-PK-AsadNeural', name: 'Asad (Urdu Pakistan • Male)', gender: 'Male' },
    { id: 'hi-IN-MadhurNeural', name: 'Madhur (Hindi/Urdu • Male)', gender: 'Male' },
    { id: 'ur-PK-UzmaNeural', name: 'Uzma (Urdu Pakistan • Female)', gender: 'Female' },
    { id: 'hi-IN-SwaraNeural', name: 'Swara (Hindi/Urdu • Female)', gender: 'Female' },
  ];

  // Available Voices State - Default to Asad (Urdu Male)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('ur-PK-AsadNeural');
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioPlayersRef = useRef<{ [key: string]: HTMLAudioElement }>({});

  // Sync state with VoiceManager
  useEffect(() => {
    voiceManager.onTranscriptChange = (text, isFinal) => {
      setLiveTranscript(text);
      if (isFinal) {
        setLiveTranscript('');
      }
    };

    voiceManager.onStateChange = (state) => {
      setCallState(state);
    };

    // Initialize with default male voice
    voiceManager.setSelectedVoice('ur-PK-AsadNeural');

    voiceManager.onSpeechEnd = async (text) => {
      if (!isInCall || !callId) return;
      
      // Call Backend Chat API
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            session_id: callId,
            message: text
          })
        });
        const data = await response.json();
        
        // Update local chat log
        setChatLog(data.transcript);
        
        // Speak response out loud
        voiceManager.speak(data.reply, () => {
          // Once speaking ends, start listening again if still in call
          if (voiceManager && isInCall) {
            voiceManager.startListening();
          }
        });

        // Parse transcript for order details
        parseOrderDetails(data.transcript);

      } catch (e) {
        console.error("Failed to post chat message", e);
      }
    };

    // Fetch initial static data
    fetchMenu();
    fetchOrders();
    fetchCalls();
  }, [isInCall, callId]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog, liveTranscript]);

  // Load available system voices
  useEffect(() => {
    const updateVoices = () => {
      if ('speechSynthesis' in window) {
        const voiceList = window.speechSynthesis.getVoices();
        setVoices(voiceList);
      }
    };

    updateVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  // Sync selected voice with VoiceManager
  useEffect(() => {
    if (selectedVoiceName) {
      voiceManager.setSelectedVoice(selectedVoiceName);
    }
  }, [selectedVoiceName]);

  // --- API FETCHERS ---

  const fetchMenu = async () => {
    try {
      const res = await fetch('/api/menu');
      const data = await res.json();
      setMenu(data);
    } catch (e) {
      console.error("Failed to fetch menu", e);
    }
  };

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      setOrders(data);
    } catch (e) {
      console.error("Failed to fetch orders", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCalls = async () => {
    try {
      const res = await fetch('/api/calls');
      const data = await res.json();
      setCalls(data);
    } catch (e) {
      console.error("Failed to fetch calls", e);
    }
  };

  // --- PARSE LIVE ORDER DETAILS FROM TRANSCRIPT ---

  const parseOrderDetails = (transcript: ChatMessage[]) => {
    let items: { name: string; quantity: number; price?: number }[] = [];
    let name = '';
    let phone = '';
    let address = '';
    let total = 0;
    let orderId: number | null = null;

    // Scan backwards or forwards to build the current state of tools
    for (const msg of transcript) {
      for (const part of msg.parts) {
        // Look at function calls
        if (part.functionCall) {
          const fc = part.functionCall;
          if (fc.name === 'calculate_order_price') {
            items = fc.args.items || [];
          } else if (fc.name === 'create_order') {
            name = fc.args.customer_name || '';
            phone = fc.args.customer_phone || '';
            address = fc.args.delivery_address || '';
            items = fc.args.items || [];
          }
        }
        
        // Look at function responses
        if (part.functionResponse) {
          const fr = part.functionResponse;
          const output = fr.response.output;
          
          if (fr.name === 'calculate_order_price' && output) {
            // Parse total from output text (e.g. "Total Bill: Rs. 900")
            const match = output.match(/Total Bill:\s*Rs\.\s*(\d+)/i);
            if (match && match[1]) {
              total = parseInt(match[1]);
            }
          }
          
          if (fr.name === 'create_order' && output) {
            const match = output.match(/Order\s*#(\d+)\s*has\s*been\s*created/i);
            if (match && match[1]) {
              orderId = parseInt(match[1]);
              setIsOrderConfirmed(true);
            }
          }
        }
      }
    }

    if (items.length > 0) {
      setLiveOrderItems(items);
    }
    if (total > 0) {
      setLiveOrderTotal(total);
    }
    if (name || phone || address) {
      setLiveCustomer({ name, phone, address });
    }
    if (orderId) {
      setCreatedOrderId(orderId);
    }
  };

  // --- CALL LIFECYCLE CONTROLS ---

  const startCall = async () => {
    const newCallId = `call_${uuid()}`;
    setCallId(newCallId);
    setIsInCall(true);
    setCallState('connecting');
    setChatLog([]);
    setLiveOrderItems([]);
    setLiveOrderTotal(0);
    setLiveCustomer({ name: '', phone: '', address: '' });
    setIsOrderConfirmed(false);
    setCreatedOrderId(null);

    // Start audio recording
    await voiceManager.startRecording();

    // Start ringtone
    voiceManager.startRingtone();

    // Greet Customer
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: newCallId,
          message: "[Start Call] (Greeting)"
        })
      });
      const data = await res.json();
      setChatLog(data.transcript);

      // Play Bhai's voice greeting
      voiceManager.speak(data.reply, () => {
        // Once done speaking, start listening for customer's voice
        if (voiceManager) {
          voiceManager.startListening();
        }
      });
    } catch (e) {
      console.error("Greeting call failed", e);
      voiceManager.stopRingtone();
      setCallState('idle');
      setIsInCall(false);
    }
  };

  const endCall = async () => {
    setIsInCall(false);
    setCallState('idle');
    voiceManager.stopRingtone();
    voiceManager.cancelSpeech();
    voiceManager.stopListening();
    
    // Stop recording and get audio blob
    const audioBlob = await voiceManager.stopRecording();
    
    if (audioBlob && callId) {
      setCallState('connecting'); // upload state indicator
      const recordingUrl = await voiceManager.uploadRecording(callId, audioBlob);
      console.log("Audio recording saved:", recordingUrl);
    }

    setCallState('idle');
    // Refresh backend dashboards
    fetchOrders();
    fetchCalls();
  };

  // Barge-in trigger
  const handleBargeIn = () => {
    voiceManager.cancelSpeech();
    voiceManager.startListening();
  };

  // Generate simple UUID helper
  const uuid = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // --- AUDIO PLAYBACK HELPERS ---

  const toggleAudio = (url: string) => {
    const fullUrl = url.startsWith('http') ? url : window.location.origin + url;
    let player = audioPlayersRef.current[url];

    if (!player) {
      player = new Audio(fullUrl);
      audioPlayersRef.current[url] = player;
      
      player.onended = () => {
        setCurrentlyPlayingAudio(null);
      };
    }

    if (currentlyPlayingAudio === url) {
      player.pause();
      setCurrentlyPlayingAudio(null);
    } else {
      // Pause any other active player
      if (currentlyPlayingAudio && audioPlayersRef.current[currentlyPlayingAudio]) {
        audioPlayersRef.current[currentlyPlayingAudio].pause();
      }
      player.play();
      setCurrentlyPlayingAudio(url);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 -left-1/4 w-96 h-96 bg-indigo-900/20 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute bottom-0 -right-1/4 w-96 h-96 bg-violet-900/20 rounded-full blur-3xl opacity-50"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-xl shadow-lg shadow-indigo-500/20 flex items-center justify-center">
            <Utensils className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              Karachi Bites
            </h1>
            <p className="text-xs text-slate-400 font-medium">Bhai Voice Agent Admin</p>
          </div>
        </div>

        <nav className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 gap-1.5">
          <button 
            onClick={() => setActiveTab('agent')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'agent' 
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/10' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Mic className="w-4 h-4" />
            Voice Agent
          </button>
          <button 
            onClick={() => { setActiveTab('orders'); fetchOrders(); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'orders' 
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/10' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Orders
          </button>
          <button 
            onClick={() => { setActiveTab('calls'); fetchCalls(); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'calls' 
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/10' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <History className="w-4 h-4" />
            Call History
          </button>
        </nav>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex-1 p-6 flex flex-col max-w-7xl w-full mx-auto overflow-hidden">
        
        {activeTab === 'agent' && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
            
            {/* Interactive Voice Screen */}
            <div className="lg:col-span-2 flex flex-col bg-slate-900/50 backdrop-blur-lg border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              
              {/* Call Control Panel */}
              <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    callState === 'listening' ? 'bg-emerald-500 animate-ping' :
                    callState === 'speaking' ? 'bg-sky-500 animate-pulse' :
                    callState === 'connecting' ? 'bg-amber-500 animate-spin' :
                    'bg-slate-600'
                  }`} />
                  <div>
                    <h2 className="text-sm font-bold capitalize text-slate-200">
                      {callState === 'idle' ? 'Disconnected' : 
                       callState === 'listening' ? 'Listening (Speak now)' : 
                       callState === 'speaking' ? 'Bhai is Replying' : 
                       'Connecting Session...'}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      <span className="font-semibold text-slate-500">Voice:</span>
                      <select
                        value={selectedVoiceName}
                        onChange={(e) => setSelectedVoiceName(e.target.value)}
                        className="bg-slate-950/85 border border-slate-800 text-slate-200 rounded-lg px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[220px] cursor-pointer"
                      >
                        <optgroup label="✨ Neural AI Voices (Default: Male)">
                          {NEURAL_VOICES.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </optgroup>
                        {voices.length > 0 && (
                          <optgroup label="System / Browser Voices">
                            {voices.map((v, i) => (
                              <option key={i} value={v.name}>
                                {v.name.replace("Microsoft", "MS").replace("Google", "G")} ({v.lang})
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {isInCall && callState === 'speaking' && (
                    <button 
                      onClick={handleBargeIn}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 text-slate-300 border border-slate-700 transition"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      Barge-in / Interrupt
                    </button>
                  )}
                  
                  <button
                    onClick={isInCall ? endCall : startCall}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
                      isInCall 
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/10 border border-rose-500/20' 
                        : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-600/10'
                    }`}
                  >
                    {isInCall ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                    {isInCall ? 'End Call' : 'Start Call'}
                  </button>
                </div>
              </div>

              {/* Chat Log View */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4 min-h-[300px]">
                {chatLog.length === 0 && !liveTranscript && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <div className="p-4 bg-slate-950 border border-slate-800 rounded-full mb-4 text-slate-500 relative">
                      <Mic className="w-8 h-8" />
                      {isInCall && (
                        <div className="absolute inset-0 rounded-full border border-indigo-500 animate-ping opacity-70"></div>
                      )}
                    </div>
                    <h3 className="text-slate-300 font-bold mb-1">
                      {isInCall ? 'Waiting for voice input...' : 'No Active Session'}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm">
                      {isInCall 
                        ? 'Bhai will respond automatically. Speak in Urdu or English. You can also click Barge-in to interrupt him.'
                        : 'Click "Start Call" to place an order at Karachi Bites using our conversational voice AI.'}
                    </p>
                  </div>
                )}

                {chatLog.map((msg, index) => {
                  // Filter and extract text parts to display
                  const textParts = msg.parts.filter(p => p.text);
                  const toolCallParts = msg.parts.filter(p => p.functionCall);
                  const toolResponseParts = msg.parts.filter(p => p.functionResponse);
                  
                  if (textParts.length === 0 && toolCallParts.length === 0 && toolResponseParts.length === 0) return null;

                  return (
                    <div key={index} className="space-y-2">
                      {/* Display Tool Executions in Timeline */}
                      {toolCallParts.map((tc, tcIdx) => (
                        <div key={`tc-${tcIdx}`} className="flex justify-center my-2">
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-indigo-950/40 border border-indigo-900/60 rounded-full text-xs font-semibold text-indigo-300">
                            <Database className="w-3.5 h-3.5" />
                            Database Tool Request: <span className="font-bold text-indigo-200">{tc.functionCall?.name}</span>
                          </span>
                        </div>
                      ))}
                      
                      {toolResponseParts.map((_tr, trIdx) => (
                        <div key={`tr-${trIdx}`} className="flex justify-center my-2">
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-900/80 border border-slate-800 rounded-full text-xs font-semibold text-slate-400">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            Tool Returned Success
                          </span>
                        </div>
                      ))}

                      {/* Display Text Bubbles */}
                      {textParts.map((part, pIdx) => {
                        const isUser = msg.role === 'user';
                        const isGreetingPrompt = isUser && (part.text?.includes("(Greeting)") || part.text === "START_CALL_GREETING");
                        
                        if (isGreetingPrompt) {
                          return (
                            <div key={`text-${pIdx}`} className="flex justify-center my-1">
                              <span className="px-3 py-0.5 bg-emerald-950/40 border border-emerald-800/50 rounded-full text-xs font-semibold text-emerald-400">
                                📞 Call Connected
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div 
                            key={`text-${pIdx}`} 
                            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-md leading-relaxed ${
                              isUser 
                                ? 'bg-indigo-600 text-white rounded-br-none' 
                                : 'bg-slate-850 border border-slate-700/60 text-slate-100 rounded-bl-none font-medium'
                            }`}>
                              {part.text}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Live STT Transcript Bubble */}
                {liveTranscript && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-none px-4 py-3 text-sm bg-indigo-750/70 border border-indigo-500/30 text-indigo-200 italic animate-pulse flex items-center gap-2">
                      <Mic className="w-3.5 h-3.5 animate-bounce" />
                      {liveTranscript}
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Pulse Visualizer Bar */}
              {isInCall && (
                <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-center gap-1.5">
                  {[...Array(12)].map((_, i) => (
                    <div 
                      key={i}
                      className={`w-1 rounded-full bg-indigo-500 transition-all duration-150 ${
                        callState === 'listening' ? 'h-3 animate-bounce' : 
                        callState === 'speaking' ? 'h-5 animate-pulse' : 'h-1.5'
                      }`}
                      style={{ animationDelay: `${i * 0.08}s` }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar real-time Order card */}
            <div className="flex flex-col gap-6">
              
              {/* Order Status Card */}
              <div className="bg-slate-900/50 backdrop-blur-lg border border-slate-800 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-bold text-slate-200">Live Order Extract</h3>
                  </div>
                  {isOrderConfirmed ? (
                    <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xxs font-extrabold rounded-full tracking-wider uppercase">
                      Placed
                    </span>
                  ) : liveOrderItems.length > 0 ? (
                    <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xxs font-extrabold rounded-full tracking-wider uppercase animate-pulse">
                      Pending Conf
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xxs font-extrabold rounded-full tracking-wider uppercase">
                      Empty
                    </span>
                  )}
                </div>

                {liveOrderItems.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                    <Utensils className="w-8 h-8 text-slate-700" />
                    <p className="text-xs">No items ordered yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Items List */}
                    <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                      {liveOrderItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-850">
                          <div>
                            <p className="text-sm font-semibold text-slate-200">{item.name}</p>
                            <p className="text-xxs text-slate-400">Qty: {item.quantity}</p>
                          </div>
                          {item.price && (
                            <p className="text-sm font-bold text-indigo-400">Rs. {item.price * item.quantity}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Total Summary */}
                    <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-400">Calculated Total</span>
                      <span className="text-lg font-black text-indigo-400">Rs. {liveOrderTotal}</span>
                    </div>

                    {/* Customer Info Card */}
                    <div className="bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl space-y-2">
                      <h4 className="text-xxs font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                        Delivery Details
                      </h4>
                      <div className="flex items-start gap-2 text-xs">
                        <User className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-slate-400">Customer Name</p>
                          <p className="font-semibold text-slate-200">{liveCustomer.name || 'Not collected'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 text-xs">
                        <Phone className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-slate-400">Phone Number</p>
                          <p className="font-semibold text-slate-200">{liveCustomer.phone || 'Not collected'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 text-xs">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-slate-400">Address</p>
                          <p className="font-semibold text-slate-200 line-clamp-2">{liveCustomer.address || 'Not collected'}</p>
                        </div>
                      </div>
                    </div>

                    {createdOrderId && (
                      <div className="p-3 bg-emerald-950/40 border border-emerald-900/60 rounded-xl text-center text-xs font-semibold text-emerald-400">
                        Success! Placed Order #{createdOrderId}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Menu Reference Card */}
              <div className="bg-slate-900/50 backdrop-blur-lg border border-slate-800 rounded-2xl p-5 shadow-xl flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800 flex-shrink-0">
                  <Database className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-slate-200">Karachi Bites Menu</h3>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {menu.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-slate-950/30 p-2 rounded-lg border border-slate-850 text-xs">
                      <span className="font-semibold text-slate-300">{item.name}</span>
                      <span className="font-bold text-indigo-400">Rs. {item.price}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Orders Dashboard Tab */}
        {activeTab === 'orders' && (
          <div className="flex-1 bg-slate-900/50 backdrop-blur-lg border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6 flex-shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-slate-200">Placed Orders (PostgreSQL)</h2>
              </div>
              <button 
                onClick={fetchOrders}
                className="p-2 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 transition"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
            ) : orders.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 p-8">
                <ShoppingBag className="w-12 h-12 text-slate-850 mb-3" />
                <h3 className="text-slate-350 font-bold mb-1">No Orders Found</h3>
                <p className="text-xs text-slate-500 max-w-sm">Place an order using the Voice Agent call tab to see them created in real time in SQLite.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {orders.map((order) => (
                    <div key={order.id} className="bg-slate-950/60 border border-slate-850 hover:border-slate-800 transition rounded-xl p-5 space-y-4">
                      
                      {/* Header */}
                      <div className="flex justify-between items-start pb-3 border-b border-slate-900">
                        <div>
                          <h3 className="font-extrabold text-indigo-400 text-sm">Order #{order.id}</h3>
                          <p className="text-xxs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            {new Date(order.created_at).toLocaleString()}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xxs font-extrabold rounded-full uppercase tracking-wider">
                          {order.status}
                        </span>
                      </div>

                      {/* Customer info */}
                      <div className="grid grid-cols-2 gap-3 text-xs border-b border-slate-900 pb-3">
                        <div>
                          <p className="text-slate-500 text-xxs uppercase tracking-wider font-semibold">Customer</p>
                          <p className="font-bold text-slate-200 mt-0.5">{order.customer_name || 'N/A'}</p>
                          <p className="text-slate-400 text-xxs">{order.customer_phone || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xxs uppercase tracking-wider font-semibold">Delivery Address</p>
                          <p className="font-bold text-slate-200 mt-0.5 truncate max-w-[200px]" title={order.delivery_address}>
                            {order.delivery_address || 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Items */}
                      <div className="space-y-2">
                        <p className="text-slate-500 text-xxs uppercase tracking-wider font-semibold">Items List</p>
                        <div className="space-y-1.5 max-h-24 overflow-y-auto">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex justify-between text-xs text-slate-300 bg-slate-900/40 p-2 rounded-lg border border-slate-850">
                              <span>{item.name} <span className="text-slate-500">x{item.quantity}</span></span>
                              <span className="font-bold text-indigo-400">Rs. {item.subtotal}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Total */}
                      <div className="flex justify-between items-center pt-2 text-sm">
                        <span className="font-semibold text-slate-400">Total Price</span>
                        <span className="font-black text-indigo-400 text-base">Rs. {order.total_price}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Call History Dashboard Tab */}
        {activeTab === 'calls' && (
          <div className="flex-1 bg-slate-900/50 backdrop-blur-lg border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6 flex-shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-slate-200">Call History & Playbacks</h2>
              </div>
              <button 
                onClick={fetchCalls}
                className="p-2 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 transition"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {calls.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 p-8">
                <History className="w-12 h-12 text-slate-850 mb-3" />
                <h3 className="text-slate-350 font-bold mb-1">No Call Logs Found</h3>
                <p className="text-xs text-slate-500 max-w-sm">Place a voice call in the Voice Agent tab to see call transcript history and audio recordings generated here.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {calls.map((call) => (
                  <div key={call.id} className="bg-slate-950/60 border border-slate-850 hover:border-slate-800 p-4 rounded-xl flex items-center justify-between gap-4 transition">
                    
                    {/* Log details */}
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-center">
                        <Mic className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wide">Call ID: {call.id.slice(0, 12)}...</h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(call.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Actions / Playback */}
                    <div className="flex items-center gap-3">
                      {call.recording_url && (
                        <button
                          onClick={() => toggleAudio(call.recording_url!)}
                          className={`flex items-center justify-center p-2.5 rounded-full border text-xs transition ${
                            currentlyPlayingAudio === call.recording_url
                              ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500'
                              : 'bg-indigo-950/40 hover:bg-indigo-900 text-indigo-300 border-indigo-900/60'
                          }`}
                          title={currentlyPlayingAudio === call.recording_url ? 'Pause Audio' : 'Play Call Recording'}
                        >
                          {currentlyPlayingAudio === call.recording_url ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                      )}

                      <button
                        onClick={() => setSelectedCall(call)}
                        className="px-4 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-350 text-xs font-semibold rounded-xl flex items-center gap-1 transition"
                      >
                        View Transcript
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Transcript View Modal */}
      {selectedCall && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
              <div>
                <h3 className="font-bold text-slate-200">Session Transcript</h3>
                <p className="text-xxs text-slate-500 mt-0.5">Session ID: {selectedCall.id}</p>
              </div>
              <button 
                onClick={() => setSelectedCall(null)}
                className="p-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-400 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {selectedCall.transcript.map((msg, index) => {
                const isUser = msg.role === 'user';
                const textParts = msg.parts.filter(p => p.text);
                const toolCalls = msg.parts.filter(p => p.functionCall);
                
                return (
                  <div key={index} className="space-y-1">
                    {/* Tool details */}
                    {toolCalls.map((tc, tcIdx) => (
                      <div key={tcIdx} className="flex justify-center my-1.5">
                        <span className="px-2.5 py-0.5 bg-indigo-950/60 border border-indigo-900/40 rounded-full text-xxs font-semibold text-indigo-400">
                          🛠️ System tool: {tc.functionCall?.name}
                        </span>
                      </div>
                    ))}

                    {/* Bubbles */}
                    {textParts.map((part, pIdx) => {
                      const isGreetingPrompt = isUser && (part.text?.includes("(Greeting)") || part.text === "START_CALL_GREETING");
                      if (isGreetingPrompt) {
                        return (
                          <div key={pIdx} className="flex justify-center my-1.5">
                            <span className="px-2.5 py-0.5 bg-emerald-950/60 border border-emerald-900/40 rounded-full text-xxs font-semibold text-emerald-400">
                              📞 Call Connected
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div key={pIdx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow ${
                            isUser 
                              ? 'bg-indigo-650 text-white rounded-br-none' 
                              : 'bg-slate-850 text-slate-100 rounded-bl-none border border-slate-800'
                          }`}>
                            {part.text}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950 py-4 text-center text-slate-600 text-xxs font-medium tracking-wide">
        &copy; {new Date().getFullYear()} Karachi Bites. Built in Planning Mode with Bhai Voice Assistant.
      </footer>

    </div>
  );
}
