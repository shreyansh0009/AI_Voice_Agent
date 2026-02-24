import OpenAI from "openai";

const DEFAULT_MODEL = process.env.DEMO_FAST_MODEL || "gpt-4o-mini";

class DemoFastAgentService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.isConfigured = !!process.env.OPENAI_API_KEY;
    if (!this.isConfigured) {
      console.warn("⚠️ OPENAI_API_KEY missing for demoFastAgentService");
    }
  }

  buildMessages(userMessage, systemPrompt, conversationHistory = []) {
    const recentHistory = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-10)
      : [];

    return [
      { role: "system", content: systemPrompt || "You are a concise assistant." },
      ...recentHistory,
      { role: "user", content: userMessage },
    ];
  }

  async processMessage(
    userMessage,
    {
      systemPrompt,
      conversationHistory = [],
      maxTokens = 100,
      temperature = 0.4,
      model = DEFAULT_MODEL,
    } = {},
  ) {
    if (!this.isConfigured) {
      return { response: "Sorry, AI service is not configured right now." };
    }

    const response = await this.openai.chat.completions.create({
      model,
      messages: this.buildMessages(userMessage, systemPrompt, conversationHistory),
      max_tokens: maxTokens,
      temperature,
    });

    const text = response?.choices?.[0]?.message?.content?.trim() || "";
    return { response: text };
  }

  async *processMessageStream(
    userMessage,
    {
      systemPrompt,
      conversationHistory = [],
      maxTokens = 100,
      temperature = 0.35,
      model = DEFAULT_MODEL,
    } = {},
  ) {
    if (!this.isConfigured) {
      yield {
        type: "content",
        content: "Sorry, AI service is not configured right now.",
      };
      yield { type: "done" };
      return;
    }

    try {
      const stream = await this.openai.chat.completions.create({
        model,
        messages: this.buildMessages(userMessage, systemPrompt, conversationHistory),
        max_tokens: maxTokens,
        temperature,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk?.choices?.[0]?.delta?.content;
        if (content) {
          yield { type: "content", content };
        }
      }

      yield { type: "done" };
    } catch (error) {
      yield { type: "error", message: error.message || "Fast stream failed" };
    }
  }
}

export default new DemoFastAgentService();
