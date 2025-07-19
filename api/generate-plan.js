import nodemailer from 'nodemailer';

// Эта функция имитирует работу ИИ для генерации плана
function generateEvacuationPlan(address) {
  console.log(`AI is generating a plan for: ${address}`);
  const randomExit = Math.random() > 0.5 ? "северную" : "южную";
  const meetingPoint = "ближайший парк или большую открытую площадку";

  return `
    <html>
    <body>
      <h1>Ваш персональный план эвакуации для адреса: ${address}</h1>
      <p>Этот план был сгенерирован автоматически на основе вашего местоположения.</p>
      <h2>Основные шаги:</h2>
      <ol>
        <li>Сохраняйте спокойствие.</li>
        <li>Возьмите заранее подготовленный "тревожный чемоданчик".</li>
        <li>Покиньте здание через <strong>${randomExit}</strong> сторону.</li>
        <li>Двигайтесь в сторону <strong>${meetingPoint}</strong>.</li>
        <li>Следуйте указаниям экстренных служб.</li>
      </ol>
      <p><strong>Пожалуйста, помните, что это базовый шаблон. Всегда отдавайте приоритет официальным указаниям властей.</strong></p>
    </body>
    </html>
  `;
}

// Это основная функция нашего API
export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Only POST requests are allowed' });
  }

  const { address, email } = request.body;

  if (!address || !email) {
    return response.status(400).json({ message: 'Address and email are required' });
  }

  try {
    // 1. Генерируем план эвакуации
    const evacuationPlanHtml = generateEvacuationPlan(address);

    // 2. Настраиваем отправку почты
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
    });

    // 3. Отправляем email
    await transporter.sendMail({
      from: `"Evacuation Plan Bot" <${process.env.EMAIL_SERVER_USER}>`,
      to: email,
      subject: `Ваш план эвакуации для ${address}`,
      html: evacuationPlanHtml,
    });

    // 4. Отправляем успешный ответ на frontend
    response.status(200).json({ 
      message: `План эвакуации успешно сгенерирован и отправлен на почту ${email}!` 
    });

  } catch (error) {
    console.error(error);
    response.status(500).json({ message: 'Что-то пошло не так при отправке письма.' });
  }
}
