# ILMUcode Extension for VS Code

ILMUcode brings ILMU AI models into Visual Studio Code's built-in Chat experience. Choose an ILMUcode model in the Chat model picker to ask questions, work with code, and use VS Code Agent mode with tool calls. Responses stream as they are generated. **ILMU GLM 5.3** supports image input; **ILMU GLM 5.3 Flash** is also available.

You provide your own ILMU API key (BYOK). The extension stores it in VS Code `SecretStorage` and sends chat requests to the ILMU API. It does not provide inline code completion.

See the [usage guide](USAGE.md) for installation, key management, and troubleshooting.

## Setup

On first run, ILMUcode asks for an ILMU API key and stores it in VS Code `SecretStorage`. It then opens the Chat view. In the model picker, choose **ILMUcode**, then **ILMU GLM 5.3** or **ILMU GLM 5.3 Flash**, and send a prompt. The extension cannot select the model automatically, so confirm the model picker before sending.

To open Chat later, run **ILMUcode: Start Chat** from the Command Palette. Use **ILMUcode: Set API Key** to add or replace your key, and **ILMUcode: Clear API Key** to remove it.

## API

The provider calls `https://api.ilmu.ai/v1/chat/completions` with Bearer authentication, OpenAI-compatible chat messages, streaming enabled, and the selected model ID. It supports text, image input for `ilmu-glm-5.3`, and tool calls for VS Code Agent mode.

## Security

Never put an API key in `package.json`, `settings.json`, source code, or commits. If a key has been shared or exposed, deactivate it in the ILMU Console and create a replacement before configuring the extension.

## Credits

ILMUcode uses models and the API provided by **ILMU AI**. The ILMU name and model names identify the service this extension connects to; this project does not claim ownership of ILMU AI's models or services.
