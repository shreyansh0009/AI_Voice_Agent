import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Download file from a URL to buffer (with authentication headers support)
 */
async function downloadFileToBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const options = {
      headers: headers
    };
    
    client.get(url, options, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFileToBuffer(response.headers.location, headers)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Get file content from Cloudinary as a buffer
 * Downloads the file by making an authenticated API request
 */
async function getCloudinaryFileBuffer(publicId) {
  try {
    console.log('📥 Downloading from Cloudinary, public_id:', publicId);
    
    // Generate download URL with signature for authentication
    const timestamp = Math.round(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      {
        public_id: publicId,
        timestamp: timestamp
      },
      process.env.CLOUDINARY_API_SECRET
    );
    
    // Construct the authenticated download URL
    const downloadUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/raw/download?` +
      `public_id=${encodeURIComponent(publicId)}&` +
      `timestamp=${timestamp}&` +
      `signature=${signature}&` +
      `api_key=${process.env.CLOUDINARY_API_KEY}`;
    
    console.log('📥 Downloading from authenticated URL');
    const buffer = await downloadFileToBuffer(downloadUrl);
    
    console.log('✅ Downloaded file buffer size:', buffer.length);
    
    return buffer;
  } catch (error) {
    console.error('❌ Error downloading from Cloudinary:', error);
    throw error;
  }
}

/**
 * Check if path is a URL
 */
function isUrl(path) {
  return path.startsWith('http://') || path.startsWith('https://');
}

/**
 * Extract text from PDF file
 */
export async function extractTextFromPDF(filePath, isCloudinary = false, cloudinaryPublicId = null) {
  try {
    let dataBuffer;
    
    if (isCloudinary && cloudinaryPublicId) {
      dataBuffer = await getCloudinaryFileBuffer(cloudinaryPublicId);
    } else if (isUrl(filePath)) {
      dataBuffer = await downloadFileToBuffer(filePath);
    } else {
      dataBuffer = fs.readFileSync(filePath);
    }
    
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

/**
 * Extract text from Word document
 */
export async function extractTextFromWord(filePath, isCloudinary = false, cloudinaryPublicId = null) {
  try {
    let result;
    
    if (isCloudinary && cloudinaryPublicId) {
      const buffer = await getCloudinaryFileBuffer(cloudinaryPublicId);
      result = await mammoth.extractRawText({ buffer });
    } else if (isUrl(filePath)) {
      const buffer = await downloadFileToBuffer(filePath);
      result = await mammoth.extractRawText({ buffer });
    } else {
      result = await mammoth.extractRawText({ path: filePath });
    }
    
    return result.value;
  } catch (error) {
    console.error('Error extracting Word text:', error);
    throw new Error('Failed to extract text from Word document');
  }
}

/**
 * Extract text based on mime type
 */
export async function extractText(filePath, mimeType, isCloudinary = false, cloudinaryPublicId = null) {
  if (mimeType === 'application/pdf') {
    return await extractTextFromPDF(filePath, isCloudinary, cloudinaryPublicId);
  } else if (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return await extractTextFromWord(filePath, isCloudinary, cloudinaryPublicId);
  }
  throw new Error('Unsupported file type');
}
