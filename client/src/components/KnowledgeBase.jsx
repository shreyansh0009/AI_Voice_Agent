import React, { useState, useEffect, useRef } from "react";
import { loadRazorpay } from "../utils/razorpayLoader";
import axios from "axios";
import api from "../utils/api";
import { MdAdd, MdClose } from "react-icons/md";
import { FiTrash2, FiHelpCircle, FiSettings } from "react-icons/fi";

const API_URL = import.meta.env.VITE_API_URL || "";

export default function KnowledgeBase() {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [walletBalance, setWalletBalance] = useState(0);
    const [showAddFundsModal, setShowAddFundsModal] = useState(false);
    const [deletingFile, setDeletingFile] = useState(null);
    const fileInputRef = useRef(null);

    // Fetch wallet balance
    const fetchWalletBalance = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await axios.get(`${API_URL}/api/payments/wallet`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.data.success) {
                setWalletBalance(response.data.balance);
            }
        } catch (error) {
            console.error("Error fetching wallet:", error);
        }
    };

    // Fetch knowledge base files
    const fetchFiles = async () => {
        try {
            setLoading(true);
            const res = await api.get("/api/knowledge-files");
            if (res.data.success) {
                setFiles(res.data.files);
            }
        } catch (error) {
            console.error("Error fetching knowledge files:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWalletBalance();
        fetchFiles();
    }, []);

    // Upload file
    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("files", file);

            await api.post("/api/upload-knowledge", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            // Refresh the file list
            await fetchFiles();
        } catch (error) {
            console.error("Error uploading file:", error);
            const msg =
                error.response?.data?.error || "Failed to upload file. Please try again.";
            alert(msg);
        } finally {
            setUploading(false);
            // Reset input so the same file can be re-selected
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // Delete file
    const handleDelete = async (fileName) => {
        if (!window.confirm("Are you sure you want to delete this knowledge base entry? This will remove it from the vector database, Cloudinary, and MongoDB.")) {
            return;
        }

        setDeletingFile(fileName);
        try {
            await api.delete(`/api/knowledge-files/${fileName}`);
            setFiles((prev) => prev.filter((f) => f.fileName !== fileName));
        } catch (error) {
            console.error("Error deleting file:", error);
            alert("Failed to delete file.");
        } finally {
            setDeletingFile(null);
        }
    };

    // Format relative time
    const formatRelativeTime = (dateStr) => {
        const now = new Date();
        const date = new Date(dateStr);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        const diffMonths = Math.floor(diffDays / 30);

        if (diffMins < 1) return "just now";
        if (diffMins < 60) return `${diffMins} min ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
        if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
        return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
    };

    // Get file type label
    const getFileType = (mimeType) => {
        if (!mimeType) return "File";
        if (mimeType.includes("pdf")) return "Pdf";
        if (mimeType.includes("doc") || mimeType.includes("word")) return "Doc";
        if (mimeType.includes("text")) return "Txt";
        return "File";
    };

    // Status badge
    const StatusBadge = ({ status }) => {
        const styles = {
            processed: "text-gray-700",
            processing: "text-blue-600",
            error: "text-red-600 font-medium",
        };
        const labels = {
            processed: "processed",
            processing: "processing",
            error: "error",
        };
        return (
            <span className={`text-sm ${styles[status] || "text-gray-500"}`}>
                {labels[status] || status || "unknown"}
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 p-2 sm:p-4 md:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Knowledge Base</h1>
                    <p className="text-sm text-gray-500">
                        Manage knowledge base entries and upload PDFs
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                    {/* Wallet Balance */}
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

            {/* Upload Button */}
            <div className="flex justify-end mb-4">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={handleUpload}
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {uploading ? (
                        <>
                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Uploading...
                        </>
                    ) : (
                        "Add Knowledge Base"
                    )}
                </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50/80">
                                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">RAG ID</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Source</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Delete</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center">
                                        <div className="flex items-center justify-center gap-2 text-gray-500">
                                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            Loading knowledge base...
                                        </div>
                                    </td>
                                </tr>
                            ) : files.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                                        <p className="text-lg font-medium mb-1">No knowledge base entries</p>
                                        <p className="text-sm">Upload a PDF to get started</p>
                                    </td>
                                </tr>
                            ) : (
                                files.map((file) => (
                                    <tr
                                        key={file._id}
                                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                                    >
                                        {/* RAG ID */}
                                        <td className="px-4 py-3">
                                            <span className="text-sm text-gray-600 font-mono">
                                                {file._id}
                                            </span>
                                        </td>

                                        {/* Source (original file name) */}
                                        <td className="px-4 py-3">
                                            <span className="text-sm text-gray-900">
                                                {file.originalName}
                                            </span>
                                        </td>

                                        {/* Type */}
                                        <td className="px-4 py-3">
                                            <span className="text-sm text-gray-600">
                                                {getFileType(file.mimeType)}
                                            </span>
                                        </td>

                                        {/* Created */}
                                        <td className="px-4 py-3">
                                            <span className="text-sm text-gray-600">
                                                {formatRelativeTime(file.uploadedAt)}
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-3">
                                            <StatusBadge status={file.status || (file.processedForRAG ? "processed" : "processing")} />
                                        </td>

                                        {/* Delete */}
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleDelete(file.fileName)}
                                                disabled={deletingFile === file.fileName}
                                                className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                                                title="Delete file"
                                            >
                                                {deletingFile === file.fileName ? (
                                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                    </svg>
                                                ) : (
                                                    <FiTrash2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

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

// Add Funds Content Component (same as in AgentSetup)
function AddFundsContent({ onSuccess, onClose }) {
    const [amount, setAmount] = useState(10);
    const [loading, setLoading] = useState(false);
    const presetAmounts = [5, 10, 25, 50, 100];

    const handlePayment = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");

            const orderRes = await axios.post(
                `${API_URL}/api/payments/create-order`,
                { amount },
                { headers: { Authorization: `Bearer ${token}` } }
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
                        const verifyRes = await axios.post(
                            `${API_URL}/api/payments/verify-payment`,
                            {
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                            },
                            { headers: { Authorization: `Bearer ${token}` } }
                        );

                        if (verifyRes.data.success) {
                            onSuccess(verifyRes.data.walletBalance);
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