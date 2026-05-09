# Claude Proxy

A universal proxy server that enables Claude Code to work with multiple AI providers including OpenRouter, NVIDIA NIM, and Ollama. This proxy translates Anthropic API requests to compatible formats for various AI backends.

## Features

- 🔄 **Multi-Provider Support**: Works with OpenRouter, NVIDIA NIM, and Ollama
- 🛡️ **Rate Limit Handling**: Automatically rotates through API keys when rate limits are encountered
- ⚡ **Streaming Support**: Properly handles streaming responses with chunked transfer encoding
- 🔧 **Tool Use Translation**: Maps Anthropic tool calling to provider-compatible function calling
- 🎯 **Thinking Parser**: Special handling for reasoning/thinking content in NVIDIA responses
- 📦 **Easy Setup**: Simple PowerShell scripts for starting the proxy and launching Claude Code

## Prerequisites

- Node.js (v14 or higher)
- PowerShell (for running the scripts)
- API keys for the providers you want to use:
  - [OpenRouter](https://openrouter.ai/) account
  - [NVIDIA NIM](https://build.nvidia.com/) API access
  - [Ollama](https://ollama.com/) (for local models)

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/claude-proxy.git
cd claude-proxy
```

2. Install Node.js dependencies (if any):
```bash
npm install
```

3. Add your API keys to the respective files:
- `apikey_openrouter.txt` - Your OpenRouter API keys
- `apikey_nvidia.txt` - Your NVIDIA API keys
- `apikey_ollama.txt` - Your Ollama API keys

Each file can contain multiple keys, one per line. The proxy will automatically rotate through them when rate limits are encountered.

## Usage

### Starting the Proxy Server

Choose your provider and start the proxy:

```powershell
# Start with OpenRouter (default)
.\start.ps1

# Or specify a provider explicitly
.\start.ps1 openrouter
.\start.ps1 nvidia
.\start.ps1 ollama
```

The proxy will start on `http://127.0.0.1:8080`

### Running Claude Code

In another terminal, run Claude Code with the proxy:

```powershell
# Run with OpenRouter backend (default)
.\run.ps1

# Or specify a provider explicitly
.\run.ps1 openrouter
.\run.ps1 nvidia
.\run.ps1 ollama
```

### Custom Models

You can specify a custom model when running Claude Code:

```powershell
.\run.ps1 nvidia meta/llama-3.1-405b-instruct
```

## How It Works

The proxy acts as a translation layer between Claude Code (which expects Anthropic's API) and various AI providers:

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

## Configuration

### API Keys

Add your API keys to the respective files (one key per line):

```
# apikey_openrouter.txt
sk-or-...
sk-or-...

# apikey_nvidia.txt
nvapi-...
nvapi-...

# apikey_ollama.txt
ollama-token-1
ollama-token-2
```

### Environment Variables

The proxy and launcher scripts set these environment variables:
- `ANTHROPIC_BASE_URL` - Points to the proxy server
- Provider-specific keys and headers

## Development

### Testing Changes

To test changes to the proxy:

1. Make your modifications to `proxy.js`
2. Restart the proxy server with `.\start.ps1 [provider]`
3. Run Claude Code with `.\run.ps1 [provider]` to test functionality

### Key Files

- `proxy.js` - Main proxy server logic
- `start.ps1` - Starts the proxy server
- `run.ps1` - Launches Claude Code with proxy configuration
- API key files - Contains your provider API keys

## Troubleshooting

### Rate Limits

If you encounter rate limits, add more API keys to your key files. The proxy will automatically rotate through them.

### Connection Errors

Ensure:
1. The proxy is running (`.\start.ps1`)
2. You're using the correct port (8080 by default)
3. Your API keys are valid and properly formatted

### Streaming Issues

If streaming isn't working properly:
1. Check that Content-Type headers are set correctly
2. Verify chunked transfer encoding is handled properly
3. Confirm your provider supports streaming for your selected model

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Thanks to Anthropic for Claude Code
- Thanks to OpenRouter, NVIDIA, and Ollama for their API services
- Inspired by various proxy and API translation projects

## Disclaimer

This project is not officially affiliated with Anthropic, OpenRouter, NVIDIA, or Ollama. Use responsibly and in accordance with each provider's terms of service.