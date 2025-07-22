import { OpenAI } from 'openai';
import fetch from 'node-fetch';
import nodemailer from 'nodemailer';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// The main serverless function
export default async function handler(request, response) {
    // Only accept POST requests
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Method Not Allowed' });
    }

    const { address, email } = request.body;
    if (!address || !email) {
        return response.status(400).json({ message: 'Address and email are required' });
    }

    try {
        // --- 1. Get structured data from AI ---
        console.log(`[1/4] Generating AI data for: ${address}`);
        const prompt = `Act as a U.S. emergency preparedness analyst. For the address "${address}", generate a concise evacuation plan. Your response must be ONLY a valid JSON object. Do not include any text or markdown before or after the JSON. The JSON must contain these exact keys: "risk_level_text", "risk_level_color", "critical_threats_count", "shelter_distance", "risks", "action_steps", "kit_items", "primary_route", "meeting_point". The "risks" key should be an array of objects, where each object has "type", "level_text", "level_color", and "advice". Use "high", "medium", or "low" for level_color. Generate realistic but mock data.`;
        
        const aiCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
        });
        const reportData = JSON.parse(aiCompletion.choices[0].message.content);

        // Add report-specific data
        reportData.address = address;
        reportData.report_date = new Date().toLocaleDateString('en-US');
        reportData.report_id = `SRWX-${Date.now()}`;


        // --- 2. Generate PDF using PDFMonkey ---
        console.log('[2/4] Sending data to PDFMonkey...');
        const pdfResponse = await fetch('https://api.pdfmonkey.com/v1/documents', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.PDFMONKEY_API_KEY}`,
            },
            body: JSON.stringify({
                document: {
                    template_id: process.env.PDFMONKEY_TEMPLATE_ID,
                    payload: reportData,
                    status: 'draft',
                }
            }),
        });

        if (!pdfResponse.ok) {
            const errorText = await pdfResponse.text();
            throw new Error(`PDFMonkey API Error: ${errorText}`);
        }
        const pdfData = await pdfResponse.json();
        const downloadUrl = pdfData.document.download_url;


        // --- 3. Download the generated PDF file ---
        console.log('[3/4] Downloading generated PDF...');
        const pdfFileResponse = await fetch(downloadUrl);
        const pdfBuffer = await pdfFileResponse.arrayBuffer();


        // --- 4. Send the email with PDF attachment ---
        console.log(`[4/4] Sending email to: ${email}...`);
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_SERVER_USER,
                pass: process.env.EMAIL_SERVER_PASSWORD,
            },
        });

        await transporter.sendMail({
            from: `"Surwix Reports" <${process.env.EMAIL_SERVER_USER}>`,
            to: email,
            subject: `Your Personal Evacuation Plan from Surwix for ${address}`,
            text: "Thank you for using Surwix. Your AI-generated evacuation plan is attached to this email.",
            attachments: [{
                filename: 'Surwix-Evacuation-Plan.pdf',
                content: Buffer.from(pdfBuffer),
                contentType: 'application/pdf',
            }],
        });

        // --- SUCCESS ---
        console.log('Process complete. Sending success response.');
        return response.status(200).json({ message: 'Success! Your report has been generated and sent to your email.' });

    } catch (error) {
        console.error('An error occurred in the process:', error);
        return response.status(500).json({ message: 'A server error occurred. Please try again later.' });
    }
}
