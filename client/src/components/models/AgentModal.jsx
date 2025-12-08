import React, { useEffect, useState } from "react";

export default function AgentModal({
  open,
  onClose,
  onGenerate,
  onCreateScratch,
}) {
  const [tab, setTab] = useState("auto"); // "auto" | "prebuilt"
  const [name, setName] = useState("");
  const [langEn, setLangEn] = useState(true);
  const [langHi, setLangHi] = useState(false);
  const [what, setWhat] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [faqs, setFaqs] = useState("");
  const [sample, setSample] = useState("");

  // Simple validation: require name, what, nextSteps
  const isValid =
    name.trim().length > 0 &&
    what.trim().length > 0 &&
    nextSteps.trim().length > 0;

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // reset fields when modal opens
  useEffect(() => {
    if (open) {
      setTab("auto");
      setName("");
      setLangEn(true);
      setLangHi(false);
      setWhat("");
      setNextSteps("");
      setFaqs("");
      setSample("");
    }
  }, [open]);

  if (!open) return null;

  function handleGenerate() {
    if (!isValid) return;
    const payload = {
      name,
      languages: { english: langEn, hindi: langHi },
      what,
      nextSteps,
      faqs,
      sample,
      tab,
    };
    onGenerate?.(payload);
  }

  // sample prebuilt agents data
  const prebuilt = [
    {
      id: 1,
      title: "Recruitment Agent",
      desc: "AI agents that screen, interview, and onboard candidates at scale",
      what: "Conduct an initial screening interview for a Senior Developer role. Ask about experience with React, Node.js, and system design. Assess communication skills and cultural fit.",
      nextSteps:
        "Schedule a technical interview for candidates who pass the screening. specificy available slots.",
    },
    {
      id: 2,
      title: "Lead Qualification Agent",
      desc: "Calls every lead to ask qualifying questions, answer FAQs, and warmly introduce the business",
      what: "Call new leads who signed up on the website. Qualify them by asking about their budget, timeline, and decision-making process.",
      nextSteps:
        "If qualified, book a demo call with the sales team. If not, tag them as 'nurture' in the CRM.",
    },
    {
      id: 3,
      title: "Onboarding Agent",
      desc: "Conducts personalized guidance calls to warmly onboard users",
      what: "Welcome new customers to the platform. Walk them through the initial setup steps and ensure they successfuly log in.",
      nextSteps:
        "Send a welcome email with a link to the video tutorial. Schedule a check-in call for next week.",
    },
    {
      id: 4,
      title: "Cart Abandonment Agent",
      desc: "Calls customers with abandoned items in carts, recovering sales",
      what: "Call customers who left items in their cart 24 hours ago. Ask if they faced any issues and offer a limited-time 10% discount code to complete the purchase now.",
      nextSteps:
        "If they agree, send the checkout link via SMS. If they decline, ask for feedback.",
    },
    {
      id: 5,
      title: "Customer Support Agent",
      desc: "Provides 24/7 inbound call answering for FAQs and customer triage",
      what: "Answer incoming support calls. Handle common questions about password reset, billing, and account features. Escalate complex technical issues to human agents.",
      nextSteps:
        "Create a support ticket with a summary of the issue. Send a confirmation SMS to the caller.",
    },
    {
      id: 6,
      title: "Reminder Agent",
      desc: "Automates all reminders, from EMIs and collections to form filling deadlines",
      what: "Call customers to remind them about their upcoming insurance premium payment due in 3 days. Verify payment method on file.",
      nextSteps:
        "If they confirm payment, thank them. If they request an extension, log the request for review.",
    },
    {
      id: 7,
      title: "Announcement Agent",
      desc: "Keeps users engaged with all feature upgrades and product launches",
      what: "Call active users to announce the new 'AI Analytics' feature. Explain the benefits and encourage them to log in and try it out.",
      nextSteps:
        "Tag users who showed interest as 'hot leads' for the upsell campaign.",
    },
    {
      id: 8,
      title: "Front Desk Agent",
      desc: "Answers every call to handle clinic, hotel, and office scheduling",
      what: "Manage incoming calls for a busy dental clinic. specialized in booking appointments, rescheduling, and providing directions to the clinic.",
      nextSteps:
        "Send appointment confirmation details via WhatsApp. Update the clinic's calendar.",
    },
    {
      id: 9,
      title: "Survey Agent",
      desc: "Automated NPS, feedback & product surveys with detailed personalised questioning",
      what: "Conduct a post-purchase satisfaction survey. Ask customers to rate their experience on a scale of 1-10 and provide verbal feedback.",
      nextSteps:
        "Log the NPS score and transcript in the database. Flag low scores for immediate manager callback.",
    },
    {
      id: 10,
      title: "COD Confirmation Agent",
      desc: "Handles a variety of last mile logistics tasks, saving human effort",
      what: "Call customers to confirm their Cash on Delivery orders. Verify the delivery address and ensure they will be available to receive the package.",
      nextSteps:
        "Update order status to 'Confirmed' or 'Cancelled'. Notify the logistics partner.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* modal panel */}
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* header */}
        <div className="px-6 py-5 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold">
                Select your use case and let AI build your agent
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                You can always modify & edit it later.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 rounded-full p-2 text-lg"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* content */}
        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto">
          {/* left side: main form / tabs */}
          <div className="space-y-5">
            {/* top tabs as cards */}
            <div className="flex gap-4">
              <button
                onClick={() => setTab("auto")}
                className={`flex-1 text-left p-4 rounded-lg border transition-shadow ${
                  tab === "auto"
                    ? "bg-white ring-2 ring-sky-500 shadow-sm"
                    : "bg-slate-50 hover:shadow-sm"
                }`}
              >
                <div className="text-sm font-medium">Auto Build Agent</div>
                <div className="text-xs text-slate-500 mt-1">
                  Tell us about your ideal agent and we'll help you build it
                </div>
              </button>

              <button
                onClick={() => setTab("prebuilt")}
                className={`w-36 p-4 rounded-lg border transition-shadow text-left ${
                  tab === "prebuilt"
                    ? "bg-white ring-2 ring-sky-500 shadow-sm"
                    : "bg-slate-50 hover:shadow-sm"
                }`}
              >
                <div className="text-sm font-medium">Pre built Agents</div>
                <div className="text-xs text-slate-500 mt-1">
                  Choose a template
                </div>
              </button>
            </div>

            {/* form fields (only for Auto) */}
            {tab === "auto" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1">
                    Name of Agent <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter agent name"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Languages <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setLangEn((v) => !v)}
                      className={`px-3 py-1 rounded-md border text-sm ${
                        langEn
                          ? "bg-sky-600 text-white border-sky-600"
                          : "bg-white text-slate-700"
                      }`}
                      aria-pressed={langEn}
                    >
                      English
                    </button>
                    <button
                      onClick={() => setLangHi((v) => !v)}
                      className={`px-3 py-1 rounded-md border text-sm ${
                        langHi
                          ? "bg-sky-600 text-white border-sky-600"
                          : "bg-white text-slate-700"
                      }`}
                      aria-pressed={langHi}
                    >
                      Hindi
                    </button>
                    <div className="text-xs text-slate-400 ml-3">
                      At least one language recommended
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">
                    What do you want to achieve in this call?{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={what}
                    onChange={(e) => setWhat(e.target.value)}
                    placeholder="Be descriptive as you would to a human who you are asking to lead the call..."
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <div className="text-xs text-slate-400 mt-1">
                    {what.length} characters
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">
                    Ideal Next Steps after this call{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={nextSteps}
                    onChange={(e) => setNextSteps(e.target.value)}
                    placeholder="Describe what should happen after the call is completed..."
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <div className="text-xs text-slate-400 mt-1">
                    {nextSteps.length} characters
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">
                    FAQs / Business Documents / Any information
                  </label>
                  <textarea
                    rows={3}
                    value={faqs}
                    onChange={(e) => setFaqs(e.target.value)}
                    placeholder="Add any relevant FAQs, business documents, or additional information..."
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">
                    Sample Transcript
                  </label>
                  <textarea
                    rows={3}
                    value={sample}
                    onChange={(e) => setSample(e.target.value)}
                    placeholder="Provide a sample conversation transcript to help guide the agent..."
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>
            )}

            {/* Prebuilt chooser */}
            {tab === "prebuilt" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
                {prebuilt.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      // quick fill from template
                      setName(p.title);
                      setWhat(p.what);
                      setNextSteps(p.nextSteps);
                      setFaqs("");
                      setSample("");
                      setTab("auto");
                    }}
                    className="text-left p-4 border rounded-lg hover:shadow-md hover:border-blue-300 bg-slate-50 transition-all flex flex-col gap-2 group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-white rounded-md text-blue-600 group-hover:text-blue-700 shadow-sm shrink-0">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 text-sm">
                          {p.title}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                          {p.desc}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* right side: preview + help */}
          <div className="space-y-4">
            <div className="p-4 border rounded-lg bg-slate-50">
              <div className="text-sm font-semibold mb-2">Agent Preview</div>
              <div className="bg-white border rounded-md p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base font-semibold">
                      {name || "New Agent"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {(langEn ? "English " : "") + (langHi ? "• Hindi" : "")}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">draft</div>
                </div>

                <div className="mt-3 text-sm text-slate-600">
                  <div className="italic text-slate-500 text-xs">
                    Welcome message preview
                  </div>
                  <div className="mt-2 text-sm text-slate-700">
                    {what
                      ? what.slice(0, 220)
                      : "Welcome — tell the agent what you want it to do and it will behave accordingly."}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="text-sm font-semibold mb-2">Tips</div>
              <ul className="list-disc pl-5 text-sm text-slate-600 space-y-2">
                <li>Keep prompts concise — 2–4 short sentences work well.</li>
                <li>Use the sample transcript to show tone & phrasing.</li>
                <li>
                  Specify required next steps to ensure consistent outcomes.
                </li>
              </ul>
            </div>

            <div className="mt-auto">
              <div className="p-4 border rounded-lg bg-slate-50">
                <div className="text-xs text-slate-500">
                  Last updated a few seconds ago
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={onClose}
                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={!isValid}
                    className={`flex-1 px-3 py-2 rounded-md text-sm text-white ${
                      isValid ? "bg-sky-600" : "bg-slate-300 cursor-not-allowed"
                    }`}
                  >
                    Generate Agent
                  </button>
                </div>
                <div className="mt-3 text-center text-xs text-slate-400">
                  OR
                </div>
              </div>

              <button
                onClick={() => {
                  onCreateScratch?.();
                }}
                className="mt-3 w-full px-4 py-3 bg-white border rounded-lg text-sm font-medium hover:shadow-sm"
              >
                I want to create an agent from scratch
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
