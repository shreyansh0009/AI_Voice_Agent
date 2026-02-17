/**
 * Dynamic Razorpay SDK Loader
 * 
 * Loads the Razorpay checkout.js script on demand instead of blocking page load.
 * The script is only loaded once and cached for subsequent calls.
 */

let razorpayPromise = null;

export function loadRazorpay() {
    if (razorpayPromise) return razorpayPromise;

    // If already loaded globally (e.g. by another mechanism)
    if (window.Razorpay) {
        razorpayPromise = Promise.resolve(window.Razorpay);
        return razorpayPromise;
    }

    razorpayPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        script.onload = () => resolve(window.Razorpay);
        script.onerror = () => {
            razorpayPromise = null; // Allow retry
            reject(new Error("Failed to load Razorpay SDK"));
        };
        document.body.appendChild(script);
    });

    return razorpayPromise;
}
