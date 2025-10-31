## 🐛 OpenAI Integration Debugging Guide

### Issue: Not getting responses when sending messages like "hello"

---

## ✅ Quick Fixes Applied

I've added enhanced debugging and error handling to help identify the issue:

### 1. **Added Console Logging**
Open your browser's Developer Console (F12) and you'll now see:
- `Sending message to OpenAI: [your message]`
- `System prompt: [current prompt]`
- `API Key exists: true/false`
- `OpenAI Response: [full response]`
- Detailed error information if something fails

### 2. **Better Error Messages**
Errors now show in the chat with specific messages:
- ❌ Invalid API key
- ❌ Rate limit exceeded
- ❌ Network error
- ❌ Server error

### 3. **Visual Error Display**
Errors appear in red boxes in the chat history

---

## 🔍 How to Debug

### Step 1: Open Developer Console
1. Press **F12** in your browser
2. Click on **Console** tab
3. Send a message "hello"
4. Watch for console output

### Step 2: Check What the Console Shows

#### ✅ If you see "API Key exists: true"
Good! API key is loaded. Continue to next check.

#### ❌ If you see "API Key exists: false"
**Fix:** Restart the dev server
```bash
# Stop the server (Ctrl+C in terminal)
cd /home/shreyansh0009/CRM_Landing/dashboard/AI_voice_crm/client
npm run dev
```

### Step 3: Look for OpenAI Response

#### ✅ If you see "OpenAI response received"
Working! The response should appear in chat.

#### ❌ If you see errors like:

**"Invalid API key" (401 error)**
```bash
# Your API key might be expired or invalid
# Check: https://platform.openai.com/api-keys
# Replace the key in .env.local and restart server
```

**"Rate limit exceeded" (429 error)**
```bash
# You've hit OpenAI's free tier limits
# Wait 60 seconds and try again
# Or check usage: https://platform.openai.com/usage
```

**"Network error" or "fetch failed"**
```bash
# Check your internet connection
# Firewall might be blocking OpenAI API
# Try: curl https://api.openai.com/v1/models
```

---

## 🎯 Common Issues & Solutions

### Issue 1: Server on wrong port
**Symptom:** Server is on port 5174 instead of 5173
**Fix:** Use the correct URL shown in terminal
```
Current URL: http://localhost:5174
```

### Issue 2: Environment variable not loading
**Symptom:** Console shows "API Key exists: false"
**Fix:** 
1. Make sure file is named `.env.local` (not `.env`)
2. Restart dev server completely
3. Check file location: `/client/.env.local`

### Issue 3: API key format wrong
**Symptom:** 401 error or "Invalid API key"
**Fix:** 
- Key should start with `sk-proj-`
- No spaces before/after the key
- No quotes around the key in .env.local

### Issue 4: CORS or browser errors
**Symptom:** "dangerouslyAllowBrowser" warnings
**Solution:** This is expected for development. Ignore the warning.

---

## 🧪 Test Steps

1. **Open your app:** http://localhost:5174 (or whatever port terminal shows)
2. **Open Console:** Press F12
3. **Navigate to Dashboard**
4. **Scroll to "AI Testing Hub"**
5. **Type "hello" and click Send**
6. **Check Console output:**
   ```
   Sending message to OpenAI: hello
   System prompt: You are a professional...
   API Key exists: true
   Creating chat completion with: {...}
   OpenAI response received: {...}
   OpenAI Response: { success: true, data: "..." }
   ```
7. **Response should appear in chat**

---

## 📋 Verification Checklist

Run through this checklist:

- [ ] Dev server is running (npm run dev)
- [ ] Using correct URL (check terminal for port number)
- [ ] `.env.local` file exists in `/client/` folder
- [ ] API key in `.env.local` starts with `sk-proj-`
- [ ] Browser console is open (F12)
- [ ] No red errors in console before sending message
- [ ] Click "Send Message" button (not just typing)
- [ ] Check console for detailed logs
- [ ] Check Network tab for API calls to OpenAI

---

## 🔧 Manual Test Commands

### Test 1: Check if API key is accessible
Open browser console and run:
```javascript
console.log(import.meta.env.VITE_OPENAI_API_KEY ? 'Key loaded' : 'Key missing');
```

### Test 2: Check OpenAI package loaded
```javascript
import('openai').then(() => console.log('OpenAI package loaded')).catch(e => console.error('Package error:', e));
```

---

## 🆘 Still Not Working?

### Share these details:
1. **Console errors** (copy full error from F12 console)
2. **Network tab** (check if request to api.openai.com is being made)
3. **Server terminal output** (any errors there?)
4. **Browser used** (Chrome, Firefox, etc.)

### Quick diagnostic:
```bash
# In terminal, check if env file is correct:
cd /home/shreyansh0009/CRM_Landing/dashboard/AI_voice_crm/client
cat .env.local

# Should show:
# VITE_OPENAI_API_KEY=sk-proj-...
```

---

## 💡 Expected Behavior

When working correctly:

1. You type "hello"
2. Console shows: "Sending message to OpenAI: hello"
3. Loading animation appears (3 bouncing dots)
4. Console shows: "OpenAI response received"
5. AI response appears in chat box
6. Response might be something like: "Hello! How can I assist you today?"

---

**Current Status:** 
- ✅ OpenAI SDK installed
- ✅ API key configured
- ✅ Debug logging added
- ✅ Error handling enhanced
- ✅ Dev server running on port 5174

**Next:** Open browser console, send "hello", and check the console output!
