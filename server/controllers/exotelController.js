import ttsService from "../services/tts.service.js";
import agentforceService from "../services/agentforce.service.js"; 
// rename aiAgent.service.js → agentforce.service.js

async handleCallFlow(req, res) {
  try {
    const { callId } = req.params;
    const webhookData = exotelService.parseWebhookData(req.body);

    console.log(`🔄 Call flow webhook for call ${callId}`);

    const call = await callStorageService.getCall(callId);
    if (!call) throw new Error(`Call not found: ${callId}`);

    /**
     * 1️⃣ USER SPOKE → Exotel provided recording URL
     */
    if (webhookData.recordingUrl) {
      console.log("🎤 User recording:", webhookData.recordingUrl);

      // (A) Download audio
      let audioBuffer;
      try {
        audioBuffer = await exotelService.downloadRecording(webhookData.recordingUrl);
      } catch (err) {
        console.error("❌ Error downloading audio:", err);
        audioBuffer = null;
      }

      // (B) Deepgram STT
      let userMessage = "";
      if (audioBuffer) {
        try {
          const transcript = await deepgramService.transcribe(audioBuffer);
          userMessage = transcript || "";
        } catch (err) {
          console.error("❌ Deepgram error:", err);
          userMessage = "[TRANSCRIPTION_ERROR]";
        }
      }

      console.log("👤 User said:", userMessage);

      // Save user message log
      await callStorageService.addCallLog(callId, {
        type: "user",
        content: userMessage,
        audioUrl: webhookData.recordingUrl,
      });

      /**
       * Handle unclear audio
       */
      if (
        userMessage === "[TRANSCRIPTION_ERROR]" ||
        userMessage.trim().length < 2
      ) {
        const fallback = "Sorry, I couldn't hear you clearly. Can you repeat?";
        const fallbackAudio = await ttsService.speak(fallback);

        const xml = exotelService.generatePlayAudioXML(
          `data:audio/wav;base64,${fallbackAudio}`
        );

        return res.type("text/xml").send(xml);
      }

      /**
       * 2️⃣ SEND TO SALESFORCE AGENTFORCE (LLM)
       */
      let aiResponse = "";
      try {
        aiResponse = await agentforceService.askAgentforce(userMessage);
      } catch (err) {
        console.error("❌ Agentforce error:", err);
        aiResponse = "Sorry, I'm having trouble responding. Please try again.";
      }

      console.log("🤖 Agentforce replied:", aiResponse);

      // Save assistant log
      await callStorageService.addCallLog(callId, {
        type: "assistant",
        content: aiResponse,
      });

      /**
       * 3️⃣ TTS (Sarvam)
       */
      let aiAudioBase64 = "";
      try {
        aiAudioBase64 = await ttsService.speak(aiResponse, "en", "aarti");
      } catch (err) {
        console.error("❌ Sarvam TTS error:", err);
      }

      const baseUrl =
        process.env.SERVER_URL ||
        `http://localhost:${process.env.PORT || 5000}`;
      const nextUrl = `${baseUrl}/api/call/webhook/flow/${callId}`;

      /**
       * 4️⃣ RETURN AUDIO XML
       */
      const xml = exotelService.generatePlayAudioXML(
        `data:audio/wav;base64,${aiAudioBase64}`,
        nextUrl
      );

      return res.type("text/xml").send(xml);
    }

    /**
     * 5️⃣ NO RECORDING → Ask user to speak
     */
    const baseUrl =
      process.env.SERVER_URL ||
      `http://localhost:${process.env.PORT || 5000}`;
    const nextUrl = `${baseUrl}/api/call/webhook/flow/${callId}`;

    const xml = exotelService.generateRecordXML(60, nextUrl);
    return res.type("text/xml").send(xml);
  } catch (error) {
    console.error("❌ Error in call flow:", error);

    const xml = exotelService.generateCallFlowXML(
      "Sorry, there was an error. Goodbye.",
      null
    );

    return res.type("text/xml").send(xml);
  }
}
