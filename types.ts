/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface Point {
  x: number;
  y: number;
}

export type Language = 'en' | 'es';

export interface SignLesson {
  id: string;
  label: {
    en: string;
    es: string;
  };
  description: {
    en: string;
    es: string;
  };
  imageUrl?: string;
}

export interface SignValidation {
  isValid: boolean;
  confidence: number;
  feedback: string;
  suggestions: string[];
}

export interface DebugInfo {
  latency: number;
  screenshotBase64?: string;
  promptContext: string;
  rawResponse: string;
  parsedResponse?: any;
  error?: string;
  timestamp: string;
}

export interface AiResponse {
  validation: SignValidation;
  debug: DebugInfo;
}

// MediaPipe Type Definitions (Augmenting window)
declare global {
  interface Window {
    Hands: any;
    Camera: any;
    SelfieSegmentation: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
  }
}