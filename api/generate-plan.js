import nodemailer from 'nodemailer';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';

// ... (все вспомогательные функции остаются без изменений) ...

async function getAiRecommendations(address) {
    const prompt = `Act as a FEMA emergency analyst for the U.S. address: "${address}". Return a JSON object with two keys: "riskScores" (object with integer scores 1-10 for flood, fire, wind, air, heat) and "reportHtml" (a detailed evacuation plan in HTML with <h2> and <ul> sections for Primary Risks, Evacuation Checklist, Go-Bag, and Route Strategy).`;
    try {
        const completion = await openai.chat.completions.create({ model: "gpt-4o", response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] });
        return JSON.parse(completion.choices[0].message.content);
    } catch (error) { console.error("Error fetching from OpenAI:", error); return null; }
}

async function getNearbyHospitals(address) {
    try {
        const searchParams = new URLSearchParams({ query: `hospital near ${address}`, key: process.env.Maps_API_KEY });
        const response = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${searchParams}`);
        if (!response.ok) throw new Error(`Google Places API error: ${response.statusText}`);
        const data = await response.json();
        return data.results.slice(0, 3);
    } catch (error) { console.error("Error fetching from Google Places:", error); return []; }
}

function getChartUrl(scores) {
    const chartConfig = { type: 'bar', data: { labels: ['Flood', 'Fire', 'Wind', 'Air', 'Heat'], datasets: [{ label: 'Risk Score', data: [scores.flood, scores.fire, scores.wind, scores.air, scores.heat], backgroundColor: 'rgba(211, 47, 47, 0.7)' }] }, options: { legend: { display: false }, scales: { yAxes: [{ ticks: { beginAtZero: true, max: 10 } }] } } };
    return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&width=500&height=300&backgroundColor=white`;
}

function getPdfHtml(address, aiData, hospitals) {
    const hospitalsHtml = hospitals.length > 0 ? `<ul>${hospitals.map(h => `<li><strong>${h.name}</strong><br>${h.formatted_address}</li>`).join('')}</ul>` : "<p>Не удалось загрузить список ближайших медицинских учреждений.</p>";
    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><style>body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11pt;color:#333} .container{padding:30px} .header{text-align:center;border-bottom:2px solid #d9534f;padding-bottom:15px;margin-bottom:20px} .header h1{font-size:26pt;color:#d9534f;margin:0} .header p{font-size:12pt;color:#777;margin:5px 0 0 0} .section h2{font-size:16pt;color:#333;border-bottom:1px solid #ccc;padding-bottom:8px;margin-top:25px;margin-bottom:15px} .chart-container{text-align:center;margin:25px 0} ul{padding-left:20px} li{margin-bottom:10px} .footer{margin-top:40px;font-size:9pt;color:#888;text-align:center;border-top:1px solid #eee;padding-top:15px}</style></head><body><div class="container"><div class="header"><h1>План экстренной эвакуации</h1><p>${address}</p></div><div class="section"><h2>Обзор климатических рисков</h2><div class="chart-container"><img src="${getChartUrl(aiData.riskScores)}" alt="Climate Risk Chart"></div></div><div class="section">${aiData.reportHtml}</div><div class="section"><h2>Ближайшие медицинские учреждения</h2>${hospitalsHtml}</div><div class="footer"><p>Отчет сгенерирован с помощью ИИ и данных Google Maps. Информация носит рекомендательный характер. Всегда следуйте указаниям экстренных служб.</p
