import nodemailer from 'nodemailer';
import chromium from '@sparticuz/chrome-aws-lambda';
import { OpenAI } from 'openai';

// Инициализируем клиент OpenAI с вашим API ключом из переменных окружения
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Новая функция, которая обращается к ChatGPT
async function getAiRecommendations(address) {
    console.log(`Requesting AI recommendations for: ${address}`);

    // Создаем четкий промпт для ИИ
    const prompt = `
        Act as an emergency preparedness expert. For the following U.S. address, create a concise, structured emergency evacuation plan. 
        The address is: "${address}".
        Based on the general region (state, county), list potential natural disaster risks (e.g., hurricanes, earthquakes, tornadoes, floods, wildfires).
        Then, provide clear, actionable steps for a basic evacuation plan. Include a suggested safe meeting point type (e.g., "a public library" or "a large, open park").
        Keep the tone clear, calm, and authoritative. Structure the output in HTML format with <h2> for section titles and <ul>/<li> for lists.
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o", // или "gpt-3.5-turbo" для более быстрой и дешевой генерации
            messages: [{ role: "user", content: prompt }],
        });
        // Возвращаем сгенерированный ИИ HTML-контент
        return completion.choices[0].message.content;
    } catch (error) {
        console.error("Error fetching from OpenAI:", error);
        // Возвращаем план по умолчанию в случае ошибки
        return "<h2>План по умолчанию</h2><p>Не удалось получить рекомендации от ИИ. Действуйте согласно базовым правилам безопасности.</p>";
    }
}

// Функция, которая создает финальный HTML для PDF
function getPdfHtml(address, aiContent) {
    // Заменяем переносы строк из ответа ИИ на теги <br> для правильного отображения в HTML
    const formattedAiContent = aiContent.replace(/\n/g, '<br>');

    return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; color: #333; line-height: 1.6; }
                .container { padding: 20px; }
                h1 { font-size: 24px; color: #b71c1c; border-bottom: 2px solid #f44336; padding-bottom: 10px; }
                h2 { font-size: 18px; color: #333; margin-top: 25px; }
                p { margin-bottom: 10px; }
                strong { color: #0d47a1; }
                .footer { margin-top: 30px; font-size: 12px; color: #757575; border-top: 1px solid #eee; padding-top: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Персональный план эвакуации</h1>
                <p><strong>Адрес:</strong> ${address}</p>
                <hr>
                ${formattedAiContent}
                <div class="footer">
                    <p><em>Этот отчет сгенерирован с помощью ИИ. Информация носит рекомендательный характер. Всегда отдавайте приоритет официальным указаниям экстренных служб.</em></p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Основной обработчик
export default async function handler(request, response) {
    const { address, email } = request.body;
    if (!address || !email) {
        return response.status(400).json({ message: 'Address and email are required' });
    }

    let browser = null;
    try {
        // 1. Получаем рекомендации от ChatGPT
        const aiContent = await getAiRecommendations(address);

        // 2. Генерируем HTML для PDF
        const html = getPdfHtml(address, aiContent);

        // 3. Создаем PDF
        browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

        // 4. Отправляем email с PDF
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
                content: pdfBuffer,
                contentType: 'application/pdf',
            }],
        });

        response.status(200).json({ message: `PDF-план от ИИ успешно сгенерирован и отправлен на почту ${email}!` });

    } catch (error) {
        console.error(error);
        response.status(500).json({ message: 'Что-то пошло не так при обращении к ИИ или создании PDF.' });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
