import nodemailer from 'nodemailer';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Новая функция, которая просит у ИИ сгенерировать JSON с данными для отчета
async function getAiReportData(address) {
    console.log(`Requesting report data from AI for: ${address}`);

    const prompt = `
        Act as a data analyst. For the U.S. address "${address}", generate a mock business intelligence report for an evacuation plan company.
        Your response must be ONLY a valid JSON object. Do not include any text before or after the JSON.
        The JSON must match this exact structure:
        {
          "followers": { "count": INTEGER, "difference": INTEGER, "progress": INTEGER_BETWEEN_0_AND_100 },
          "customers": { "count": INTEGER, "difference": INTEGER, "progress": INTEGER_BETWEEN_0_AND_100 },
          "sales": { "count": INTEGER, "difference": INTEGER, "progress": INTEGER_BETWEEN_0_AND_100 },
          "semester_revenues": [
            { "month": "Jan", "y2018": INTEGER, "y2019": INTEGER, "y2020": INTEGER },
            { "month": "Feb", "y2018": INTEGER, "y2019": INTEGER, "y2020": INTEGER },
            { "month": "Mar", "y2018": INTEGER, "y2019": INTEGER, "y2020": INTEGER },
            { "month": "Apr", "y2018": INTEGER, "y2019": INTEGER, "y2020": INTEGER },
            { "month": "May", "y2018": INTEGER, "y2019": INTEGER, "y2020": INTEGER },
            { "month": "Jun", "y2018": INTEGER, "y2019": INTEGER, "y2020": INTEGER }
          ],
          "expenses": { "support": INTEGER, "sales": INTEGER, "drives": INTEGER, "marketing": INTEGER, "allocated": INTEGER, "actual": INTEGER },
          "evacuation_plan_summary": "Provide a 2-3 sentence summary of the key evacuation advice for the area based on the address."
        }
        Generate realistic but random integer values for all fields.
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
        });
        return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
        console.error("Error from OpenAI:", error);
        throw new Error("Failed to get data from AI");
    }
}

// Основной обработчик
export default async function handler(request, response) {
    const { address, email } = request.body;
    if (!address || !email) return response.status(400).json({ message: 'Address and email are required' });

    try {
        // 1. Получаем данные от ИИ
        const aiData = await getAiReportData(address);

        // 2. Отправляем данные в PDFMonkey для генерации PDF
        const pdfResponse = await fetch(`https://api.pdfmonkey.com/v1/documents`, { // <--- Убедитесь, что эта строка скопирована точно
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.PDFMONKEY_API_KEY}`,
            },
            body: JSON.stringify({
                document: {
                    template_id: process.env.PDFMONKEY_TEMPLATE_ID,
                    payload: aiData,
                    status: 'draft',
                }
            }),
        });

        if (!pdfResponse.ok) {
            throw new Error(`PDFMonkey API error: ${await pdfResponse.text()}`);
        }

        const pdfData = await pdfResponse.json();
        const downloadUrl = pdfData.document.download_url;

        // 3. Скачиваем готовый PDF
        const pdfDownloadResponse = await fetch(downloadUrl);
        const pdfBuffer = await pdfDownloadResponse.arrayBuffer();

        // 4. Отправляем email
        const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_SERVER_USER, pass: process.env.EMAIL_SERVER_PASSWORD } });
        await transporter.sendMail({
            from: `"Evacuation Plan Bot" <${process.env.EMAIL_SERVER_USER}>`,
            to: email,
            subject: `Ваш BI отчет по эвакуации для ${address}`,
            text: "Ваш PDF-отчет прикреплен к этому письму.",
            attachments: [{
                filename: 'BI-Evacuation-Report.pdf',
                content: Buffer.from(pdfBuffer),
                contentType: 'application/pdf',
            }],
        });

        response.status(200).json({ message: `BI-отчет успешно сгенерирован и отправлен!` });

    } catch (error) {
        console.error(error);
        response.status(500).json({ message: 'Что-то пошло не так при создании отчета.' });
    }
}
