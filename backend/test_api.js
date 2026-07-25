const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const OpenAI = require("openai");

const client = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY || process.env.DEFAULT_API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1"
});

async function test() {
    try {
        const response = await client.chat.completions.create({
            model: "meta/llama-3.1-70b-instruct",
            messages: [{role: "user", content: "hello"}],
            max_tokens: 10
        });
        console.log("SUCCESS");
        console.log(response.choices[0].message.content);
    } catch (e) {
        console.log("ERROR 1:", e.message);
    }

    try {
        const response2 = await client.chat.completions.create({
            model: "nvidia/gpt-oss-120b",
            messages: [{role: "user", content: "hello"}],
            max_tokens: 10
        });
        console.log("SUCCESS 2");
    } catch (e) {
        console.log("ERROR 2:", e.message);
    }
}
test();
