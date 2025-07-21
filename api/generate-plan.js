import nodemailer from 'nodemailer';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ФУНКЦИЯ ДЛЯ ЗАПРОСА К ИИ (без изменений)
async function getAiRecommendations(address) {
    const prompt = `Act as a FEMA emergency analyst for the U.S. address: "${address}". Return a JSON object with two keys: "riskScores" (object with integer scores 1-10 for flood, fire, wind, air, heat) and "reportHtml" (a detailed evacuation plan in HTML with <h2> and <ul> sections for Primary Risks, Evacuation Checklist, Go-Bag, and Route Strategy).`;
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
        });
        return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
        console.error("Error fetching from OpenAI:", error);
        return null;
    }
}

// НОВАЯ ФУНКЦИЯ ДЛЯ ПОИСКА БОЛЬНИЦ ЧЕРЕЗ GOOGLE PLACES API
async function getNearbyHospitals(address) {
    console.log(`Searching for hospitals near: ${address}`);
    try {
        const searchParams = new URLSearchParams({
            query: `hospital near ${address}`,
            key: process.env.Maps_API_KEY, // Убедитесь, что ваш ключ Google назван так в Vercel
        });
        const response = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${searchParams}`);
        if (!response.ok) throw new Error(`Google Places API error: ${response.statusText}`);
        
        const data = await response.json();
        return data.results.slice(0, 3); // Возвращаем до 3 найденных больниц
    } catch (error) {
        console.error("Error fetching from Google Places:", error);
        return []; // Возвращаем пустой массив в случае ошибки
    }
}

// ФУНКЦИЯ ДЛЯ ГРАФИКА (без изменений)
function getChartUrl(scores) {
    const chartConfig = { type: 'bar', data: { labels: ['Flood', 'Fire', 'Wind', 'Air', 'Heat'], datasets: [{ label: 'Risk Score', data: [scores.flood, scores.fire, scores.wind, scores.air, scores.heat], backgroundColor: 'rgba(211, 47, 47, 0.7)' }] }, options: { legend: { display: false }, scales: { yAxes: [{ ticks: { beginAtZero: true, max: 10 } }] } } };
    return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&width=500&height=300&backgroundColor=white`;
}

// НОВЫЙ, КРАСИВЫЙ HTML-ШАБЛОН ДЛЯ PDF
function getPdfHtml(address, aiData, hospitals) {
    // Создаем HTML-список больниц
    const hospitalsHtml = hospitals.length > 0
        ? `<ul>${hospitals.map(h => `<li><strong>${h.name}</strong><br>${h.formatted_address}</li>`).join('')}</ul>`
        : "<p>Не удалось загрузить список ближайших медицинских учреждений.</p>";

    return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; color: #333; }
                .container { padding: 30px; }
                .header { text-align: center; border-bottom: 2px solid #d9534f; padding-bottom: 15px; margin-bottom: 20px; }
                .header h1 { font-size: 26pt; color: #d9534f; margin: 0; }
                .header p { font-size: 12pt; color: #777; margin: 5px 0 0 0; }
                .section h2 { font-size: 16pt; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 8px; margin-top: 25px; margin-bottom: 15px; }
                .chart-container { text-align: center; margin: 25px 0; }
                ul { padding-left: 20px; }
                li { margin-bottom: 10px; }
                .footer { margin-top: 40px; font-size: 9pt; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 15px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>План экстренной эвакуации</h1>
                    <p>${address}</p>
                </div>

                <div class="section">
                    <h2>Обзор климатических рисков</h2>
                    <div class="chart-container"><img src="${getChartUrl(aiData.riskScores)}" alt="Climate Risk Chart"></div>
                </div>

                <div class="section">
                    ${aiData.reportHtml}
                </div>

                <div class="section">
                    <h2>Ближайшие медицинские учреждения</h2>
                    ${hospitalsHtml}
                </div>

                <div class="footer">
                    <p>Отчет сгенерирован с помощью ИИ и данных Google Maps. Информация носит рекомендательный характер. Всегда следуйте указаниям экстренных служб.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// ФИНАЛЬНАЯ ВЕРСИЯ ОСНОВНОГО ОБРАБОТЧИКА
export default async function handler(request, response) {
    const { address, email } = request.body;
    if (!address || !email) return response.status(400).json({ message: 'Address and email are required' });

    try {
        // Запускаем запросы к ИИ и Google параллельно, чтобы сэкономить время
        const [aiData, hospitals] = await Promise.all([
            getAiRecommendations(address),
            getNearbyHospitals(address)
        ]);

        if (!aiData) throw new Error("Failed to get data from AI");

        const html = getPdfHtml(address, aiData, hospitals);

        const pdfResponse = await fetch('https://v2018.api2pdf.com/chrome/html', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': process.env.API2PDF_KEY },
            body: JSON.stringify({ html: html, inlinePdf: true }),
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
            subject: `Ваш профессиональный отчет по эвакуации для ${address}`,
            text: "Ваш PDF-отчет прикреплен к этому письму.",
            attachments: [{ filename: 'Pro-Evacuation-Report.pdf', content: Buffer.from(pdfBuffer), contentType: 'application/pdf' }],
        });

        response.status(200).json({ message: `Профессиональный PDF-отчет успешно сгенерирован и отправлен на почту ${email}!` });

    } catch (error) {
        console.error(error);
        response.status(500).json({ message: 'Что-то пошло не так при создании профессионального отчета.' });
    }
}
