import nodemailer from 'nodemailer';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getAiReportData(address) {
    // ... (вспомогательная функция остается без изменений)
    const prompt = `Act as a data analyst...`; // Сокращено для краткости
    try {
        const completion = await openai.chat.completions.create({ model: "gpt-4o", response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] });
        return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
        console.error("Error from OpenAI:", error);
        throw new Error("Failed to get data from AI");
    }
}

// Основной обработчик с логами
export default async function handler(request, response) {
    const { address, email } = request.body;
    if (!address || !email) return response.status(400).json({ message: 'Address and email are required' });

    try {
        console.log("Step 1: Attempting to call OpenAI API...");
        const aiData = await getAiReportData(address);
        console.log("Step 2: OpenAI API call successful.");

        console.log("Step 3: Attempting to call PDFMonkey API...");
        const pdfResponse = await fetch(`https://api.pdfmonkey.com/v1/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.PDFMONKEY_API_KEY}` },
            body: JSON.stringify({ document: { template_id: process.env.PDFMONKEY_TEMPLATE_ID, payload: aiData, status: 'draft' } }),
        });
        console.log("Step 4: PDFMonkey API call successful.");

        if (!pdfResponse.ok) {
            throw new Error(`PDFMonkey API error: ${await pdfResponse.text()}`);
        }

        const pdfData = await pdfResponse.json();
        const downloadUrl = pdfData.document.download_url;

        console.log("Step 5: Attempting to download generated PDF...");
        const pdfDownloadResponse = await fetch(downloadUrl);
        const pdfBuffer = await pdfDownloadResponse.arrayBuffer();
        console.log("Step 6: PDF download successful.");

        console.log("Step 7: Attempting to send email...");
        const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_SERVER_USER, pass: process.env.EMAIL_SERVER_PASSWORD } });
        await transporter.sendMail({
            from: `"Evacuation Plan Bot" <${process.env.EMAIL_SERVER_USER}>`,
            to: email,
            subject: `Ваш BI отчет по эвакуации для ${address}`,
            text: "Ваш PDF-отчет прикреплен к этому письму.",
            attachments: [{ filename: 'BI-Evacuation-Report.pdf', content: Buffer.from(pdfBuffer), contentType: 'application/pdf' }],
        });
        console.log("Step 8: Email sent successfully.");

        response.status(200).json({ message: `BI-отчет успешно сгенерирован и отправлен!` });

    } catch (error) {
        console.error(error); // Эта строка выведет детальную ошибку
        response.status(500).json({ message: 'Что-то пошло не так при создании отчета.' });
    }
}
