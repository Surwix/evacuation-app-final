export default async function handler(request, response) {
    // Эта строка - единственное, что мы хотим увидеть
    console.log("API Test: Function was successfully invoked at " + new Date());
    
    // Мгновенно отправляем ответ
    response.status(200).json({ message: "Test successful! The API endpoint is working." });
}
