import nodemailer from 'nodemailer';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- ФИНАЛЬНЫЙ ПРОМПТ С ЗАПРОСОМ НА КЛИМАТИЧЕСКИЕ РИСКИ ---
async function getAiRecommendations(address) {
    console.log(`Requesting AI recommendations with climate risks for: ${address}`);

    const prompt = `
        Act as a senior emergency preparedness analyst from FEMA, creating a critical evacuation guide.
        The target U.S. address is: "${address}".

        Your task is to generate a detailed, structured report in HTML format.

        The report must include the following sections:
        
        1.  **Climate Risk Factors:** Create a section that mimics the Zillow/First Street climate risk scores. Provide a simple HTML structure (e.g., a flex container) with 5 boxes for Flood, Fire, Wind, Air Quality, and Heat risks. For each risk, provide a qualitative assessment (e.g., Minimal, Minor, Moderate, Major, Severe) and an estimated score on a 1-10 scale based on the general location. This is an estimation, not real-time data.

        2.  **Primary Risks Assessment:** Based on the general region, identify and list the top 3-4 most probable natural disaster risks (e.g., Hurricanes, Tornadoes, Wildfires, Earthquakes). For each risk, provide a one-sentence explanation.

        3.  **Immediate Evacuation Checklist:** Provide a bulleted list of critical actions to take in the first 15 minutes of an evacuation order.

        4.  **"Go-Bag" Essentials:** Provide a bulleted list of essential items for a pre-packed emergency kit.

        5.  **Evacuation Route Strategy:** Provide general advice on planning primary and secondary evacuation routes.
        
        Use <h2> for main section titles and <ul> with <li> for lists.
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
        });
        return completion.choices[0].message.content;
    } catch (error) {
        console.error("Error fetching from OpenAI:", error);
        return "<h2>Default Plan</h2><p>Failed to get recommendations from AI. Please follow basic safety protocols.</p>";
    }
}
    
function getPdfHtml(address, aiContent) {
    return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; color: #333; line-height: 1.6; }
                .container { padding: 20px; }
                h1 { font-size: 24px; color: #b71c1c; border-bottom: 2px solid #f44336; padding-bottom: 10px; }
                h2 { font-size: 18px; color: #333; margin-top: 25px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
                .risk-container { display: flex; justify-content: space-between; gap: 10px; margin: 20px 0; }
                .risk-box { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 10px; text-align: center; }
                .risk-box h3 { font-size: 14px; margin: 0 0 5px 0; color: #555; }
                .risk-box p { font-size: 18px; font-weight: bold; margin: 0; }
                .footer { margin-top: 30px; font-size: 12px; color: #757575; border-top: 1px solid #eee; padding-top: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Персональный план эвакуации</h1>
                <p><strong>Адрес:</strong> ${address}</p>
                <hr>
                ${aiContent.replace(/\n/g, '<br>')}
                <div class="footer">
                    <p><em>Этот отчет сгенерирован с помощью ИИ. Информация носит рекомендательный характер. Всегда отдавайте приоритет официальным указаниям экстренных служб.</em></p>
                </div>
            </div>
        </body>
        </html>
    `;
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
            headers: { 'Content-Type': 'application/json', 'Authorization': process.env.API2PDF_KEY },
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
            attachments: [{ filename: 'AI-Evacuation-Plan.pdf', content: Buffer.from(pdfBuffer), contentType: 'application/pdf' }],
        });

        response.status(200).json({ message: `Детальный PDF-план от ИИ успешно сгенерирован и отправлен на почту ${email}!` });

    } catch (error) {
        console.error(error);
        response.status(500).json({ message: 'Что-то пошло не так при обращении к ИИ или создании PDF.' });
    }
}
