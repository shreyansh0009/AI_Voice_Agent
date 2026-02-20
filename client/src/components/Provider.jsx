import React, { useState, useEffect } from "react";
import { loadRazorpay } from "../utils/razorpayLoader";
import axios from "axios";
import api from "../utils/api";
import { MdAdd, MdClose } from "react-icons/md";
import { FiHelpCircle, FiSettings, FiLink } from "react-icons/fi";
import { HiOutlineFilter } from "react-icons/hi";
import { SiDeepgram } from "react-icons/si";
import { SiElevenlabs, SiPerplexity } from "react-icons/si";
import { AiOutlineOpenAI } from "react-icons/ai";
import { CgTwilio } from "react-icons/cg";


const API_URL = import.meta.env.VITE_API_URL || "";

// Provider data matching the screenshot
const PROVIDERS = [
    { id: "aisensy", name: "Ai Sensy", category: "Tools", icon: <img src="https://imgs.search.brave.com/jQnBz6xdjXvgY-AIFHGkCcSaakW0X0i05_cbD01f5pU/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9wYXJ0/bmVyY2hhbXBpb24u/czMuYW1hem9uYXdz/LmNvbS9tZWRpYS1m/aWxlcy81OS45NTI4/NTEzMTY3NTgwOS0y/MDI1LTAyLTA0VDEy/OjEwOjExLjY4M1ot/U2NyZWVuc2hvdCUy/MDIwMjUtMDItMDQl/MjAxNzQwMDAucG5n" alt="" /> },
    { id: "azure_openai", name: "Azure OpenAI", category: "LLM", icon: <img src="https://imgs.search.brave.com/g9q4-unVvTGxNsXnEfXtioC9KmPc03ABMTnXBA_q-gA/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly91eHdp/bmcuY29tL3dwLWNv/bnRlbnQvdGhlbWVz/L3V4d2luZy9kb3du/bG9hZC9icmFuZHMt/YW5kLXNvY2lhbC1t/ZWRpYS9henVyZS1p/Y29uLnBuZw" alt="" /> },
    { id: "cal_com", name: "Cal.com", category: "Tools", icon: <img src="https://cal.com/logo.svg" alt="" /> },
    { id: "cartesia", name: "Cartesia", category: "TTS", icon: <img src="https://imgs.search.brave.com/Uc_Uk0Y4hKKu4syg1wI0phpqJXTAcVvNVwLgRwhTWMs/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9sc3Zw/LmNvbS93cC1jb250/ZW50L3VwbG9hZHMv/MjAyNC8xMi9Mb2dv/X0Z1bGxTaXplX0Rh/cmtvblRyYW5zcGFy/ZW50LmpwZw" alt="" /> },
    { id: "deepgram", name: "Deepgram", category: "STT", icon: SiDeepgram },
    { id: "elevenlabs", name: "ElevenLabs", category: "TTS", icon: SiElevenlabs },
    { id: "exotel", name: "Exotel", category: "Telephony", icon: <img src="https://imgs.search.brave.com/X4STSBZrAsofUxTpV6X8oOIhqGKEwTnNCPgNihH_uRY/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly93d3cu/bWVkaWFpbmZvbGlu/ZS5jb20vd3AtY29u/dGVudC91cGxvYWRz/LzIwMjMvMTAvRXhv/dGVsLUxvZ28tbWVk/aWFpbmZvbGluZS5q/cGc" alt="" /> },
    { id: "openai", name: "OpenAI", category: "LLM", icon: AiOutlineOpenAI },
    { id: "openrouter", name: "OpenRouter", category: "LLM", icon: <img src="https://imgs.search.brave.com/Fe90y_IaHq3aGj_Xtl34d-1ORO_6B3t4x6ibFNn4kJY/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9wbmdo/ZHByby5jb20vd3At/Y29udGVudC90aGVt/ZXMvcG5naGRwcm8v/ZG93bmxvYWQvc29j/aWFsLW1lZGlhLWFu/ZC1icmFuZHMvb3Bl/bnJvdXRlci1pY29u/LnBuZw" alt="" /> },
    { id: "perplexity", name: "Perplexity", category: "LLM", icon: SiPerplexity },
    { id: "plivo", name: "Plivo", category: "Telephony", icon: <img src="https://imgs.search.brave.com/nSFx2JkZsnQsDbRIowFrElJ8evUNyIwfuKcsvK7gcr0/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9zMy11/cy13ZXN0LTEuYW1h/em9uYXdzLmNvbS91/cGxvYWQuY29tcGFy/YWJseS5jb20vMTU0/NzAvY29tcGFuaWVz/LzE1NDcwL2xvZ29f/MTY3OTYwODM0MDY5/OC5qcGc" alt="" /> },
    { id: "rime", name: "Rime", category: "TTS", icon: <img src="https://imgs.search.brave.com/9H4wB6WaB8lIri8G1dP-5IsCp55xEVmjzz9KBW2jVOs/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9zaXRl/LndhbmRiLmFpL3dw/LWNvbnRlbnQvdXBs/b2Fkcy8yMDI1LzA3/LzE2NDU0NjY5MTQ5/NDQuanBlZz93PTE1/MCZoPTE1MCZjcm9w/PTE" alt="" /> },
    { id: "sarvam", name: "Sarvam", category: "LLM", icon: <img src="https://imgs.search.brave.com/bPhxQqIImrALbYh0tqpncKo8eBCTcw79B2YUqRRFWt8/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9wbmdo/ZHByby5jb20vd3At/Y29udGVudC90aGVt/ZXMvcG5naGRwcm8v/ZG93bmxvYWQvc29j/aWFsLW1lZGlhLWFu/ZC1icmFuZHMvc2Fy/dmFtLWFpLWxvZ28u/cG5n" alt="" /> },
    { id: "twilio", name: "Twilio", category: "Telephony", icon: CgTwilio },
    { id: "vobiz", name: "Vobiz", category: "Telephony", icon: <img src="https://vobiz.ai/darklogo.svg" alt="" /> },
];

// Category badge colors
const CATEGORY_STYLES = {
    LLM: "bg-blue-50 text-blue-700 border-blue-200",
    TTS: "bg-purple-50 text-purple-700 border-purple-200",
    STT: "bg-gray-100 text-gray-700 border-gray-200",
    Telephony: "bg-sky-50 text-sky-700 border-sky-200",
    Tools: "bg-slate-100 text-slate-700 border-slate-200",
};

// Helper to render icon — handles both React icon components and <img> JSX
function ProviderIcon({ icon, size = 32 }) {
    if (!icon) return null;

    // React icon component (function reference like SiDeepgram)
    if (typeof icon === "function") {
        const IconComponent = icon;
        return <IconComponent style={{ width: size, height: size }} className="text-gray-700" />;
    }

    // JSX element (already rendered <img> tag) — clone with uniform sizing
    if (React.isValidElement(icon)) {
        return React.cloneElement(icon, {
            style: { width: size, height: size, objectFit: "contain" },
            className: "rounded",
        });
    }

    return null;
}

export default function Provider() {
    const [filter, setFilter] = useState("");
    const [walletBalance, setWalletBalance] = useState(0);
    const [showAddFundsModal, setShowAddFundsModal] = useState(false);
    const [connectModal, setConnectModal] = useState({ open: false, provider: null });
    const [apiKey, setApiKey] = useState("");
    const [saving, setSaving] = useState(false);

    // Fetch wallet balance
    useEffect(() => {
        const fetchWallet = async () => {
            try {
                const response = await api.get("/api/payments/wallet");
                if (response.data.success) {
                    setWalletBalance(response.data.balance);
                }
            } catch (error) {
                console.error("Error fetching wallet:", error);
            }
        };
        fetchWallet();
    }, []);

    // Filter providers
    const filteredProviders = PROVIDERS.filter(
        (p) =>
            p.name.toLowerCase().includes(filter.toLowerCase()) ||
            p.category.toLowerCase().includes(filter.toLowerCase())
    );

    // Handle connect click
    const handleConnect = (provider) => {
        setConnectModal({ open: true, provider });
        setApiKey("");
    };

    // Handle save API key (currently frontend-only as per user request)
    const handleSaveKey = async () => {
        if (!apiKey.trim()) return;
        setSaving(true);
        // Simulate save — backend integration will be done later
        setTimeout(() => {
            setSaving(false);
            setConnectModal({ open: false, provider: null });
            setApiKey("");
            alert(`API key saved for ${connectModal.provider?.name}! (Backend integration pending)`);
        }, 800);
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 p-2 sm:p-4 md:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Providers</h1>
                    <p className="text-sm text-blue-600">
                        Add keys securely to connect your own Providers within Bolna.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
                        <FiSettings className="w-4 h-4 text-blue-500 mr-2" />
                        <span className="text-xs text-gray-500 mr-1">BALANCE</span>
                        <span className="font-semibold text-gray-900">${walletBalance.toFixed(2)}</span>
                    </div>

                    <button
                        onClick={() => setShowAddFundsModal(true)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm text-sm whitespace-nowrap transition-colors"
                    >
                        <MdAdd className="text-lg" />
                        Add more funds
                    </button>

                    <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm text-sm whitespace-nowrap transition-colors">
                        <FiHelpCircle className="w-4 h-4" />
                        Help
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex items-center justify-between mb-6 gap-3">
                <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter providers..."
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                />
                <button className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-500 transition-colors">
                    <HiOutlineFilter className="w-5 h-5" />
                </button>
            </div>

            {/* Provider Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProviders.map((provider) => (
                    <div
                        key={provider.id}
                        className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                {/* Provider Icon */}
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gray-50 border border-gray-100">
                                    <ProviderIcon icon={provider.icon} size={28} />
                                </div>

                                {/* Category Badge */}
                                <span
                                    className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${CATEGORY_STYLES[provider.category] || CATEGORY_STYLES.Tools
                                        }`}
                                >
                                    {provider.category}
                                </span>
                            </div>

                            {/* Connect Button */}
                            <button
                                onClick={() => handleConnect(provider)}
                                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                            >
                                <FiLink className="w-3.5 h-3.5" />
                                Connect
                            </button>
                        </div>

                        {/* Provider Name */}
                        <h3 className="text-sm font-semibold text-gray-900">{provider.name}</h3>
                    </div>
                ))}
            </div>

            {filteredProviders.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                    <p className="text-lg font-medium mb-1">No providers found</p>
                    <p className="text-sm">Try adjusting your filter</p>
                </div>
            )}

            {/* Connect Modal */}
            {connectModal.open && connectModal.provider && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-50 border border-gray-100">
                                    <ProviderIcon icon={connectModal.provider.icon} size={28} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">
                                        Connect {connectModal.provider.name}
                                    </h2>
                                    <p className="text-xs text-gray-500">
                                        {connectModal.provider.category} Provider
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setConnectModal({ open: false, provider: null })}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <MdClose className="text-2xl" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-5">
                            <p className="text-sm text-gray-600 mb-4">
                                Enter your API key to connect <span className="font-semibold">{connectModal.provider.name}</span> to your account. Your key is encrypted and stored securely.
                            </p>

                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                API Key
                            </label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={`Enter your ${connectModal.provider.name} API key`}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
                                autoFocus
                            />

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleSaveKey}
                                    disabled={!apiKey.trim() || saving}
                                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {saving ? "Saving..." : "Save & Connect"}
                                </button>
                                <button
                                    onClick={() => setConnectModal({ open: false, provider: null })}
                                    className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Funds Modal */}
            {showAddFundsModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                        <div className="flex justify-between items-start p-6 border-b">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Add Funds</h2>
                                <p className="text-gray-500 text-sm mt-1">Add money to your wallet</p>
                            </div>
                            <button
                                onClick={() => setShowAddFundsModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <MdClose className="text-2xl" />
                            </button>
                        </div>
                        <AddFundsContent
                            onSuccess={(newBalance) => {
                                setWalletBalance(newBalance);
                                setShowAddFundsModal(false);
                            }}
                            onClose={() => setShowAddFundsModal(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// Add Funds Content Component
function AddFundsContent({ onSuccess, onClose }) {
    const [amount, setAmount] = useState(10);
    const [loading, setLoading] = useState(false);
    const presetAmounts = [5, 10, 25, 50, 100];

    const handlePayment = async () => {
        setLoading(true);
        try {
            const orderRes = await api.post(
                "/api/payments/create-order",
                { amount }
            );

            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID,
                amount: orderRes.data.order.amount,
                currency: "USD",
                name: "AI Voice Agent",
                description: "Add funds to wallet",
                order_id: orderRes.data.order.id,
                handler: async (response) => {
                    try {
                        const verifyRes = await api.post(
                            "/api/payments/verify-payment",
                            {
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                            }
                        );
                        if (verifyRes.data.success) {
                            toast.success(`$${amount} added to wallet!`);
                            onSuccess(verifyRes.data.walletBalance);
                            onClose();
                        }
                    } catch (err) {
                        console.error("Payment verification failed:", err);
                        alert("Payment verification failed");
                    }
                },
                prefill: {},
                theme: { color: "#3B82F6" },
            };

            await loadRazorpay();
            const rzp = new window.Razorpay(options);
            rzp.open();
        } catch (err) {
            console.error("Error creating order:", err);
            alert("Failed to create payment order");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <div className="flex flex-wrap gap-2 mb-4">
                {presetAmounts.map((preset) => (
                    <button
                        key={preset}
                        onClick={() => setAmount(preset)}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${amount === preset
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                            }`}
                    >
                        ${preset}
                    </button>
                ))}
            </div>
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Custom Amount ($)</label>
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <button
                onClick={handlePayment}
                disabled={loading || amount < 1}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
            >
                {loading ? "Processing..." : `Pay $${amount}`}
            </button>
        </div>
    );
}