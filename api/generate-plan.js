import nodemailer from 'nodemailer';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Новая функция, которая просит у ИИ структурированный JSON
async function getAiRecommendations(address) {
    console.log(`Requesting structured JSON AI recommendations for: ${address}`);

    const prompt = `
        Act as a senior emergency preparedness analyst from FEMA.
        The target U.S. address is: "${address}".

        Your task is to return a response ONLY in a valid JSON format. Do not include any text before or after the JSON object.
        The JSON object must have two top-level keys: "riskScores" and "reportHtml".

        1.  In "riskScores", provide an object with five keys: "flood", "fire", "wind", "air", "heat". For each key, provide an estimated integer risk score from 1 to 10 based on the general location.
        2.  In "reportHtml", provide a detailed evacuation plan in a single HTML string. The HTML should be well-structured with <h2> and <ul>/<li> tags and must include these sections:
            - Primary Risks Assessment: A text analysis of the risks.
            - Immediate Evacuation Checklist: A bulleted list of actions.
            - "Go-Bag" Essentials: A bulleted list of items.
            - Evacuation Route Strategy: General advice on routes.

        Example of the required JSON output structure:
        {
          "riskScores": {
            "flood": 2,
            "fire": 7,
            "wind": 4,
            "air": 3,
            "heat": 8
          },
          "reportHtml": "<h2>Primary Risks Assessment</h2><p>Your area is primarily at risk of wildfires...</p>..."
        }
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            response_format: { type: "json_object" }, // Просим ИИ гарантированно вернуть JSON
            messages: [{ role: "user", content: prompt }],
        });
        // Парсим JSON из ответа ИИ
        return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
        console.error("Error fetching from OpenAI:", error);
        return null; // Возвращаем null в случае ошибки
    }
}

// Новая функция, которая создает URL для графика
function getChartUrl(scores) {
    const chartConfig = {
        type: 'bar',
        data: {
            labels: ['Flood', 'Fire', 'Wind', 'Air', 'Heat'],
            datasets: [{
                label: 'Risk Score',
                data: [scores.flood, scores.fire, scores.wind, scores.air, scores.heat],
                backgroundColor: 'rgba(211, 47, 47, 0.7)',
                borderColor: 'rgba(183, 28, 28, 1)',
                borderWidth: 1
            }]
        },
        options: {
            title: { display: false },
            legend: { display: false },
            scales: { yAxes: [{ ticks: { beginAtZero: true, max: 10 } }] }
        }
    };
    // Кодируем конфигурацию для вставки в URL
    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${encodedConfig}&width=500&height=300&backgroundColor=white`;
}

// Финальный HTML-шаблон с графиком
function getPdfHtml(address, reportHtml, chartUrl) {
    return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 15px; color: #212121; line-height: 1.7; }
                .container { padding: 25px; }
                h1 { font-size: 28px; color: #c62828; border-bottom: 2px solid #ef5350; padding-bottom: 10px; text-align: center; }
                h2 { font-size: 20px; color: #37474f; margin-top: 30px; border-bottom: 1px solid #cfd8dc; padding-bottom: 8px; }
                .chart-container { text-align: center; margin-top: 20px; }
                .footer { margin-top: 40px; font-size: 12px; color: #757575; text-align: center; border-top: 1px solid #eceff1; padding-top: 15px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Персональный план эвакуации</h1>
                <p><strong>Адрес:</strong> ${address}</p>
                
                <h2>Обзор климатических рисков</h2>
                <div class="chart-container">
                    <img src="${chartUrl}" alt="Climate Risk Chart">
                </div>

                ${reportHtml}

                <div class="footer">
                    <p><em>Отчет сгенерирован с помощью ИИ. Данные носят оценочный характер. Всегда следуйте указаниям экстренных служб.</em></p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Основной обработчик
export default async function handler(request, response) {
    const { address, email } = request.body;
    if (!address || !email) return response.status(400).json({ message: 'Address and email are required' });

    try {
        const aiData = await getAiRecommendations(address);
        if (!aiData) throw new Error("Failed to get data from AI");

        const chartUrl = getChartUrl(aiData.riskScores);
        const html = getPdfHtml(address, aiData.reportHtml, chartUrl);

        const pdfResponse = await fetch('https://v2018.api2pdf.com/chrome/html', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': process.env.API2PDF_KEY },
            body: JSON.stringify({ html: html, inlinePdf: true, options: { landscape: false } }),
        });

        if (!pdfResponse.ok) throw new Error(`Api2Pdf error: ${await pdfResponse.text()}`);

        const { pdf: pdfUrl } = await pdfResponse.json();
        const pdfDownloadResponse = await fetch(pdfUrl);
        const pdfBuffer = await pdfDownloadResponse.arrayBuffer();

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_SERVER_USER, pass: process.env.EMAIL_SERVER_PASSWORD },
        });
        await transporter.sendMail({
            from: `"Evacuation Plan Bot" <${process.env.EMAIL_SERVER_USER}>`,
            to: email,
            subject: `Ваш детальный ИИ-план эвакуации (с графиками) для ${address}`,
            text: "Ваш PDF-план эвакуации прикреплен к этому письму.",
            attachments: [{
                filename: 'AI-Evacuation-Plan-Pro.pdf',
                content: Buffer.from(pdfBuffer),
                contentType: 'application/pdf',
            }],
        });

        response.status(200).json({ message: `Профессиональный PDF-отчет от ИИ успешно сгенерирован и отправлен на почту ${email}!` });

    } catch (error) {
        console.error(error);
        response.status(500).json({ message: 'Что-то пошло не так при создании отчета.' });
    }
}
