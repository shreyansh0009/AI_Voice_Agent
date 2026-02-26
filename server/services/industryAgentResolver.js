const INDUSTRY_ALIASES = {
  automotive: "automobile",
  automobile: "automobile",
  auto: "automobile",
  "real-estate": "real-estate",
  real_estate: "real-estate",
  realestate: "real-estate",
  "real estate": "real-estate",
  sales: "sales",
  service: "service",
  finance: "finance",
  bfsi: "finance",
  healthcare: "healthcare",
  health: "healthcare",
  ecommerce: "ecommerce",
  "e-commerce": "ecommerce",
  retail: "retail",
  manufacturing: "manufacturing",
  general: "general",
};

export function normalizeIndustry(rawIndustry = "") {
  const normalized = rawIndustry.toString().trim().toLowerCase();
  return INDUSTRY_ALIASES[normalized] || normalized.replace(/[\s_]+/g, "-");
}

function parseIndustryAgentMap() {
  const raw = process.env.INDUSTRY_AGENT_MAP;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [normalizeIndustry(key), value]),
    );
  } catch (error) {
    console.warn("Invalid INDUSTRY_AGENT_MAP JSON. Using empty map.");
    return {};
  }
}

export function resolveAgentIdForIndustry(industry) {
  const map = parseIndustryAgentMap();
  const normalizedIndustry = normalizeIndustry(industry);

  return (
    map[normalizedIndustry] ||
    map.general ||
    process.env.DEFAULT_TRIAL_AGENT_ID ||
    null
  );
}
