import exotelService from '../services/exotel.service.js';
import aiAgentService from '../services/aiAgent.service.js';
import callStorageService from '../services/callStorage.service.js';
import deepgramService from '../services/deepgram.service.js';

/**
 * Call Controller - Handles phone call operations
 */
class CallController {
  /**
   * Initiate an outbound call
   * POST /api/call/initiate
   */
  async initiateCall(req, res) {
    try {
      const { phoneNumber, agentId = 'default', customerContext = {} } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required'
        });
      }

      // Create call record in database
      const callRecord = await callStorageService.createCall({
        phoneNumber,
        direction: 'outbound',
        status: 'initiated',
        agentId,
        customerContext
      });

      // Build webhook URL for call flow
      const baseUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
      const callbackUrl = `${baseUrl}/api/call/webhook/flow/${callRecord.id}`;

      // Initiate call via Exotel
      const exotelResponse = await exotelService.initiateCall(
        phoneNumber,
        callbackUrl,
        { callId: callRecord.id, agentId }
      );

      // Update call record with Exotel SID
      await callStorageService.updateCall(callRecord.id, {
        exotelCallSid: exotelResponse.callSid,
        status: 'ringing'
      });

      res.json({
        success: true,
        message: 'Call initiated successfully',
        callId: callRecord.id,
        exotelCallSid: exotelResponse.callSid
      });
    } catch (error) {
      console.error('Error initiating call:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Test Exotel authentication and reachability
   * POST /api/call/test-auth
   */
  async testAuth(req, res) {
    try {
      const result = await exotelService.testAuth();
      if (result.success) {
        return res.json({ success: true, account: result.account });
      }
      return res.status(401).json({ success: false, error: result.error });
    } catch (error) {
      console.error('Error testing Exotel auth:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get available Exotel phone numbers
   * GET /api/call/phone-numbers
   */
  async getPhoneNumbers(req, res) {
    try {
      const result = await exotelService.getPhoneNumbers();
      if (result.success) {
        return res.json({ success: true, numbers: result.numbers });
      }
      return res.status(500).json({ success: false, error: result.error });
    } catch (error) {
      console.error('Error getting phone numbers:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Handle incoming call webhook from Exotel
   * POST /api/call/webhook/incoming
   */
  async handleIncomingCall(req, res) {
    try {
      const webhookData = exotelService.parseWebhookData(req.body);
      
      console.log('📞 Incoming call from:', webhookData.from);

      // Create call record
      const callRecord = await callStorageService.createCall({
        exotelCallSid: webhookData.callSid,
        phoneNumber: webhookData.from,
        direction: 'inbound',
        status: 'in_progress',
        agentId: 'default' // You can determine this based on the called number
      });

      // Build webhook URL for call flow
      const baseUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
      const callbackUrl = `${baseUrl}/api/call/webhook/flow/${callRecord.id}`;

      // Generate welcome message XML
      const welcomeMessage = 'Hello! Welcome to our AI powered CRM. How can I help you today?';
      const xml = exotelService.generateCallFlowXML(
        welcomeMessage,
        callbackUrl,
        { recordCall: true, language: 'en' }
      );

      // Add system log
      await callStorageService.addCallLog(callRecord.id, {
        type: 'system',
        content: 'Call started'
      });

      // Add assistant log
      await callStorageService.addCallLog(callRecord.id, {
        type: 'assistant',
        content: welcomeMessage
      });

      res.type('text/xml').send(xml);
    } catch (error) {
      console.error('Error handling incoming call:', error);
      
      // Send error response XML
      const errorXml = exotelService.generateCallFlowXML(
        'Sorry, there was an error processing your call. Please try again later.',
        null
      );
      res.type('text/xml').send(errorXml);
    }
  }

  /**
   * Handle call flow webhook (conversation logic)
   * POST /api/call/webhook/flow/:callId
   */
  async handleCallFlow(req, res) {
    try {
      const { callId } = req.params;
      const webhookData = exotelService.parseWebhookData(req.body);

      console.log(`🔄 Call flow webhook for call ${callId}`);

      const call = await callStorageService.getCall(callId);
      if (!call) {
        throw new Error(`Call not found: ${callId}`);
      }

      // Check if we have a recording URL (user spoke)
      if (webhookData.recordingUrl) {
        console.log('🎤 User recording received:', webhookData.recordingUrl);

        let userMessage = '';
        
        // Transcribe user speech using Deepgram
        try {
          if (deepgramService.isReady()) {
            console.log('🎙️  Transcribing with Deepgram...');
            const transcription = await deepgramService.transcribePhoneCall(
              webhookData.recordingUrl
            );
            userMessage = transcription.transcript;
            console.log('✓ Transcription:', userMessage, `(confidence: ${transcription.confidence.toFixed(2)})`);
            
            // If transcription is empty or very low confidence, ask user to repeat
            if (!userMessage || userMessage.length < 3 || transcription.confidence < 0.3) {
              console.log('⚠️  Low confidence or empty transcription');
              userMessage = '[UNCLEAR_AUDIO]';
            }
          } else {
            console.warn('⚠️  Deepgram not available, using placeholder');
            userMessage = '[AUDIO_NOT_TRANSCRIBED]';
          }
        } catch (error) {
          console.error('❌ Deepgram transcription error:', error.message);
          userMessage = '[TRANSCRIPTION_ERROR]';
        }

        // Add user message to call log
        await callStorageService.addCallLog(callId, {
          type: 'user',
          content: userMessage,
          audioUrl: webhookData.recordingUrl
        });

        // Handle transcription errors with appropriate responses
        let aiResponse;
        
        if (userMessage === '[UNCLEAR_AUDIO]') {
          aiResponse = "I'm sorry, I couldn't hear you clearly. Could you please repeat that?";
        } else if (userMessage === '[AUDIO_NOT_TRANSCRIBED]' || userMessage === '[TRANSCRIPTION_ERROR]') {
          aiResponse = "I'm having trouble understanding. Could you try speaking a bit more clearly?";
        } else {
          // Update customer context from user message
          const updatedContext = aiAgentService.extractCustomerInfo(
            userMessage,
            call.customerContext
          );
          await callStorageService.updateCall(callId, {
            customerContext: updatedContext
          });

          // Get AI response
          const aiResult = await aiAgentService.processMessage(
            userMessage,
            call.agentId,
            updatedContext,
            call.transcript,
            {
              language: 'en', // TODO: Track language per call
              useRAG: false,
              systemPrompt: 'You are a helpful CRM assistant on a phone call. Keep responses brief and clear.',
              maxTokens: 100 // Shorter for phone calls
            }
          );

          aiResponse = typeof aiResult === 'string' ? aiResult : aiResult.response;
        }

        // Add AI response to call log
        await callStorageService.addCallLog(callId, {
          type: 'assistant',
          content: aiResponse
        });

        // Generate XML to speak AI response and wait for next input
        const baseUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
        const nextUrl = `${baseUrl}/api/call/webhook/flow/${callId}`;
        
        const xml = exotelService.generateCallFlowXML(
          aiResponse,
          nextUrl,
          { recordCall: true, language: 'en' }
        );

        return res.type('text/xml').send(xml);
      }

      // No recording, ask user to speak
      const baseUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
      const nextUrl = `${baseUrl}/api/call/webhook/flow/${callId}`;
      
      const xml = exotelService.generateRecordXML(60, nextUrl);
      res.type('text/xml').send(xml);

    } catch (error) {
      console.error('Error in call flow:', error);
      
      const errorXml = exotelService.generateCallFlowXML(
        'Sorry, there was an error. Goodbye.',
        null
      );
      res.type('text/xml').send(errorXml);
    }
  }

  /**
   * Handle call status updates from Exotel
   * POST /api/call/webhook/status/:callId
   */
  async handleCallStatus(req, res) {
    try {
      const { callId } = req.params;
      const webhookData = exotelService.parseWebhookData(req.body);

      console.log(`📊 Call status update for ${callId}:`, webhookData.status);

      const updates = {
        status: webhookData.status
      };

      if (webhookData.duration) {
        updates.duration = parseInt(webhookData.duration);
      }

      if (webhookData.recordingUrl) {
        updates.recordingUrl = webhookData.recordingUrl;
      }

      if (webhookData.status === 'completed' || webhookData.status === 'failed') {
        updates.endedAt = new Date().toISOString();
        
        // Add system log
        await callStorageService.addCallLog(callId, {
          type: 'system',
          content: `Call ${webhookData.status}`
        });
      }

      await callStorageService.updateCall(callId, updates);

      res.json({ success: true });
    } catch (error) {
      console.error('Error handling call status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get call details
   * GET /api/call/:callId
   */
  async getCall(req, res) {
    try {
      const { callId } = req.params;
      const call = await callStorageService.getCall(callId);

      if (!call) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }

      res.json({
        success: true,
        call
      });
    } catch (error) {
      console.error('Error getting call:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get all calls (with optional filters)
   * GET /api/call/history
   */
  async getCallHistory(req, res) {
    try {
      const filters = {
        phoneNumber: req.query.phoneNumber,
        direction: req.query.direction,
        status: req.query.status,
        agentId: req.query.agentId
      };

      const calls = await callStorageService.getAllCalls(filters);

      res.json({
        success: true,
        calls,
        count: calls.length
      });
    } catch (error) {
      console.error('Error getting call history:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Hangup active call
   * POST /api/call/:callId/hangup
   */
  async hangupCall(req, res) {
    try {
      const { callId } = req.params;
      const call = await callStorageService.getCall(callId);

      if (!call) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }

      if (!call.exotelCallSid) {
        return res.status(400).json({
          success: false,
          error: 'Call not initiated yet'
        });
      }

      // Hangup via Exotel
      await exotelService.hangupCall(call.exotelCallSid);

      // Update call record
      await callStorageService.updateCall(callId, {
        status: 'completed',
        endedAt: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Call hung up successfully'
      });
    } catch (error) {
      console.error('Error hanging up call:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new CallController();
