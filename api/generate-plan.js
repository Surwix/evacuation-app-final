import nodemailer from 'nodemailer';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Формирует промт с приоритетом для твоих реальных riskScores.
 */
function buildPrompt(address, riskScores) {
    return `
You are a FEMA-level emergency preparedness expert.

1. Your goal is to generate a JSON object ONLY (no pre/post text). The JSON must have:
    - "riskScores": exact same values as provided.
    - "reportHtml": a fully structured HTML evacuation report with rich formatting, icons, color highlights, and user-friendly blocks.

2. The target address is: "${address}"
3. Use these CLIMATE RISKS as the basis for your analysis (do not guess, use exactly as given):
    - Flood: ${riskScores.flood}/10
    - Fire: ${riskScores.fire}/10
    - Wind: ${riskScores.wind}/10
    - Air: ${riskScores.air}/10
    - Heat: ${riskScores.heat}/10

In "reportHtml", include sections:
- <h2>Primary Risk Overview</h2> (analyze the given risk scores, say which are most relevant, add icons, color "Major"/"Moderate" risks in red/orange, others neutral/green)
- <h2>Evacuation Actions Checklist</h2> (bulleted, key steps, short)
- <h2>Go-Bag Essentials</h2> (bulleted list, 6-8 items)
- <h2>Evacuation Route Strategy</h2> (general advice)
- <h2>Emergency Contacts</h2> (universal: 911, local fire, etc)

Your HTML can include inline style attributes and emoji icons for risks (e.g., 🔥 for fire), color code risks, but keep design clean and print-friendly. All content should fit on 1-2 A4 pages and be clear for any family.

Strictly output a single valid JSON object as described above.
`;
}

/**
 * Генерирует эвакуационный план через OpenAI (с учётом твоих riskScores!).
 */
async function getAiRecommendations(address, riskScores) {
    console.log(`Requesting structured AI recommendations for: ${address}`);
    const prompt = buildPrompt(address, riskScores);

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

/**
 * Генерирует ссылку на график через QuickChart (можешь заменить на свой или Chart.js сервер).
 */
function getChartUrl(scores) {
    // Цвета для каждого риска (можно сделать динамическими)
    const colors = [
        scores.flood >= 5 ? 'rgba(33, 150, 243, 0.9)' : 'rgba(129, 199, 132, 0.8)', // blue/green
        scores.fire >= 5 ? 'rgba(229, 57, 53, 0.9)' : 'rgba(255, 205, 210, 0.8)',    // red/pink
        scores.wind >= 5 ? 'rgba(38, 166, 154, 0.9)' : 'rgba(178, 235, 242, 0.8)',   // teal/light blue
        scores.air  >= 5 ? 'rgba(120, 144, 156, 0.9)' : 'rgba(207, 216, 220, 0.8)',  // grey/light grey
        scores.heat >= 5 ? 'rgba(255, 167, 38, 0.9)' : 'rgba(255, 224, 178, 0.8)'    // orange/light orange
    ];
    const chartConfig = {
        type: 'horizontalBar',
        data: {
            labels: ['Flood', 'Fire', 'Wind', 'Air', 'Heat'],
            datasets: [{
                label: 'Risk Score',
                data: [scores.flood, scores.fire, scores.wind, scores.air, scores.heat],
                backgroundColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                xAxes: [{ ticks: { beginAtZero: true, max: 10 }, gridLines: { color: "#eee" } }],
                yAxes: [{ gridLines: { color: "#eee" } }]
            },
            legend: { display: false },
            title: { display: false }
        }
    };
    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${encodedConfig}&width=500&height=250&backgroundColor=white`;
}

/**
 * Улучшенный HTML шаблон для PDF.
 */
function getPdfHtml(address, riskScores, chartUrl, reportHtml) {
    // Можно добавить эмодзи и цвет в “riskScores” прямо тут для визуала:
    function riskBlock(name, icon, score, label) {
        let color;
        if (score >= 7) color = '#c62828'; // major: red
        else if (score >= 4) color = '#fbc02d'; // moderate: orange
        else color = '#388e3c'; // minor: green

        return `
        <div style="flex:1; background:#f5f5f5; margin:5px; border-radius:10px; padding:8px 0; text-align:center;">
          <div style="font-size:22px;">${icon}</div>
          <div style="font-weight:bold;">${name}</div>
          <div style="color:${color}; font-weight:bold;">${label} (${score}/10)</div>
        </div>`;
    }
    return `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Персональный план эвакуации</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #222; background: #fff; font-size: 15px; }
        .container { max-width: 720px; margin: 0 auto; padding: 28px; }
        h1 { font-size: 28px; color: #c62828; text-align: center; margin-bottom: 0; }
        h2 { font-size: 21px; color: #37474f; margin-top: 32px; }
        .chart-container { text-align: center; margin: 18px 0; }
        .risk-row { display: flex; flex-direction: row; justify-content: space-between; margin-bottom: 20px; }
        .footer { margin-top: 40px; font-size: 12px; color: #757575; text-align: center; border-top: 1px solid #eceff1; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Персональный план эвакуации</h1>
        <p><strong>Адрес:</strong> ${address}</p>

        <h2>Обзор климатических рисков</h2>
        <div class="risk-row">
            ${riskBlock('Flood', '💧', riskScores.flood, riskLabel(riskScores.flood))}
            ${riskBlock('Fire', '🔥', riskScores.fire, riskLabel(riskScores.fire))}
            ${riskBlock('Wind', '💨', riskScores.wind, riskLabel(riskScores.wind))}
            ${riskBlock('Air', '🌫️', riskScores.air, riskLabel(riskScores.air))}
            ${riskBlock('Heat', '🌡️', riskScores.heat, riskLabel(riskScores.heat))}
        </div>
        <div class="chart-container">
            <img src="${chartUrl}" alt="Climate Risk Chart" style="max-width:100%;border-radius:12px;">
        </div>
        ${reportHtml}

        <div class="footer">
            <p><em>Отчет сгенерирован с помощью ИИ и климатических данных. Следуйте указаниям экстренных служб в вашем районе.</em></p>
        </div>
      </div>
    </body>
    </html>
    `;

    // Utility for risk label
    function riskLabel(score) {
        if (score >= 7) return 'Major';
        if (score >= 4) return 'Moderate';
        return 'Minor';
    }
}

export default async function handler(request, response) {
    const { address, email, riskScores } = request.body;

    // Валидация
    if (!address || !email || !riskScores)
        return response.status(400).json({ message: 'Address, email and riskScores are required' });

    try {
        // Получаем отчет от AI
        const aiData = await getAiRecommendations(address, riskScores);
        if (!aiData) throw new Error("Failed to get data from AI");

        // Генерируем график
        const chartUrl = getChartUrl(riskScores);

        // Генерируем финальный HTML для PDF
        const html = getPdfHtml(address, riskScores, chartUrl, aiData.reportHtml);

        // Генерируем PDF через Api2Pdf (или другой сервис)
        const pdfResponse = await fetch('https://v2018.api2pdf.com/chrome/html', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': process.env.API2PDF_KEY },
            body: JSON.stringify({ html: html, inlinePdf: true, options: { landscape: false } }),
        });

        if (!pdfResponse.ok) throw new Error(`Api2Pdf error: ${await pdfResponse.text()}`);

        const { pdf: pdfUrl } = await pdfResponse.json();
        const pdfDownloadResponse = await fetch(pdfUrl);
        const pdfBuffer = await pdfDownloadResponse.arrayBuffer();

        // Отправляем PDF на почту
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

        response.status(200).json({ message: `Профессиональный PDF-отчет успешно сгенерирован и отправлен на почту ${email}!` });

    } catch (error) {
        console.error(error);
        response.status(500).json({ message: 'Что-то пошло не так при создании отчета.' });
    }
}
