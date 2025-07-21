import nodemailer from 'nodemailer';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';

// Инициализируем клиент OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- УЛУЧШЕННЫЙ ПРОМПТ ДЛЯ CHATGPT ---
async function getAiRecommendations(address) {
    console.log(`Requesting ADVANCED AI recommendations for: ${address}`);

    // Вот наш новый, более детальный промпт:
    const prompt = `
        Act as a senior emergency preparedness analyst from FEMA, creating a critical evacuation guide.
        The target U.S. address is: "${address}".

        Your task is to generate a detailed, structured report in HTML format. Use <h2> for main section titles and <ul> with <li> for lists.

        The report must include the following sections:
        1.  **Primary Risks Assessment:** Based on the general region of the address (state and county), identify and list the top 3-4 most probable natural disaster risks (e.g., Hurricanes, Tornadoes, Wildfires, Earthquakes, Flooding, Blizzards). For each risk, provide a one-sentence explanation of why it's relevant to that area.
        2.  **Immediate Evacuation Checklist:** Provide a bulleted list of critical actions to take in the first 15 minutes of an evacuation order.
        3.  **"Go-Bag" Essentials:** Provide a bulleted list of essential items for a pre-packed emergency kit ("go-bag"), tailored to the risks you identified.
        4.  **Evacuation Route Strategy:** Provide general advice on planning primary and secondary evacuation routes from the address. Do not give specific street names, but suggest principles (e.g., "head inland, away from the coast" or "avoid low-lying areas and bridges").
        5.  **Safe Meeting Point:** Suggest three different *types* of safe meeting points for family members (e.g., "A specific public library in a neighboring town," "A specific major landmark," "A relative's home in another state").
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o", // Эта модель отлично справится с задачей
            messages: [{ role: "user", content: prompt }],
        });
        return completion.choices[0].message.content;
    } catch (error) {
        console.error("Error fetching from OpenAI:", error);
        return "<h2>Default Plan</h2><p>Failed to get recommendations from AI. Please follow basic safety protocols.</p>";
    }
}
// --- КОНЕЦ НОВОГО ПРОМПТА ---
    
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

// Основной обработчик (остается без изменений)
export default async function handler(request, response) {
    const { address, email } = request.body;
    if (!address || !email) return response.status(400).json({ message: 'Address and email are required' });

    try {
        const aiContent = await getAiRecommendations(address);
        const html = getPdfHtml(address, aiContent);

        const pdfResponse = await fetch('https://v2018.api2pdf.com/chrome/html', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': process.env.API2PDF_KEY,
            },
            body: JSON.stringify({ html: html, inlinePdf: true }),
        });

        if (!pdfResponse.ok) {
            const errorText = await pdfResponse.text();
            throw new Error(`Api2Pdf error: ${errorText}`);
        }

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
            subject: `Ваш детальный ИИ-план эвакуации PDF для ${address}`,
            text: "Ваш PDF-план эвакуации, сгенерированный ИИ, прикреплен к этому письму.",
            attachments: [{
                filename: 'AI-Evacuation-Plan.pdf',
                content: Buffer.from(pdfBuffer),
                contentType: 'application/pdf',
            }],
        });

        response.status(200).json({ message: `Детальный PDF-план от ИИ успешно сгенерирован и отправлен на почту ${email}!` });

    } catch (error) {
        console.error(error);
        response.status(500).json({ message: 'Что-то пошло не так при обращении к ИИ или создании PDF.' });
    }
}
