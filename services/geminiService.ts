/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Type } from "@google/genai";
import { SignValidation, AiResponse, DebugInfo, SignLesson, Language } from "../types";

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;

if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
} else {
    console.error("API_KEY is missing from environment variables.");
}

const MODEL_NAME = "gemini-3-flash-preview";

export const validateSignGesture = async (
  imageBase64: string,
  currentLesson: SignLesson,
  language: Language
): Promise<AiResponse> => {
  const startTime = performance.now();
  
  const label = currentLesson.label[language];
  const description = currentLesson.description[language];

  const debug: DebugInfo = {
    latency: 0,
    screenshotBase64: imageBase64,
    promptContext: `Lesson: ${label} (${language})`,
    rawResponse: "",
    timestamp: new Date().toLocaleTimeString()
  };

  if (!ai) {
    return {
        validation: { 
          isValid: false, 
          confidence: 0, 
          feedback: language === 'es' ? "Falta la clave API." : "API Key missing.", 
          suggestions: [] 
        },
        debug: { ...debug, error: "API Key Missing" }
    };
  }

  const prompt = `
    You are an expert Sign Language instructor. 
    Analyze the provided image of a student's hand gesture.
    The student is trying to sign: "${label}" (${description}).
    
    Respond in ${language === 'es' ? 'Spanish' : 'English'}.

    ### YOUR TASK
    1. Determine if the gesture is correct for the target sign.
    2. Provide a confidence score (0.0 to 1.0).
    3. Give constructive feedback. If incorrect, explain why.
    4. Provide 1-2 specific suggestions for improvement.

    ### OUTPUT FORMAT
    Return RAW JSON only. Do not use Markdown. Do not use code blocks.
    JSON structure:
    {
      "isValid": boolean,
      "confidence": number,
      "feedback": "string",
      "suggestions": ["string"]
    }
  `;

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
            { text: prompt },
            { 
              inlineData: {
                mimeType: "image/png",
                data: cleanBase64
              } 
            }
        ]
      },
      config: {
        maxOutputTokens: 1024,
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    });

    const endTime = performance.now();
    debug.latency = Math.round(endTime - startTime);
    
    let text = response.text || "{}";
    debug.rawResponse = text;
    
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        text = text.substring(firstBrace, lastBrace + 1);
    } 

    try {
        const json = JSON.parse(text);
        debug.parsedResponse = json;
        
        return {
            validation: {
                isValid: !!json.isValid,
                confidence: Number(json.confidence) || 0,
                feedback: json.feedback || "No feedback provided.",
                suggestions: Array.isArray(json.suggestions) ? json.suggestions : []
            },
            debug
        };

    } catch (e: any) {
        return {
            validation: { isValid: false, confidence: 0, feedback: "Failed to parse AI response.", suggestions: [] },
            debug: { ...debug, error: `JSON Parse Error: ${e.message}` }
        };
    }
  } catch (error: any) {
    const endTime = performance.now();
    debug.latency = Math.round(endTime - startTime);
    return {
        validation: { isValid: false, confidence: 0, feedback: "AI Service Unreachable", suggestions: [] },
        debug: { ...debug, error: error.message || "Unknown API Error" }
    };
  }
};