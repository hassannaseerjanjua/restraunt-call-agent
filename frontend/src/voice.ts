// Web Speech Recognition types
interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

const customWindow = window as unknown as IWindow;
const SpeechRecognition = customWindow.SpeechRecognition || customWindow.webkitSpeechRecognition;

export class VoiceManager {
  private recognition: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private isSpeaking = false;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private selectedVoiceName: string | null = null;

  public setSelectedVoice(voiceName: string) {
    this.selectedVoiceName = voiceName;
    console.log("VoiceManager: Selected voice name updated to:", voiceName);
  }
  
  public onTranscriptChange: (text: string, isFinal: boolean) => void = () => {};
  public onSpeechEnd: (finalTranscript: string) => void = () => {};
  public onStateChange: (state: 'idle' | 'listening' | 'speaking' | 'connecting') => void = () => {};


  private initRecognition() {
    if (!SpeechRecognition) {
      console.warn("Speech Recognition API is not supported in this browser. Voice input will not work.");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false; // Turn-based conversation
    this.recognition.interimResults = true; // Show text as user speaks
    this.recognition.lang = 'ur-PK'; // Urdu (Pakistan)

    this.recognition.onstart = () => {
      this.onStateChange('listening');
    };

    this.recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      if (event.error !== 'no-speech') {
        this.onStateChange('idle');
      }
    };

    this.recognition.onend = () => {
      // If we are not actively speaking, we can keep listening or go idle
      if (!this.isSpeaking) {
        this.onStateChange('idle');
      }
    };

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        this.onTranscriptChange(finalTranscript, true);
        this.onSpeechEnd(finalTranscript);
      } else if (interimTranscript) {
        this.onTranscriptChange(interimTranscript, false);
      }
    };
  }

  private cachedVoices: SpeechSynthesisVoice[] = [];

  constructor() {
    this.initRecognition();
    this.initVoices();
  }

  private initVoices() {
    if ('speechSynthesis' in window) {
      this.cachedVoices = window.speechSynthesis.getVoices();
      console.log(`VoiceManager: Initialized. Loaded ${this.cachedVoices.length} voices.`);
      if (this.cachedVoices.length > 0) {
        console.log("VoiceManager: All loaded voices:", this.cachedVoices.map(v => `${v.name} (${v.lang}) - localService: ${v.localService}`));
      }
      window.speechSynthesis.onvoiceschanged = () => {
        this.cachedVoices = window.speechSynthesis.getVoices();
        console.log(`VoiceManager: Voices changed event. Total loaded: ${this.cachedVoices.length}`);
        console.log("VoiceManager: All loaded voices:", this.cachedVoices.map(v => `${v.name} (${v.lang}) - localService: ${v.localService}`));
      };
    }
  }

  // --- CONTROLS ---

  public startListening() {
    if (this.recognition && !this.isSpeaking) {
      try {
        this.recognition.start();
      } catch (e) {
        // Recognition already running or state error
      }
    }
  }

  public stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Recognition not running
      }
    }
  }

  // --- SPEECH SYNTHESIS (TTS) ---
  private ttsAudio: HTMLAudioElement | null = null;

  public speak(text: string, onEndCallback: () => void) {
    console.log("VoiceManager: Received text to speak via Backend TTS:", text);

    // Stop speaking and listening first
    this.cancelSpeech();
    this.stopListening();
    this.stopRingtone();
    
    this.isSpeaking = true;
    this.onStateChange('speaking');

    // Clean text for speech: remove markdown symbols, bullets, asterisks, hashtags
    const cleanedText = text
      .replace(/[*#_`~>]/g, '')
      .replace(/-\s+/g, ', ')
      .replace(/\n+/g, '. ')
      .trim();

    if (!cleanedText) {
      console.log("VoiceManager: Cleaned text is empty, skipping speech.");
      this.isSpeaking = false;
      this.onStateChange('idle');
      onEndCallback();
      return;
    }

    // Call our backend TTS endpoint
    const ttsUrl = `/api/tts?text=${encodeURIComponent(cleanedText)}`;
    console.log("VoiceManager: Playing backend TTS audio from:", ttsUrl);

    try {
      this.ttsAudio = new Audio(ttsUrl);
      
      let hasEnded = false;
      const finishSpeaking = () => {
        if (hasEnded) return;
        hasEnded = true;
        this.isSpeaking = false;
        this.ttsAudio = null;
        this.onStateChange('idle');
        onEndCallback();
      };

      this.ttsAudio.onended = () => {
        console.log("VoiceManager: Backend TTS playback finished successfully.");
        finishSpeaking();
      };

      this.ttsAudio.onerror = (e) => {
        console.error("VoiceManager: Backend TTS playback error event:", e);
        finishSpeaking();
      };

      this.ttsAudio.play().catch((err) => {
        console.error("VoiceManager: Failed to play backend TTS audio. Browser autoplay policy may have blocked it.", err);
        finishSpeaking();
      });

    } catch (err) {
      console.error("VoiceManager: Exception creating Audio element for TTS:", err);
      this.isSpeaking = false;
      this.onStateChange('idle');
      onEndCallback();
    }
  }

  public cancelSpeech() {
    if (this.ttsAudio) {
      console.log("VoiceManager: Cancelling active backend TTS playback.");
      try {
        this.ttsAudio.pause();
      } catch (e) {
        // Already paused or not playing
      }
      this.ttsAudio = null;
    }
    this.isSpeaking = false;
  }

  // --- AUDIO RECORDING (CALL RECORDING) ---

  public async startRecording() {
    try {
      this.audioChunks = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start(1000); // chunk every 1 sec
      this.isRecording = true;
    } catch (e) {
      console.error("Failed to start audio recording", e);
    }
  }

  public stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.isRecording = false;
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  public async uploadRecording(callId: string, audioBlob: Blob) {
    const formData = new FormData();
    formData.append('file', audioBlob);

    try {
      const response = await fetch(`/api/calls/${callId}/recording`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      console.log("Recording uploaded successfully", data);
      return data.recording_url;
    } catch (e) {
      console.error("Failed to upload recording", e);
      return null;
    }
  }

  // --- RINGTONE SYNTHESIZER ---
  private ringAudioCtx: AudioContext | null = null;
  private ringOsc1: OscillatorNode | null = null;
  private ringOsc2: OscillatorNode | null = null;
  private ringGainNode: GainNode | null = null;
  private ringIntervalId: any = null;

  public startRingtone() {
    this.stopRingtone();
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    try {
      this.ringAudioCtx = new AudioContextClass();
      this.ringOsc1 = this.ringAudioCtx.createOscillator();
      this.ringOsc2 = this.ringAudioCtx.createOscillator();
      this.ringGainNode = this.ringAudioCtx.createGain();
      
      this.ringOsc1.type = 'sine';
      this.ringOsc1.frequency.value = 400;
      this.ringOsc2.type = 'sine';
      this.ringOsc2.frequency.value = 450;
      
      this.ringOsc1.connect(this.ringGainNode);
      this.ringOsc2.connect(this.ringGainNode);
      this.ringGainNode.connect(this.ringAudioCtx.destination);
      
      this.ringGainNode.gain.setValueAtTime(0, this.ringAudioCtx.currentTime);
      
      this.ringOsc1.start(0);
      this.ringOsc2.start(0);
      
      const ringVolume = 0.08; // moderate volume
      
      const playRingCycle = () => {
        if (!this.ringAudioCtx || !this.ringGainNode) return;
        const now = this.ringAudioCtx.currentTime;
        
        // Ring 1: 0.4s duration
        this.ringGainNode.gain.setValueAtTime(0, now);
        this.ringGainNode.gain.linearRampToValueAtTime(ringVolume, now + 0.05);
        this.ringGainNode.gain.setValueAtTime(ringVolume, now + 0.4);
        this.ringGainNode.gain.linearRampToValueAtTime(0, now + 0.45);
        
        // Ring 2: starts at 0.6s, duration 0.4s
        this.ringGainNode.gain.setValueAtTime(0, now + 0.6);
        this.ringGainNode.gain.linearRampToValueAtTime(ringVolume, now + 0.65);
        this.ringGainNode.gain.setValueAtTime(ringVolume, now + 1.0);
        this.ringGainNode.gain.linearRampToValueAtTime(0, now + 1.05);
      };
      
      playRingCycle();
      this.ringIntervalId = setInterval(playRingCycle, 3000);
      console.log("VoiceManager: Ringtone started.");
    } catch (e) {
      console.error("Failed to start ringtone synthesis", e);
    }
  }

  public stopRingtone() {
    if (this.ringIntervalId) {
      clearInterval(this.ringIntervalId);
      this.ringIntervalId = null;
    }
    try {
      if (this.ringOsc1) {
        this.ringOsc1.stop();
        this.ringOsc1 = null;
      }
      if (this.ringOsc2) {
        this.ringOsc2.stop();
        this.ringOsc2 = null;
      }
      if (this.ringAudioCtx) {
        this.ringAudioCtx.close();
        this.ringAudioCtx = null;
      }
      console.log("VoiceManager: Ringtone stopped.");
    } catch (e) {
      // already stopped or not started
    }
  }
}
