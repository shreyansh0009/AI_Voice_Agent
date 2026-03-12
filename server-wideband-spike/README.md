# Wideband Spike

Parallel Asterisk 18 proof-of-concept for `16 kHz` phone calls using ARI `externalMedia` over RTP.

This package does not replace the working `server/` AudioSocket flow. It runs as a separate process and uses a separate Asterisk test context.

## Start

```bash
cd server-wideband-spike
npm install
cp .env.example .env
npm run dev
```

## What It Reuses

- Mongo models from `../server/models`
- DB connection from `../server/config/database.js`
- AI conversation logic from `../server/services/aiAgent.service.js`
- state engine from `../server/services/stateEngine.js`
- existing TTS providers from `../server/services/tts.service.js`

## What It Adds

- ARI app bootstrap
- `Stasis`-driven call lifecycle
- per-call RTP media socket
- `slin16` `16 kHz` media pipeline

## Caveats

- This is a spike for Asterisk 18. RTP payload behavior for `slin16` can still require tuning.
- ElevenLabs is the most realistic provider for true `16 kHz` quality in this spike because the shared Sarvam service in `server/` still requests `8 kHz`.
- The current production `AudioSocket()` flow remains the fallback if the spike does not produce better call quality.

See [docs/asterisk-config.md](/Users/saurabhkumar/Projects/CRM_Landing/orgProjectClone/AI_Voice_Agent/server-wideband-spike/docs/asterisk-config.md) for PBX setup.
