import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FiExternalLink } from 'react-icons/fi';
import { MdAdd, MdHelpOutline, MdClose } from 'react-icons/md';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Add Funds Modal - Same as MyNumbers.jsx
const AddFundsModal = ({ isOpen, onClose, onSuccess }) => {
    const [amount, setAmount] = useState(10);
    const [loading, setLoading] = useState(false);
    const presetAmounts = [5, 10, 25, 50, 100];

    const handlePayment = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");

            // Create order
            const orderRes = await axios.post(
                `${API_URL}/api/payments/create-order`,
                { amount },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!orderRes.data.success) {
                throw new Error(orderRes.data.error);
            }

            const { order, key } = orderRes.data;

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
                        const verifyRes = await axios.post(
                            `${API_URL}/api/payments/verify`,
                            {
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature
                            },
                            { headers: { Authorization: `Bearer ${token}` } }
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
                        <h2 className="text-xl font-bold text-gray-900">Add Funds</h2>
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

const Workplace = () => {
    const [activeTab, setActiveTab] = useState('account');
    const [walletBalance, setWalletBalance] = useState(0);
    const [showAddFundsModal, setShowAddFundsModal] = useState(false);
    const [concurrencyData, setConcurrencyData] = useState({
        ongoingCalls: 0,
        totalConcurrency: 10
    });

    const tabs = [
        { id: 'account', label: 'Account Information' },
        { id: 'team', label: 'Team Members' },
        { id: 'compliance', label: 'Compliance Settings' },
        { id: 'invoices', label: 'Invoices' },
        { id: 'violations', label: 'Violations' },
    ];

    const pricingData = [
        { component: 'Voice agent cost', priceInCents: 'pay as you go', pulse: '60s', pricePerMin: 'pay as you go' },
        { component: 'Telephony', priceInCents: 'pay as you go', pulse: '60s', pricePerMin: 'pay as you go' },
        { component: 'Platform', priceInCents: '2', pulse: '60s', pricePerMin: '2' },
    ];

    useEffect(() => {
        fetchWalletBalance();
        fetchConcurrencyData();
    }, []);

    const fetchWalletBalance = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/api/payments/wallet`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setWalletBalance(res.data.walletBalance || 0);
        } catch (error) {
            console.error('Error fetching wallet balance:', error);
        }
    };

    const fetchConcurrencyData = async () => {
        try {
            // For now, using static data
            setConcurrencyData({
                ongoingCalls: 0,
                totalConcurrency: 10
            });
        } catch (error) {
            console.error('Error fetching concurrency data:', error);
        }
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'account':
                return <AccountInformation pricingData={pricingData} concurrencyData={concurrencyData} />;
            case 'team':
                return <TeamMembers />;
            case 'compliance':
                return <ComplianceSettings />;
            case 'invoices':
                return <Invoices />;
            case 'violations':
                return <Violations />;
            default:
                return <AccountInformation pricingData={pricingData} concurrencyData={concurrencyData} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Workplace settings</h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Manage workplace members, account information and view invoices
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Compact Balance Card - Same as MyNumbers */}
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
                        <div className="text-xs text-gray-500 uppercase font-semibold mr-2">Balance</div>
                        <div className="text-base font-bold text-gray-900">${walletBalance.toFixed(2)}</div>
                    </div>

                    {/* Add Funds Button - Same as MyNumbers */}
                    <button
                        onClick={() => setShowAddFundsModal(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
                    >
                        <MdAdd className="text-lg" />
                        Add funds
                    </button>

                    {/* Help Button */}
                    <button className="flex items-center gap-2 px-3 py-2 border border-blue-100 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium">
                        <MdHelpOutline className="text-lg" />
                        Help
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 mb-6">
                <nav className="flex gap-8">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === tab.id
                                ? 'text-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                            )}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                {renderTabContent()}
            </div>

            {/* Add Funds Modal */}
            <AddFundsModal
                isOpen={showAddFundsModal}
                onClose={() => setShowAddFundsModal(false)}
                onSuccess={(newBalance) => setWalletBalance(newBalance)}
            />
        </div>
    );
};

// Account Information Tab Component
const AccountInformation = ({ pricingData, concurrencyData }) => {
    return (
        <div className="space-y-8">
            {/* Pricing Information */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-bold text-gray-900">Pricing Information</h2>
                    <a
                        href="#"
                        className="text-blue-500 text-sm flex items-center gap-1 hover:underline"
                    >
                        Learn more about how pricing works
                        <FiExternalLink className="text-xs" />
                    </a>
                </div>

                <div className="overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-sm text-gray-500">
                                <th className="pb-3 font-medium">Component</th>
                                <th className="pb-3 font-medium">Price (in cents)</th>
                                <th className="pb-3 font-medium">Pulse (in seconds)</th>
                                <th className="pb-3 font-medium">Price (per minute in cents)</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm text-gray-700">
                            {pricingData.map((row, index) => (
                                <tr key={index} className="border-t border-gray-100">
                                    <td className="py-4">{row.component}</td>
                                    <td className="py-4">{row.priceInCents}</td>
                                    <td className="py-4">{row.pulse}</td>
                                    <td className="py-4">{row.pricePerMin}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Concurrency Information */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-bold text-gray-900">Concurrency Information</h2>
                    <a
                        href="#"
                        className="text-blue-500 text-sm flex items-center gap-1 hover:underline"
                    >
                        Learn more about concurrency tiers
                        <FiExternalLink className="text-xs" />
                    </a>
                </div>

                <div className="grid grid-cols-2 gap-8">
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Current ongoing calls</p>
                        <p className="text-2xl font-semibold text-gray-900">{concurrencyData.ongoingCalls}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Total concurrency</p>
                        <p className="text-2xl font-semibold text-gray-900">{concurrencyData.totalConcurrency}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Team Members Tab Component
const TeamMembers = () => {
    return (
        <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No team members yet</h3>
            <p className="text-gray-500 mb-4">Invite team members to collaborate on your workspace</p>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
                Invite Team Member
            </button>
        </div>
    );
};

// Compliance Settings Tab Component
const ComplianceSettings = () => {
    return (
        <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Compliance Settings</h3>
            <p className="text-gray-500">Configure your compliance and regulatory settings here</p>
        </div>
    );
};

// Invoices Tab Component
const Invoices = () => {
    return (
        <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No invoices yet</h3>
            <p className="text-gray-500">Your invoices will appear here after your first payment</p>
        </div>
    );
};

// Violations Tab Component
const Violations = () => {
    return (
        <div className="text-center py-12">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No violations</h3>
            <p className="text-gray-500">Your account is in good standing</p>
        </div>
    );
};

export default Workplace;
