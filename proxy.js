const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const MODE = process.argv[2] || 'openrouter';
const PORT = 8080;

console.log(`\x1b[36m[Init] Booting up proxy in ${MODE.toUpperCase()} mode...\x1b[0m`);

let targetHost = '';
let keyFileName = '';

if (MODE === 'ollama') {
    targetHost = 'ollama.com';
    keyFileName = 'apikey_ollama.txt';
} else if (MODE === 'openrouter') {
    targetHost = 'cc.yovy.app';
    keyFileName = 'apikey_openrouter.txt';
} else if (MODE === 'nvidia') {
    targetHost = 'integrate.api.nvidia.com';
    keyFileName = 'apikey_nvidia.txt';
} else {
    console.error('\x1b[31m[Error] Invalid mode!\x1b[0m');
    process.exit(1);
}

const keyPath = path.join(__dirname, keyFileName);
if (!fs.existsSync(keyPath)) {
    console.error(`\x1b[31m[Error] ${keyFileName} is missing!\x1b[0m`);
    process.exit(1);
}

const API_KEYS = fs.readFileSync(keyPath, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

let currentKeyIndex = 0;
function switchKey(reason) {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.log(`\x1b[33m[Switch] \u2192 Swapping to Key Index ${currentKeyIndex}. Reason: ${reason}\x1b[0m`);
}

const server = http.createServer((req, res) => {
    // 1. INTERCEPT HEALTH CHECKS & MODELS EKSKLUSIF (Claude CLI butuh ini!)
    const reqPathOnly = req.url.split('?')[0];
    if (reqPathOnly === '/' || reqPathOnly === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', message: 'claude-nvidia-proxy' }));
    }
    if (reqPathOnly === '/v1/models' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ data: [], has_more: false }));
    }

    let bodyChunks = [];
    req.on('data', chunk => bodyChunks.push(chunk));
    req.on('end', () => {
        let rawBody = Buffer.concat(bodyChunks);

        const tryRequest = (attempt = 0) => {
            if (attempt >= API_KEYS.length) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "All keys exhausted." } }));
                return;
            }

            const key = API_KEYS[currentKeyIndex];
            let headers = { ...req.headers, 'host': targetHost };
            let reqPath = req.url;
            let modifiedBody = rawBody;
            let wasStream = false;
            let anthropicBody = null;
            
            const isAnthropicToNvidia = MODE === 'nvidia' && reqPathOnly === '/v1/messages';
            
            if (isAnthropicToNvidia) {
                reqPath = '/v1/chat/completions'; 
                try {
                    anthropicBody = JSON.parse(rawBody.toString());
                    wasStream = anthropicBody.stream === true;
                    
                    let openaiBody = {
                        model: anthropicBody.model || "meta/llama-3.3-70b-instruct", 
                        messages: [],
                        // NVIDIA membatasi max_tokens di 4096 untuk sebagian besar model
                        max_tokens: Math.min(anthropicBody.max_tokens || 4096, 4096), 
                        stream: wasStream 
                    };

                    if (anthropicBody.temperature !== undefined) openaiBody.temperature = anthropicBody.temperature;
                    if (anthropicBody.top_p !== undefined) openaiBody.top_p = anthropicBody.top_p;
                    // MAPPING STOP SEQUENCES! (NVIDIA nolak request kalau formatnya salah)
                    if (anthropicBody.stop_sequences) openaiBody.stop = anthropicBody.stop_sequences;

                    if (anthropicBody.system) {
                        let sys = typeof anthropicBody.system === 'string' ? anthropicBody.system : anthropicBody.system.map(s => s.text).join('\n');
                        openaiBody.messages.push({ role: "system", content: sys });
                    }

                    if (anthropicBody.messages) {
                        for (const msg of anthropicBody.messages) {
                            if (typeof msg.content === 'string') {
                                openaiBody.messages.push({ role: msg.role, content: msg.content });
                                continue;
                            }
                            
                            const textParts = [];
                            const toolCalls = [];
                            const toolResults = [];

                            for (const block of msg.content) {
                                if (block.type === 'text') textParts.push(block.text);
                                else if (block.type === 'tool_use') {
                                    toolCalls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } });
                                } else if (block.type === 'tool_result') {
                                    let resultContent = typeof block.content === 'string' ? block.content : (Array.isArray(block.content) ? block.content.map(c => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n') : '');
                                    toolResults.push({ role: 'tool', tool_call_id: block.tool_use_id, content: resultContent });
                                } else if (block.type === 'image') {
                                    textParts.push({ type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } });
                                }
                            }

                            if (toolResults.length > 0) openaiBody.messages.push(...toolResults);
                            else if (msg.role === 'assistant' && toolCalls.length > 0) {
                                openaiBody.messages.push({ role: 'assistant', content: textParts.join('') || null, tool_calls: toolCalls });
                            } else {
                                openaiBody.messages.push({ role: msg.role, content: textParts.every(p => typeof p === 'string') ? textParts.join('') : textParts });
                            }
                        }
                    }

                    if (anthropicBody.tools?.length) {
                        openaiBody.tools = anthropicBody.tools.map(t => ({
                            type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema }
                        }));
                    }

                    // Mapping tool choice ("any" ke "required")
                    if (anthropicBody.tool_choice) {
                        if (anthropicBody.tool_choice.type === 'tool') {
                            openaiBody.tool_choice = { type: "function", function: { name: anthropicBody.tool_choice.name } };
                        } else if (anthropicBody.tool_choice.type === 'auto') {
                            openaiBody.tool_choice = "auto";
                        } else if (anthropicBody.tool_choice.type === 'any') {
                            openaiBody.tool_choice = "required";
                        }
                    }

                    modifiedBody = Buffer.from(JSON.stringify(openaiBody));
                } catch (e) {
                    console.error("[Translator Error]", e.message);
                }
            }

            delete headers['content-length'];
            delete headers['accept-encoding']; 
            
            if (MODE === 'nvidia') {
                headers['Authorization'] = `Bearer ${key}`;
                delete headers['x-api-key'];
                delete headers['anthropic-version'];
            } else if (MODE === 'ollama') {
                headers['Authorization'] = `Bearer ${key}`;
            } else if (MODE === 'openrouter') {
                headers['x-api-key'] = key;
                headers['authorization'] = `Bearer ${key}`;
            }

            if (modifiedBody.length > 0) headers['content-length'] = String(modifiedBody.length);

            const options = { hostname: targetHost, port: 443, path: reqPath, method: req.method, headers: headers };
            
            const proxyReq = https.request(options, (proxyRes) => {
                const status = proxyRes.statusCode;

                if (status === 429 || status === 402) {
                    console.log(`\x1b[31m[Limit] Key ${currentKeyIndex} is exhausted. Retrying...\x1b[0m`);
                    switchKey(`Status ${status}`);
                    return tryRequest(attempt + 1);
                }

                if (isAnthropicToNvidia) {
                    if (status !== 200) {
                        let errChunks = [];
                        proxyRes.on('data', c => errChunks.push(c));
                        proxyRes.on('end', () => {
                            let errBody = Buffer.concat(errChunks).toString();
                            // TAMBAHAN: Log Error Asli dari NVIDIA ke Konsol!
                            console.log(`\x1b[31m[NVIDIA API Error] Status: ${status} | Reponse: ${errBody}\x1b[0m`);
                            
                            res.writeHead(status, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: `[NVIDIA Proxy] ${errBody}` } }));
                        });
                        return;
                    }

                    // STREAMING DENGAN THINKING PARSER!
                    if (wasStream) {
                        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
                        
                        const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
                        
                        let tokens = 0;
                        let contentIndex = 0;
                        let hasThinkingBlock = false;
                        let hasTextBlock = false;
                        let inThinkTag = false;
                        let modeDecided = false;
                        let contentBuffer = '';
                        const toolCalls = {};

                        const sendThinking = (text) => {
                            if (!text) return;
                            if (!hasThinkingBlock) {
                                send('content_block_start', { type: 'content_block_start', index: contentIndex, content_block: { type: 'thinking', thinking: '' } });
                                hasThinkingBlock = true;
                            }
                            send('content_block_delta', { type: 'content_block_delta', index: contentIndex, delta: { type: 'thinking_delta', thinking: text } });
                        };

                        const sendText = (text) => {
                            if (!text) return;
                            if (hasThinkingBlock && !hasTextBlock) {
                                send('content_block_stop', { type: 'content_block_stop', index: contentIndex++ });
                                hasThinkingBlock = false;
                            }
                            if (!hasTextBlock) {
                                send('content_block_start', { type: 'content_block_start', index: contentIndex, content_block: { type: 'text', text: '' } });
                                hasTextBlock = true;
                            }
                            send('content_block_delta', { type: 'content_block_delta', index: contentIndex, delta: { type: 'text_delta', text } });
                        };

                        const processContent = (text) => {
                            if (modeDecided && !inThinkTag) { sendText(text); return; }
                            contentBuffer += text;
                            if (!modeDecided && contentBuffer.length >= 7) {
                                if (contentBuffer.startsWith('<think>')) { inThinkTag = true; contentBuffer = contentBuffer.slice(7); }
                                modeDecided = true;
                            }
                            if (!modeDecided) return;
                            if (inThinkTag) {
                                const endIdx = contentBuffer.indexOf('</think>');
                                if (endIdx !== -1) {
                                    sendThinking(contentBuffer.slice(0, endIdx));
                                    const rest = contentBuffer.slice(endIdx + 8);
                                    contentBuffer = '';
                                    inThinkTag = false;
                                    if (rest) sendText(rest);
                                } else if (contentBuffer.length > 8) {
                                    sendThinking(contentBuffer.slice(0, -8));
                                    contentBuffer = contentBuffer.slice(-8);
                                }
                            } else {
                                if (contentBuffer) { sendText(contentBuffer); contentBuffer = ''; }
                            }
                        };

                        const flushBuffer = () => {
                            if (contentBuffer) { inThinkTag ? sendThinking(contentBuffer) : sendText(contentBuffer); contentBuffer = ''; }
                        };

                        const closeStream = (reason = 'end_turn') => {
                            flushBuffer();
                            if (hasThinkingBlock) send('content_block_stop', { type: 'content_block_stop', index: contentIndex++ });
                            if (hasTextBlock) send('content_block_stop', { type: 'content_block_stop', index: contentIndex++ });
                            for (const idx of Object.keys(toolCalls)) send('content_block_stop', { type: 'content_block_stop', index: contentIndex + parseInt(idx) });
                            send('message_delta', { type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: tokens } });
                            send('message_stop', { type: 'message_stop' });
                            res.end();
                        };

                        send('message_start', { type: 'message_start', message: { id: "msg_"+Date.now(), type: 'message', role: 'assistant', content: [], model: anthropicBody.model || "meta/llama-3.3-70b-instruct", stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });

                        let buffer = '';
                        proxyRes.on('data', chunk => {
                            buffer += chunk.toString();
                            let lines = buffer.split('\n');
                            buffer = lines.pop();

                            for (let line of lines) {
                                if (!line.startsWith("data: ")) continue;
                                let data = line.slice(6).trim();
                                if (!data) continue;
                                if (data === '[DONE]') { closeStream(Object.keys(toolCalls).length > 0 ? 'tool_use' : 'end_turn'); return; }

                                try {
                                    let parsed = JSON.parse(data);
                                    let choice = parsed.choices?.[0];
                                    if (!choice) continue;

                                    let delta = choice.delta || {};
                                    let finish = choice.finish_reason;

                                    if (delta.reasoning_content) sendThinking(delta.reasoning_content);
                                    if (delta.content) processContent(delta.content);

                                    if (delta.tool_calls) {
                                        flushBuffer();
                                        for (const tc of delta.tool_calls) {
                                            const idx = tc.index;
                                            if (!toolCalls[idx]) {
                                                if (hasTextBlock) { send('content_block_stop', { type: 'content_block_stop', index: contentIndex++ }); hasTextBlock = false; }
                                                toolCalls[idx] = { id: tc.id, name: tc.function?.name, arguments: '' };
                                                send('content_block_start', { type: 'content_block_start', index: contentIndex + idx, content_block: { type: 'tool_use', id: tc.id, name: tc.function?.name, input: {} } });
                                            }
                                            if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                                            if (tc.function?.arguments) {
                                                toolCalls[idx].arguments += tc.function.arguments;
                                                send('content_block_delta', { type: 'content_block_delta', index: contentIndex + idx, delta: { type: 'input_json_delta', partial_json: tc.function.arguments } });
                                            }
                                        }
                                    }

                                    if (finish) {
                                        let reason = finish === 'length' ? 'max_tokens' : (finish === 'tool_calls' || Object.keys(toolCalls).length > 0 ? 'tool_use' : 'end_turn');
                                        closeStream(reason);
                                        return;
                                    }

                                    if (parsed.usage) tokens = parsed.usage.completion_tokens;
                                } catch(e) {}
                            }
                        });
                        return;
                    } else {
                        // NON-STREAM PARSER
                        let resData = [];
                        proxyRes.on('data', chunk => resData.push(chunk));
                        proxyRes.on('end', () => {
                            let bodyStr = Buffer.concat(resData).toString();
                            try {
                                const data = JSON.parse(bodyStr);
                                const choice = data.choices[0];
                                const message = choice.message;
                                const content = [];

                                if (message.reasoning_content) content.push({ type: 'thinking', thinking: message.reasoning_content });
                                if (message.content) content.push({ type: 'text', text: message.content });

                                if (message.tool_calls?.length) {
                                    for (const tc of message.tool_calls) content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) });
                                }

                                let stop_reason = 'end_turn';
                                if (choice.finish_reason === 'length') stop_reason = 'max_tokens';
                                if (choice.finish_reason === 'tool_calls' || message.tool_calls?.length) stop_reason = 'tool_use';

                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    id: data.id, type: 'message', role: 'assistant',
                                    content: content.length ? content : [{ type: 'text', text: '' }],
                                    model: anthropicBody.model || "meta/llama-3.3-70b-instruct", stop_reason, stop_sequence: null,
                                    usage: { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens }
                                }));
                            } catch (e) {
                                res.writeHead(status, { 'Content-Type': 'application/json' });
                                res.end(bodyStr);
                            }
                        });
                        return;
                    }
                }

                res.writeHead(status, proxyRes.headers);
                proxyRes.pipe(res);
            });

            proxyReq.on('error', (err) => {
                switchKey('Connection Error');
                tryRequest(attempt + 1);
            });

            if (modifiedBody.length > 0) proxyReq.write(modifiedBody);
            proxyReq.end();
        };

        tryRequest();
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`\x1b[32m[Proxy] Active on: http://127.0.0.1:${PORT}\x1b[0m`);
});