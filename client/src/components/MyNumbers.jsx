import React, { useState, useEffect } from "react";
import { format, addMonths } from "date-fns";
import {
    MdDeleteOutline,
    MdLinkOff,
    MdHelpOutline,
    MdClose,
    MdSearch,
    MdAdd
} from "react-icons/md";
import { toast } from "react-toastify";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "";

// Confirmation Modal Component
const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", type = "danger" }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="flex justify-between items-center p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <MdClose className="text-2xl" />
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-gray-600">{message}</p>
                </div>
                <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 font-medium text-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-lg font-medium text-white ${type === "danger"
                            ? "bg-red-600 hover:bg-red-700"
                            : "bg-blue-600 hover:bg-blue-700"
                            }`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Add Funds Modal
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

// Buy Phone Number Modal
const BuyNumberModal = ({ isOpen, onClose, availableNumbers, onPurchase, walletBalance }) => {
    const [selectedCountry, setSelectedCountry] = useState("India");
    const [pattern, setPattern] = useState("");
    const [selectedNumber, setSelectedNumber] = useState("");
    const [filteredNumbers, setFilteredNumbers] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (availableNumbers && availableNumbers.length > 0) {
            const filtered = pattern
                ? availableNumbers.filter(n => n.displayNumber.includes(pattern))
                : availableNumbers;
            setFilteredNumbers(filtered);
            if (filtered.length > 0) {
                setSelectedNumber(filtered[0].number);
            }
        }
    }, [availableNumbers, pattern]);

    const renewalDate = addMonths(new Date(), 1);
    const purchasePrice = 5;

    const handlePurchase = async () => {
        if (walletBalance < purchasePrice) {
            toast.error("Insufficient wallet balance. Please add funds first.");
            return;
        }
        setLoading(true);
        await onPurchase(selectedNumber, purchasePrice);
        setLoading(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full">
                <div className="flex justify-between items-start p-6 border-b">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Buy phone number</h2>
                        <p className="text-gray-500 mt-1">Select your country and optionally add a pattern.</p>
                        <p className="text-gray-500 text-sm mt-2">
                            For example, to search for phone numbers in the US starting with a 615 prefix,
                            specify 615. Search results will be in the form "1615XXXXXX"
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <MdClose className="text-2xl" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Country and Pattern Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <select
                            value={selectedCountry}
                            onChange={(e) => setSelectedCountry(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                            <option value="India">🇮🇳 India</option>
                        </select>

                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Pattern: 615"
                                value={pattern}
                                onChange={(e) => setPattern(e.target.value)}
                                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <MdSearch className="text-xl" />
                            </button>
                        </div>
                    </div>

                    {/* Company Name */}
                    <input
                        type="text"
                        value="CRM LANDING SOFTWARE PRIVATE LIMITED"
                        disabled
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
                    />

                    {/* Available Numbers Dropdown */}
                    <select
                        value={selectedNumber}
                        onChange={(e) => setSelectedNumber(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-blue-500 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-lg"
                    >
                        {filteredNumbers.length > 0 ? (
                            filteredNumbers.map((num) => (
                                <option key={num._id} value={num.number}>
                                    {num.displayNumber}
                                </option>
                            ))
                        ) : (
                            <option value="">No available numbers</option>
                        )}
                    </select>

                    {/* Purchase Button */}
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">
                            Wallet Balance: <span className="font-semibold text-gray-900">${walletBalance.toFixed(2)}</span>
                        </span>
                        <button
                            onClick={handlePurchase}
                            disabled={!selectedNumber || filteredNumbers.length === 0 || loading || walletBalance < purchasePrice}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-semibold text-lg shadow-md transition-colors"
                        >
                            {loading ? "Processing..." : `Purchase ($${purchasePrice})`}
                        </button>
                    </div>

                    {walletBalance < purchasePrice && (
                        <p className="text-red-500 text-sm text-right">
                            Insufficient balance. Please add funds.
                        </p>
                    )}

                    {/* Renewal Information */}
                    <div className="text-gray-600 text-sm">
                        Your subscription will automatically renew on {format(renewalDate, "d MMMM yyyy")}.
                    </div>
                </div>
            </div>
        </div>
    );
};

const MyNumbers = () => {
    const [phoneNumbers, setPhoneNumbers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAvailable, setShowAvailable] = useState(false);
    const [showBuyModal, setShowBuyModal] = useState(false);
    const [showAddFundsModal, setShowAddFundsModal] = useState(false);
    const [walletBalance, setWalletBalance] = useState(0);
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        type: null,
        data: null
    });

    useEffect(() => {
        fetchPhoneNumbers();
        fetchWalletBalance();
    }, []);

    const fetchPhoneNumbers = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(
                `${API_URL}/api/phone-numbers`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (response.data.success) {
                setPhoneNumbers(response.data.phoneNumbers);
            }
        } catch (error) {
            console.error("Error fetching phone numbers:", error);
            toast.error("Failed to load phone numbers");
        } finally {
            setLoading(false);
        }
    };

    const fetchWalletBalance = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(
                `${API_URL}/api/payments/wallet`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (response.data.success) {
                setWalletBalance(response.data.balance);
            }
        } catch (error) {
            console.error("Error fetching wallet:", error);
        }
    };

    const handleUnlinkConfirm = async () => {
        const { number, agentName } = confirmModal.data;
        try {
            const token = localStorage.getItem("token");
            await axios.post(
                `${API_URL}/api/phone-numbers/${number}/unlink`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(`Agent ${agentName} unlinked successfully`);
            fetchPhoneNumbers();
        } catch (error) {
            console.error("Error unlinking agent:", error);
            toast.error(error.response?.data?.error || "Failed to unlink agent");
        } finally {
            setConfirmModal({ isOpen: false, type: null, data: null });
        }
    };

    const handleDeleteConfirm = async () => {
        const { number, displayNumber } = confirmModal.data;
        try {
            const token = localStorage.getItem("token");
            await axios.post(
                `${API_URL}/api/phone-numbers/${number}/release`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(`Phone number ${displayNumber} has been released`);
            fetchPhoneNumbers();
        } catch (error) {
            console.error("Error releasing phone number:", error);
            toast.error(error.response?.data?.error || "Failed to release phone number");
        } finally {
            setConfirmModal({ isOpen: false, type: null, data: null });
        }
    };

    const handlePurchase = async (number, price) => {
        try {
            const token = localStorage.getItem("token");

            // Step 1: Deduct from wallet
            const deductRes = await axios.post(
                `${API_URL}/api/payments/deduct`,
                { amount: price, description: `Phone number purchase: ${number}` },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!deductRes.data.success) {
                throw new Error(deductRes.data.error);
            }

            // Step 2: Mark phone number as purchased (sets ownerId, purchasedAt, expiresAt)
            const purchaseRes = await axios.post(
                `${API_URL}/api/phone-numbers/${number}/purchase`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (purchaseRes.data.success) {
                setWalletBalance(deductRes.data.walletBalance);
                toast.success(`Phone number purchased successfully!`);
                setShowBuyModal(false);
                fetchPhoneNumbers();
            } else {
                throw new Error(purchaseRes.data.error);
            }
        } catch (error) {
            console.error("Purchase error:", error);
            toast.error(error.response?.data?.error || error.message || "Failed to purchase number");
        }
    };

    const openUnlinkModal = (number, agentName) => {
        setConfirmModal({
            isOpen: true,
            type: 'unlink',
            data: { number, agentName }
        });
    };

    const openDeleteModal = (number, displayNumber) => {
        setConfirmModal({
            isOpen: true,
            type: 'delete',
            data: { number, displayNumber }
        });
    };

    const closeModal = () => {
        setConfirmModal({ isOpen: false, type: null, data: null });
    };

    const filteredNumbers = showAvailable
        ? phoneNumbers.filter(p => p.status === "available")
        : phoneNumbers.filter(p => p.status === "linked" || p.status === "owned");

    const availableNumbers = phoneNumbers.filter(p => p.status === "available");

    // Count My Numbers (owned + linked)
    const myNumbersCount = phoneNumbers.filter(p => p.status === "linked" || p.status === "owned").length;

    const getRenewalDate = (phone) => {
        if (phone.expiresAt) {
            return format(new Date(phone.expiresAt), "do MMM, yyyy");
        }
        if (!phone.purchasedAt) return "N/A";
        const date = new Date(phone.purchasedAt);
        date.setMonth(date.getMonth() + 1);
        return format(date, "do MMM, yyyy");
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="text-xl text-gray-600">Loading phone numbers...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Phone Numbers</h1>
                    <p className="text-gray-500 text-sm mt-1">Buy and view your phone numbers</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Compact Balance Card */}
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
                        <div className="text-xs text-gray-500 uppercase font-semibold mr-2">Balance</div>
                        <div className="text-base font-bold text-gray-900">${walletBalance.toFixed(2)}</div>
                    </div>

                    <button
                        onClick={() => setShowAddFundsModal(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
                    >
                        <MdAdd className="text-lg" />
                        Add funds
                    </button>

                    <button className="flex items-center gap-2 px-3 py-2 border border-blue-100 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium">
                        <MdHelpOutline className="text-lg" />
                        Help
                    </button>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowAvailable(false)}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${!showAvailable
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
                            }`}
                    >
                        My Numbers ({myNumbersCount})
                    </button>
                    <button
                        onClick={() => setShowAvailable(true)}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${showAvailable
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
                            }`}
                    >
                        Available Numbers ({phoneNumbers.filter(p => p.status === "available").length})
                    </button>
                </div>

                {showAvailable && (
                    <button
                        onClick={() => setShowBuyModal(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium text-sm shadow-md transition-colors"
                    >
                        Buy Phone Number
                    </button>
                )}
            </div>

            {/* Table Section */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Phone number</th>
                                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Agent</th>
                                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Provider</th>
                                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Purchased</th>
                                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Renews on</th>
                                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase">Rent</th>
                                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredNumbers.length > 0 ? (
                                filteredNumbers.map((phone) => (
                                    <tr key={phone._id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-gray-900">
                                            {phone.displayNumber}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            {phone.linkedAgentName ? (
                                                <span className="flex items-center gap-2">
                                                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                                    <span className="truncate max-w-[200px]" title={phone.linkedAgentName}>
                                                        {phone.linkedAgentName}
                                                    </span>
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 italic">Unassigned</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">Custom SIP</td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {phone.purchasedAt ? format(new Date(phone.purchasedAt), "MMM dd, yyyy") : "N/A"}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {getRenewalDate(phone)}
                                        </td>
                                        <td className="px-4 py-3 text-gray-900 font-medium">$5.0</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-3">
                                                {!showAvailable && (
                                                    <button
                                                        onClick={() => openUnlinkModal(phone.number, phone.linkedAgentName)}
                                                        disabled={!phone.linkedAgentId}
                                                        className={`${phone.linkedAgentId
                                                            ? "text-orange-600 hover:text-orange-700 cursor-pointer"
                                                            : "text-gray-300 cursor-not-allowed"
                                                            }`}
                                                        title="Unlink agent"
                                                    >
                                                        <MdLinkOff className="text-xl" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => openDeleteModal(phone.number, phone.displayNumber)}
                                                    className="text-gray-400 hover:text-red-600 transition-colors"
                                                    title="Delete number"
                                                >
                                                    <MdDeleteOutline className="text-xl" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                                        {showAvailable
                                            ? "No available phone numbers. All numbers are assigned to agents."
                                            : "No phone numbers assigned yet. Buy a number to get started."
                                        }
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            <AddFundsModal
                isOpen={showAddFundsModal}
                onClose={() => setShowAddFundsModal(false)}
                onSuccess={(newBalance) => setWalletBalance(newBalance)}
            />

            <BuyNumberModal
                isOpen={showBuyModal}
                onClose={() => setShowBuyModal(false)}
                availableNumbers={availableNumbers}
                onPurchase={handlePurchase}
                walletBalance={walletBalance}
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen && confirmModal.type === 'unlink'}
                onClose={closeModal}
                onConfirm={handleUnlinkConfirm}
                title="Unlink Agent"
                message={`Are you sure you want to unlink agent "${confirmModal.data?.agentName}" from phone number ${confirmModal.data?.number}? The number will become available for reassignment.`}
                confirmText="Unlink Agent"
                type="danger"
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen && confirmModal.type === 'delete'}
                onClose={closeModal}
                onConfirm={handleDeleteConfirm}
                title="Release Phone Number"
                message={`⚠️ Warning: You are about to release phone number ${confirmModal.data?.displayNumber}.

This will:
• Remove ownership of this number
• Cancel your remaining subscription
• Return the number to the available pool
• Require you to purchase it again if you want it back

Are you sure you want to continue?`}
                confirmText="Release Number"
                type="danger"
            />
        </div>
    );
};

export default MyNumbers;
