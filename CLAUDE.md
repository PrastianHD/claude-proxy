# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a proxy server that translates Anthropic API requests to various AI providers (OpenRouter, NVIDIA NIM, Ollama). It enables using Claude Code with different AI backends by translating the API calls and responses between formats.

## Key Components

1. `proxy.js` - Main proxy server that handles request translation between Anthropic API and other providers
2. `start.ps1` - Script to start the proxy server in a specific mode (ollama/openrouter/nvidia)
3. `run.ps1` - Script to launch Claude Code with the proxy configured
4. API key files (`apikey_*.txt`) - Contains API keys for each provider

## Common Development Tasks

### Starting the Proxy Server

To start the proxy server, use one of these commands:
```powershell
.\start.ps1 openrouter  # Default mode
.\start.ps1 nvidia     # NVIDIA NIM mode
.\start.ps1 ollama     # Ollama mode
```

The proxy will run on http://127.0.0.1:8080

### Running Claude Code with the Proxy

After starting the proxy, in another terminal run:
```powershell
.\run.ps1 openrouter  # Run with OpenRouter backend
.\run.ps1 nvidia     # Run with NVIDIA backend
.\run.ps1 ollama     # Run with Ollama backend
```

### Adding API Keys

Add your API keys to the respective files:
- `apikey_openrouter.txt` for OpenRouter API keys
- `apikey_nvidia.txt` for NVIDIA API keys
- `apikey_ollama.txt` for Ollama API keys

Each file can contain multiple keys, one per line. The proxy will rotate through them when rate limits are hit.

## Architecture Details

The proxy performs several key translations:

1. **Request Translation**: Converts Anthropic API requests to the target provider's format
2. **Response Translation**: Converts provider responses back to Anthropic format
3. **Rate Limit Handling**: Automatically rotates through API keys when rate limits are encountered
4. **Streaming Support**: Properly handles streaming responses with chunked transfer encoding
5. **Tool Use Translation**: Maps Anthropic tool calling to OpenAI-compatible function calling

### Provider-Specific Features

#### NVIDIA Mode
- Translates `/v1/messages` to `/v1/chat/completions`
- Handles thinking/reasoning content parsing
- Maps tool choice options appropriately
- Implements proper error handling for NVIDIA-specific errors

#### OpenRouter Mode
- Direct proxy with header translation
- Maintains compatibility with OpenRouter's Anthropic API support

#### Ollama Mode
- Authentication header handling for Ollama deployments

## Testing Changes

To test changes to the proxy:
1. Make your modifications to `proxy.js`
2. Restart the proxy server with `.\start.ps1 [provider]`
3. Run Claude Code with `.\run.ps1 [provider]` to test functionality

## Key Files to Modify

- `proxy.js` - Main logic for request/response translation
- `start.ps1` - Proxy startup script
- `run.ps1` - Claude Code launcher script
- API key files - For testing with different credentials

## Common Issues and Solutions

1. **Rate Limits**: The proxy automatically rotates through API keys when encountering 429 responses
2. **Model Mapping**: Different providers support different models; mappings are defined in `run.ps1`
3. **Streaming Delays**: Ensure proper Content-Type headers and chunked transfer encoding
4. **Tool Calling**: Verify JSON schema compatibility between providers

## Environment Variables

The proxy respects these environment variables:
- `ANTHROPIC_BASE_URL` - Set by `run.ps1` to point to the proxy
- Provider-specific keys set in `run.ps1`