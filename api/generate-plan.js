export default async function handler(request, response) {
    console.log("API Test: Function was successfully invoked at " + new Date());
    response.status(200).json({ message: "Test successful! The API endpoint is working." });
}
