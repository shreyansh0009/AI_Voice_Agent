import React, { useState, useRef, useEffect } from "react";

// Tool component - a Tailwind CSS recreation of the provided UI
// Usage: import Tool from './ToolComponent.jsx' and render <Tool />

export default function Tool() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  const options = [
    "Check slot availability (using Cal.com)",
    "Book appointments (using Cal.com)",
    "Transfer call to a human agent",
    "Add your own custom function",
  ];

  const rootRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex items-start justify-center">
      <div className="w-full max-w-4xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-gray-900">
                Function Tools for LLM Models
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                Connect external tools or APIs that your language model can call during
                conversations. This allows the LLM to retrieve real-time data, perform
                calculations, or trigger actions dynamically.
              </p>
            </div>
          </div>

          {/* Controls area */}
          <div className="mt-6 flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:items-center">
            <div className="lg:col-span-9 relative" ref={rootRef}>
              <label className="sr-only">Choose functions</label>

              <div
                className="flex items-center justify-between border rounded-lg px-4 py-3 bg-white cursor-pointer"
                onClick={() => setOpen((v) => !v)}
              >
                <div className="flex items-center gap-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 7h18M3 12h18M3 17h18"
                    />
                  </svg>

                  <div>
                    <div className="text-sm text-gray-700">
                      {selected ?? "Select functions"}
                    </div>
                    <div className="text-xs text-gray-400">Choose functions</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    className="text-sm text-gray-600 placeholder-gray-400 bg-transparent outline-none"
                    placeholder="Search"
                    value={query}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setQuery(e.target.value)}
                  />

                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 text-gray-400 transition-transform duration-150 ${
                      open ? "rotate-180" : "rotate-0"
                    }`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.293l3.71-4.06a.75.75 0 111.12 1.0L10.53 13.5a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>

              {/* Dropdown panel */}
              {open && (
                <div className="absolute left-0 right-0 z-20 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-4 border-b">
                    <div className="font-medium text-gray-900">Choose functions</div>
                  </div>

                  <div className="max-h-48 overflow-y-auto">
                    {filtered.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500">No functions found.</div>
                    ) : (
                      filtered.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => {
                            setSelected(opt);
                            setOpen(false);
                            setQuery("");
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 focus:bg-gray-50"
                        >
                          {opt}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-3 flex lg:justify-end">
              <button
                type="button"
                className="w-full lg:w-auto inline-flex items-center justify-center rounded-lg px-5 py-3 bg-blue-400 text-white font-medium shadow-sm hover:opacity-95"
                onClick={() => alert(`Added: ${selected ?? "(no function selected)"}`)}
              >
                Add function
              </button>
            </div>
          </div>

          {/* Small preview area to mimic the example UI */}
          <div className="mt-6 text-sm text-gray-500">
            <strong className="text-gray-700">Tip:</strong> This is a UI-only component that
            recreates the look and interaction from the screenshot. You can wire the
            Add function button to your backend or state management to store selected
            functions.
          </div>
        </div>
      </div>
    </div>
  );
}
