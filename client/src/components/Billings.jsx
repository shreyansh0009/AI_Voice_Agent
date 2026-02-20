import React, { useState, useEffect } from 'react';
import { PieChart, Plus, Pencil, Check } from 'lucide-react';
import api from '../utils/api';
import { loadRazorpay } from "../utils/razorpayLoader";
import {
    MdDeleteOutline,
    MdLinkOff,
    MdHelpOutline,
    MdClose,
    MdSearch,
    MdAdd
} from "react-icons/md";
import { toast } from "react-toastify";

function Billings() {
    const [walletBalance, setWalletBalance] = useState(0);
    const [showAddFundsModal, setShowAddFundsModal] = useState(false);

    const AddFundsModal = ({ isOpen, onClose, onSuccess }) => {
        const [amount, setAmount] = useState(10);
        const [loading, setLoading] = useState(false);
        const presetAmounts = [5, 10, 25, 50, 100];

        const handlePayment = async () => {
            setLoading(true);
            try {
                // Create order
                const orderRes = await api.post(
                    "/api/payments/create-order",
                    { amount }
                );

                if (!orderRes.data.success) {
                    throw new Error(orderRes.data.error);
                }

                const { order, key } = orderRes.data;

                // Ensure Razorpay SDK is loaded before instantiating
                await loadRazorpay();

                // Open Razorpay checkout
                const options = {
                    key,
                    amount: order.amount,
                    currency: order.currency,
                    name: "CRM Landing Software",
                    description: `Add $${amount} to wallet`,
                    order_id: order.id,
                    handler: async function (response) {
                        try {
                            // Verify payment
                            const verifyRes = await api.post(
                                "/api/payments/verify-payment",
                                {
                                    razorpay_order_id: response.razorpay_order_id,
                                    razorpay_payment_id: response.razorpay_payment_id,
                                    razorpay_signature: response.razorpay_signature
                                }
                            );

                            if (verifyRes.data.success) {
                                toast.success(`$${amount} added to wallet!`);
                                onSuccess(verifyRes.data.walletBalance);
                                onClose();
                            }
                        } catch (err) {
                            toast.error("Payment verification failed");
                        }
                    },
                    prefill: {
                        email: localStorage.getItem("userEmail") || ""
                    },
                    theme: {
                        color: "#2563eb"
                    }
                };

                const razorpay = new window.Razorpay(options);
                razorpay.open();

            } catch (error) {
                console.error("Payment error:", error);
                toast.error(error.response?.data?.error || "Failed to initiate payment");
            } finally {
                setLoading(false);
            }
        };

        if (!isOpen) return null;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                    <div className="flex justify-between items-start p-6 border-b">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 cursor-pointer">Add Funds</h2>
                            <p className="text-gray-500 text-sm mt-1">Add money to your wallet</p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                            <MdClose className="text-2xl" />
                        </button>
                    </div>

                    <div className="p-6 space-y-4">
                        {/* Preset amounts */}
                        <div className="flex flex-wrap gap-2">
                            {presetAmounts.map((preset) => (
                                <button
                                    key={preset}
                                    onClick={() => setAmount(preset)}
                                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${amount === preset
                                        ? "bg-blue-600 text-white"
                                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                        }`}
                                >
                                    ${preset}
                                </button>
                            ))}
                        </div>

                        {/* Custom amount */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Or enter custom amount
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={amount}
                                    onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {/* Pay button */}
                        <button
                            onClick={handlePayment}
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-3 rounded-lg font-semibold text-lg transition-colors"
                        >
                            {loading ? "Processing..." : `Pay $${amount}`}
                        </button>

                        <p className="text-xs text-gray-500 text-center">
                            Secure payment powered by Razorpay
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    useEffect(() => {
        const fetchWalletBalance = async () => {
            try {
                const response = await api.get("/api/payments/wallet");
                if (response.data.success) {
                    setWalletBalance(response.data.balance);
                }
            } catch (error) {
                console.error("Error fetching wallet:", error);
            }
        };
        fetchWalletBalance();
    }, []);

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold text-slate-800">Billing</h1>
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-slate-700 shadow-sm hover:bg-gray-50 transition-colors">
                    <PieChart className="w-4 h-4" />
                    Usage Analytics
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
                {/* Account Details Card */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 shadow-sm flex flex-col min-h-[300px]">
                    <h2 className="text-[17px] font-semibold text-slate-800 mb-8">Account Details</h2>

                    <div className="mb-8">
                        <p className="text-[14px] font-medium text-slate-600 mb-3">Current Balance</p>
                        <p className="text-[42px] leading-none text-blue-500 mb-6 tracking-tight font-medium">
                            ${walletBalance.toFixed(2)}
                        </p>
                    </div>

                    <div className="mt-auto">
                        <button
                            onClick={() => setShowAddFundsModal(true)}
                            className="cursor-pointer flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1e293b] text-white rounded-[8px] text-[14px] font-medium hover:bg-slate-800 transition-colors w-max shadow-sm">
                            <Plus className="w-4 h-4" />
                            Add Funds
                        </button>
                    </div>
                </div>

                {/* Billing Information Card */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 shadow-sm min-h-[300px]">
                    <div className="flex justify-between items-start mb-8">
                        <h2 className="text-[17px] font-semibold text-slate-800">Billing Information</h2>
                        <button className="text-gray-400 hover:text-slate-600 transition-colors">
                            <Pencil className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex flex-col gap-5 mt-2">
                        <p className="text-[14px] font-medium text-slate-500">Billing Address</p>
                        <p className="text-[14px] font-medium text-slate-500">City</p>
                        <p className="text-[14px] font-medium text-slate-500">State</p>
                        <p className="text-[14px] font-medium text-slate-500">Country</p>
                        <p className="text-[14px] font-medium text-slate-500">Tax ID</p>
                    </div>
                </div>
            </div>

            {/* Choose Your Plan Section */}
            <div className="mt-12 w-full">
                <h2 className="text-xl font-bold text-slate-800 mb-6">Choose Your Plan</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* Pay As You Go Plan */}
                    <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 flex flex-col shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-lg font-bold text-slate-800">Pay As You Go</h3>
                            <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full">Active</span>
                        </div>
                        <p className="text-sm font-medium text-slate-500 mb-6">Your current plan</p>

                        <div className="flex items-baseline gap-1 mb-8">
                            <span className="text-3xl font-bold text-slate-800">₹3.9</span>
                            <span className="text-sm font-medium text-slate-500">/ minute</span>
                        </div>

                        <ul className="space-y-4 mb-8 flex-1">
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">50+ languages supported</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">50+ country phone lines</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">Up to 15 calls per minute</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">Unused credits expire after 2 months</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">Includes entire costs of STT, LLM, TTS, Concurrency, etc.</span>
                            </li>
                        </ul>
                    </div>

                    {/* $500 Monthly Plan */}
                    <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 flex flex-col shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
                        <div className="mb-2">
                            <h3 className="text-lg font-bold text-slate-800">$500 Monthly Plan</h3>
                        </div>
                        <p className="text-sm font-medium text-slate-500 mb-6">Best for medium volume • $500 monthly</p>

                        <div className="flex items-baseline gap-1 mb-8">
                            <span className="text-3xl font-bold text-slate-800">₹3.35</span>
                            <span className="text-sm font-medium text-slate-500">/ minute</span>
                        </div>

                        <ul className="space-y-4 mb-8 flex-1">
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">50+ languages supported</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">50+ country phone lines</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">Up to 50 calls per minute</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">Unused credits expire after 2 months</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">Includes entire costs of STT, LLM, TTS, Concurrency, etc.</span>
                            </li>
                        </ul>

                        <button className="cursor-pointer w-full py-2.5 bg-[#0070f3] text-white rounded-[8px] text-[14px] font-semibold hover:bg-[#0060df] transition-colors mt-auto shadow-sm">
                            Subscribe for $500 monthly
                        </button>
                    </div>

                    {/* $2000 Monthly Plan */}
                    <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 flex flex-col shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
                        <div className="mb-2">
                            <h3 className="text-lg font-bold text-slate-800">$2000 Monthly Plan</h3>
                        </div>
                        <p className="text-sm font-medium text-slate-500 mb-6">Best for high volume • $2,000 monthly</p>

                        <div className="flex items-baseline gap-1 mb-8">
                            <span className="text-3xl font-bold text-slate-800">₹2.7</span>
                            <span className="text-sm font-medium text-slate-500">/ minute</span>
                        </div>

                        <ul className="space-y-4 mb-8 flex-1">
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">50+ languages supported</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">50+ country phone lines</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">Up to 150 calls per minute</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">Unused credits expire after 2 months</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={2.5} />
                                <span className="text-[14px] text-slate-600 font-medium">Includes entire costs of STT, LLM, TTS, Concurrency, etc.</span>
                            </li>
                        </ul>

                        <button className="cursor-pointer w-full py-2.5 bg-[#0070f3] text-white rounded-[8px] text-[14px] font-semibold hover:bg-[#0060df] transition-colors mt-auto shadow-sm">
                            Subscribe for $2,000 monthly
                        </button>
                    </div>

                </div>
            </div>
            <AddFundsModal
                isOpen={showAddFundsModal}
                onClose={() => setShowAddFundsModal(false)}
                onSuccess={(newBalance) => setWalletBalance(newBalance)}
            />
        </div>
    );
}

export default Billings;