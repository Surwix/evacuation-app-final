import nodemailer from 'nodemailer';
import { OpenAI } from 'openai';
import fetch from 'node-fetch'; // Используем fetch для отправки запросов

// Инициализируем клиент OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Функция для получения рекомендаций от ИИ
async function getAiRecommendations(address) {
    const prompt = `Act as an emergency preparedness expert for the U.S. address: "${address}". Create a concise, structured emergency plan in HTML format. Include sections for local risks (e.g., hurricanes, earthquakes), primary evacuation routes, and a safe meeting point type (e.g., "a public library").`;
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
        });
        return completion.choices[0].message.content;
    } catch (error) {
        console.error("Error fetching from OpenAI:", error);
        return "<h2>План по умолчанию</h2><p>Не удалось получить рекомендации от ИИ. Действуйте согласно базовым правилам безопасности.</p>";
    }
}

// Функция, которая создает HTML для PDF
function getPdfHtml(address, aiContent) {
    return `
        <!DOCTYPE html>
        <html lang="ru">
        <head><meta charset="UTF-8"><style>body{font-family:sans-serif;font-size:14px;color:#333;line-height:1.6;}h1{font-size:24px;color:#b71c1c;}h2{font-size:18px;border-bottom:1px solid #eee;}</style></head>
        <body>
            <h1>Персональный план эвакуации</h1>
            <p><strong>Адрес:</strong> ${address}</p><hr>${aiContent}
            <p><em>Отчет сгенерирован с помощью ИИ. Всегда следуйте указаниям экстренных служб.</em></p>
        </body>
        </html>`;
}

// Основной обработчик
export default async function handler(request, response) {
    const { address, email } = request.body;
    if (!address || !email) return response.status(400).json({ message: 'Address and email are required' });

    try {
        // 1. Получаем рекомендации от ИИ
        const aiContent = await getAiRecommendations(address);

        // 2. Генерируем HTML для PDF
        const html = getPdfHtml(address, aiContent);

        // 3. ОБРАЩАЕМСЯ К СЕРВИСУ API2PDF ДЛЯ СОЗДАНИЯ PDF
        const pdfResponse = await fetch('https://v2018.api2pdf.com/chrome/html', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': process.env.API2PDF_KEY, // Используем новый ключ
            },
            body: JSON.stringify({ html: html, inlinePdf: true }),
        });

        if (!pdfResponse.ok) {
            const errorText = await pdfResponse.text();
            throw new Error(`Api2Pdf error: ${errorText}`);
        }

        const { pdf: pdfUrl } = await pdfResponse.json();

        // Скачиваем PDF по полученной ссылке
        const pdfDownloadResponse = await fetch(pdfUrl);
        const pdfBuffer = await pdfDownloadResponse.arrayBuffer();

        // 4. Отправляем email с готовым PDF
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_SERVER_USER, pass: process.env.EMAIL_SERVER_PASSWORD },
        });
        await transporter.sendMail({
            from: `"Evacuation Plan Bot" <${process.env.EMAIL_SERVER_USER}>`,
            to: email,
            subject: `Ваш ИИ-план эвакуации PDF для ${address}`,
            text: "Ваш PDF-план эвакуации, сгенерированный ИИ, прикреплен к этому письму.",
            attachments: [{
                filename: 'AI-Evacuation-Plan.pdf',
                content: Buffer.from(pdfBuffer), // Конвертируем в Buffer
                contentType: 'application/pdf',
            }],
        });

        response.status(200).json({ message: `PDF-план от ИИ успешно сгенерирован и отправлен на почту ${email}!` });

    } catch (error) {
        console.error(error);
        response.status(500).json({ message: 'Что-то пошло не так при обращении к ИИ или создании PDF.' });
    }
}
