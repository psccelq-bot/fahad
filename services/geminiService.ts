
import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import { SourceFile, SourceType, Message } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

/**
 * دالة توليد رد المساعد باستخدام البث المباشر (Streaming)
 */
export async function* generateAssistantResponseStream(
  query: string, 
  sources: SourceFile[], 
  history: Message[]
) {
  const historyParts = history.slice(-6).map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));

  const sourceParts: any[] = [];
  if (sources.length > 0) {
    sources.forEach(source => {
      if (source.type === SourceType.PDF) {
        sourceParts.push({
          inlineData: {
            mimeType: "application/pdf",
            data: source.content
          }
        });
      } else {
        sourceParts.push({ text: `المصدر (${source.name}):\n${source.content}` });
      }
    });
  }

  const systemInstruction = `أنت alhootah، بصفتك المستشار المعرفي للإجابة على استفساراتك حول مرحلة الانتقال الإيجابي من وزارة الصحة إلى الشركة القابضة.
  
  مهمتك السامية: 
  تقديم الدعم المعرفي الراقي واللبق للزملاء، والإجابة بدقة من خلال "المصادر المرفقة" فقط.
  
  قواعد التواصل:
  1. رحب دائماً برقي وإيجابية، وأبرز أهمية رحلة الانتقال للشركة القابضة.
  2. يمنع منعاً باتاً استخدام عبارة "في شركتنا". استبدلها بـ "الشركة" أو "القابضة" أو "الشركة القابضة".
  3. التزم بنظام RAG: إذا لم تجد المعلومة في المصدر المرفق، قل بلطف: "اعتذر منك عزيزي ... هذا خارج موضوعنا".
  4. ممنوع التخمين في الأمور التنظيمية، السياسات المالية، تذاكر السفر، أو البدلات ما لم تكن موجودة نصاً في الملف المرفق.
  5. اجعل ردودك حديثة، ملهمة، ومباشرة.`;

  try {
    const result = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview', 
      contents: [
        ...historyParts,
        {
          role: 'user',
          parts: [...sourceParts, { text: query }]
        }
      ],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.1, 
        thinkingConfig: { thinkingBudget: 0 } 
      }
    });

    for await (const chunk of result) {
      if (chunk.text) {
        const cleanedChunk = chunk.text.replace(/في شركتنا/g, 'في الشركة القابضة');
        yield cleanedChunk;
      }
    }
  } catch (error) {
    console.error("Streaming error:", error);
    yield "اعتذر منك عزيزي ... حدث خطأ في الاتصال.";
  }
}

/**
 * دالة توليد الصوت
 */
export async function generateSpeech(text: string): Promise<string | undefined> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    return undefined;
  }
}

export function decodePCM(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
