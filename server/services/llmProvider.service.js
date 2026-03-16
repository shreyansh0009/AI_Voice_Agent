import OpenAI from "openai";
import { createXai } from "@ai-sdk/xai";
import { generateText as generateSdkText, streamText as streamSdkText } from "ai";

const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  grok: "grok-4.20-beta-latest-non-reasoning",
};

function normalizeMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part?.type === "text" && typeof part.text === "string") {
          return part.text;
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return content == null ? "" : String(content);
}

function normalizeMessages(messages = []) {
  return messages
    .filter(Boolean)
    .map((message) => ({
      role: message.role,
      content: normalizeMessageContent(message.content),
    }))
    .filter((message) => message.role && message.content);
}

class LLMProviderService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.xai = createXai({
      apiKey: process.env.XAI_API_KEY,
    });
  }

  normalizeProvider(provider) {
    if (!provider) {
      return "openai";
    }

    const value = String(provider).trim().toLowerCase();

    if (value === "agentforce") {
      return "agentforce";
    }

    if (value === "grok" || value === "xai" || value === "x.ai") {
      return "grok";
    }

    return "openai";
  }

  getDefaultModel(provider) {
    return DEFAULT_MODELS[this.normalizeProvider(provider)] || DEFAULT_MODELS.openai;
  }

  resolveSelection(provider, model) {
    const normalizedProvider = this.normalizeProvider(provider);
    return {
      provider: normalizedProvider,
      model: model || this.getDefaultModel(normalizedProvider),
    };
  }

  ensureConfigured(provider) {
    const normalizedProvider = this.normalizeProvider(provider);

    if (normalizedProvider === "grok" && !process.env.XAI_API_KEY) {
      throw new Error("XAI_API_KEY is not configured");
    }

    if (normalizedProvider === "openai" && !process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
  }

  async generateText({
    provider,
    model,
    messages,
    temperature,
    maxTokens,
    responseFormat,
    presencePenalty,
    frequencyPenalty,
  }) {
    const resolved = this.resolveSelection(provider, model);
    this.ensureConfigured(resolved.provider);

    const normalizedMessages = normalizeMessages(messages);

    if (resolved.provider === "grok") {
      const result = await generateSdkText({
        model: this.xai.responses(resolved.model),
        messages: normalizedMessages,
        temperature,
        maxOutputTokens: maxTokens,
      });

      return {
        text: result.text || "",
        provider: resolved.provider,
        model: resolved.model,
      };
    }

    const response = await this.openai.chat.completions.create({
      model: resolved.model,
      messages: normalizedMessages,
      temperature,
      max_tokens: maxTokens,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(presencePenalty !== undefined
        ? { presence_penalty: presencePenalty }
        : {}),
      ...(frequencyPenalty !== undefined
        ? { frequency_penalty: frequencyPenalty }
        : {}),
    });

    return {
      text: response.choices[0]?.message?.content || "",
      provider: resolved.provider,
      model: resolved.model,
    };
  }

  async *streamText({ provider, model, messages, temperature, maxTokens }) {
    const resolved = this.resolveSelection(provider, model);
    this.ensureConfigured(resolved.provider);

    const normalizedMessages = normalizeMessages(messages);

    if (resolved.provider === "grok") {
      const result = streamSdkText({
        model: this.xai.responses(resolved.model),
        messages: normalizedMessages,
        temperature,
        maxOutputTokens: maxTokens,
      });

      for await (const textPart of result.textStream) {
        if (textPart) {
          yield textPart;
        }
      }

      return;
    }

    const stream = await this.openai.chat.completions.create({
      model: resolved.model,
      messages: normalizedMessages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}

export default new LLMProviderService();
