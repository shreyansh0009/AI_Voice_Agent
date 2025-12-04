import express from "express";
const router = express.Router();

router.use((req, res, next) => {
  console.log("🚫 AUTH BYPASS for FreeSWITCH");
  next();
});

router.all("/dialplan", (req, res) => {
  const xml = `<?xml version="1.0"?>
  <document type="freeswitch/xml">
    <section name="dialplan">
      <context name="public">
        <extension name="incoming">
          <condition field="destination_number" expression=".*">
            <action application="answer"/>
            <action application="playback" data="ivr/ivr-welcome_to_freeswitch.wav"/>
            <action application="hangup"/>
          </condition>
        </extension>
      </context>
    </section>
  </document>`;

  res.set("Content-Type", "application/xml");
  res.send(xml);
});

// Prevent fall-through to other /api routes which might have auth
router.use((req, res) => {
  res.status(404).send("FreeSWITCH route not found");
});

export default router;
