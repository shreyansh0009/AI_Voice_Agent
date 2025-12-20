# Serverless Functions for Vercel

This directory contains serverless functions specifically for Vercel deployment.

## Purpose

Vercel requires API endpoints to be defined as serverless functions in the `/api` directory. These functions provide the same functionality as the Express routes in `/routes`, but are optimized for Vercel's serverless architecture.

## Structure

```
api/
└── speech/
    ├── tts/
    │   └── tabbly.js    # Tabbly Text-to-Speech endpoint
    └── stt/
        └── sarvam.js    # Sarvam Speech-to-Text endpoint
```

## How It Works

### Local Development (localhost)

- Uses Express routes from `/routes/speechRoutes.js`
- Traditional Express middleware and routing
- Runs on `http://localhost:5000`

### Vercel Deployment

- Uses serverless functions from `/api/speech/*`
- Each function is an independent serverless endpoint
- Configured in `vercel.json`

### Shared Code

Both approaches use the same:

- Controllers (`/controllers/speechController.js`)
- Services (`/services/tts.service.js`)
- Middleware (`/middleware/authMiddleware.js`)

## Endpoints

### POST /api/speech/tts/tabbly

**File:** `api/speech/tts/tabbly.js`

Converts text to speech using Tabbly AI.

**Request:**

```json
{
  "text": "Hello, world!",
  "voice": "Ashley"
}
```

**Headers:**

```
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>
```

**Response:**

- Content-Type: `audio/wav`
- Body: Audio buffer

### POST /api/speech/stt/sarvam

**File:** `api/speech/stt/sarvam.js`

Converts speech to text using Sarvam AI.

**Request:**

- Content-Type: `multipart/form-data`
- Body: `audio` file field

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Response:**

```json
{
  "success": true,
  "transcript": "transcribed text here"
}
```

## Environment Variables

Required environment variables (set in Vercel dashboard):

```bash
# Tabbly TTS
TABBLY_API_KEY=your_key
TABBLY_MEMBER_ID=your_id (optional)
TABBLY_ORGANIZATION_ID=your_org_id (optional)

# Sarvam STT
SARVAM_API_KEY=your_key

# Authentication
JWT_SECRET=your_secret

# Other services
OPENAI_API_KEY=your_key
MONGODB_URI=your_uri
CLOUDINARY_CLOUD_NAME=your_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
```

## Adding New Endpoints

To add a new serverless endpoint:

1. **Create the function file:**

   ```javascript
   // api/your-service/endpoint.js
   import dotenv from "dotenv";
   import yourController from "../../controllers/yourController.js";
   import { authenticate } from "../../middleware/authMiddleware.js";

   dotenv.config();

   export default async function handler(req, res) {
     // Handle CORS
     res.setHeader("Access-Control-Allow-Origin", "*");
     res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
     res.setHeader(
       "Access-Control-Allow-Headers",
       "Content-Type, Authorization"
     );

     if (req.method === "OPTIONS") {
       return res.status(200).end();
     }

     if (req.method !== "POST") {
       return res.status(405).json({ message: "Method not allowed" });
     }

     try {
       // Apply authentication
       await new Promise((resolve, reject) => {
         authenticate(req, res, (err) => {
           if (err) reject(err);
           else resolve();
         });
       });

       // Call your controller
       await yourController.yourMethod(req, res);
     } catch (error) {
       if (!res.headersSent) {
         res.status(500).json({ message: error.message });
       }
     }
   }
   ```

2. **Update vercel.json:**

   ```json
   {
     "builds": [
       {
         "src": "api/your-service/endpoint.js",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/api/your-service/endpoint",
         "dest": "api/your-service/endpoint.js",
         "methods": ["POST", "OPTIONS"]
       }
     ]
   }
   ```

3. **Deploy:**
   ```bash
   git add .
   git commit -m "Add new serverless endpoint"
   git push
   ```

## Testing

### Test locally:

```bash
cd server
npm run dev
```

### Test on Vercel:

```bash
curl -X POST https://your-app.vercel.app/api/speech/tts/tabbly \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"text": "test", "voice": "Ashley"}'
```

## Troubleshooting

### 405 Method Not Allowed

- Check `vercel.json` has the correct route configuration
- Verify the HTTP method is allowed in the route
- Ensure the function exports a default handler

### 500 Internal Server Error

- Check Vercel deployment logs
- Verify environment variables are set
- Check function logs in Vercel dashboard

### CORS Errors

- Ensure CORS headers are set in the function
- Check that OPTIONS method is handled
- Verify the origin is allowed

## Notes

- Serverless functions have a **60-second timeout** (configured in vercel.json)
- File uploads use `/tmp` directory in serverless environment
- Each function is stateless and independent
- Functions are automatically scaled by Vercel

## References

- [Vercel Serverless Functions](https://vercel.com/docs/concepts/functions/serverless-functions)
- [Vercel Node.js Runtime](https://vercel.com/docs/runtimes#official-runtimes/node-js)
- [Vercel Configuration](https://vercel.com/docs/configuration)
