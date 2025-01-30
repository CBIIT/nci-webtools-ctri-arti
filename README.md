# Research Optimizer
## API Usage Examples

### model/run

```js
const endpoint = "http://localhost:8080/api/model/run";
const model = "anthropic.claude-3-5-sonnet-20240620-v1:0";
const messages = [
  {
    role: "user",
    content: [{ text: "Please provide the answer to everything." }],
  },
];
// you may also pass in a string to the 'messages' parameter
// const messages = "Please provide the answer to everything."

const response = await fetch(endpoint, {
  method: "post",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ model, messages }),
});
const results = await response.json();
console.log(results, results.output.message);
```

You can also make GET requests directly in your browser. 
http://localhost:8080/api/model/run?messages=Return+42