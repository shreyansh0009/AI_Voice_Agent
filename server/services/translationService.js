import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

class TranslationService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Translate text to a target language
   * @param {string} text - Text to translate
   * @param {string} targetLanguage - Target language name or code (e.g., 'English', 'Hindi', 'es')
   * @returns {Promise<string>} Translated text
   */
  async translate(text, targetLanguage) {
    try {
      if (!text) return "";

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a helper translator. Translate the following text to ${targetLanguage}. 
            be natural and keep the tone conversational. 
            Do not add any explanations, just return the translated text.
            If the text is already significantly in ${targetLanguage}, return it as is.`,
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Translation error:", error);
      return text; // Fallback to original text
    }
  }

  /**
   * Detect the language of a text string
   * @param {string} text - Text to analyze
   * @returns {Promise<string>} Language code (e.g., 'en', 'hi', 'es')
   */
  async detectLanguage(text) {
    try {
      if (!text || text.length < 2) return "en"; // Default to English for very short text

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Detect the language of the provided text. Return ONLY the ISO 639-1 language code (e.g., en, hi, es, fr).
            If mixed, return the primary language.
            If uncertain or standard ASCII punctuation/numbers, return 'en'.`,
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0.1,
        max_tokens: 10,
      });

      const langCode = response.choices[0].message.content.trim().toLowerCase();
      // Validate it looks like a code
      if (langCode.length === 2) return langCode;
      return "en";
    } catch (error) {
      console.error("Language detection error:", error);
      return "en"; // Fallback
    }
  }
}

export default new TranslationService();
