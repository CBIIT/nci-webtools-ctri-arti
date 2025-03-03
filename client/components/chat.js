import html from "solid-js/html";


export async function chat(endpoint, model, messages, systemPrompt) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model, messages, systemPrompt })
    });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    for await(const chunk of response.body) {
        console.log(chunk);
    }
}


export default function Chat({ messages = [], endpoint = './api/model/stream', systemPrompt = 'You are a helpful assistant' }) {
    return html`<div>
        <div>
            ${messages.map((message) => html`<div>${message}</div>`)}
        </div>
        <div>
            <input type="text" placeholder="Type a message..." />
            <button>Send</button>
        </div>
    </div>`;
}