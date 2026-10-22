# ILMUcode Extension for VS Code: Usage Guide

ILMUcode Extension adds ILMU AI chat models to VS Code's built-in Chat model picker. Use it to ask questions about code, stream model responses, provide images to ILMU GLM 5.3, and use VS Code Agent mode tool calls. The extension connects to the ILMU API using an API key you provide and stores that key in VS Code SecretStorage. It does not add inline code completion.

## Install and start

### Try the extension from this source folder

1. Install Node.js and VS Code 1.127 or newer.
2. Open the ILMUcode extension folder in VS Code.
3. Run `npm install` in the project folder.
4. Press **F5** to launch an Extension Development Host.

### Install a packaged extension

When you have an ILMUcode `.vsix` file, open **Extensions** in VS Code, select **...**, choose **Install from VSIX...**, and select the file. Restart or reload VS Code if prompted.

## First-run setup

1. When VS Code finishes starting, ILMUcode asks for your ILMU API key.
2. Enter the key in the password field. VS Code saves it in SecretStorage.
3. ILMUcode opens the Chat view.
4. In the model picker at the bottom of the Chat input, choose **ILMUcode**.
5. Select **ILMU GLM 5.3** or **ILMU GLM 5.3 Flash**.
6. Type a prompt and send it.

The extension cannot preselect the Chat model. Choose an ILMUcode model once in the picker before sending your first prompt.

## Start another chat

Open the Command Palette with **Ctrl+Shift+P** and run **ILMUcode: Start Chat**. In Chat, confirm the model picker still shows an ILMUcode model before sending.

To open Chat without the ILMUcode helper command, use **Ctrl+Alt+I** or run **Chat: Open Chat**.

## Manage the API key

Use the Command Palette (**Ctrl+Shift+P**) to run:

- **ILMUcode: Set API Key** — enter or replace the saved key. The Chat view opens after saving.
- **ILMUcode: Clear API Key** — remove the saved key from VS Code SecretStorage.

Do not paste API keys into chat, source files, settings, or commits. If a key is exposed, revoke it in the ILMU Console and create a replacement.

## BYOK utility-model notice

VS Code may show **Set BYOK utility models — Unlocks full AI features** when using a BYOK model. This concerns background tasks such as chat titles, commit messages, and pull request descriptions; it does not block ordinary ILMUcode messages.

- Choose **Dismiss** to hide the notice.
- To use ILMUcode for background utility tasks too, open VS Code Settings, search for **Chat: BYOK Utility Model Default**, and choose **Main Agent Model**. This can add model requests and API usage.

## Troubleshooting

### `401 invalid_api_key` or `API key not found`

Run **ILMUcode: Set API Key** in the same VS Code profile or Extension Development Host where Chat is running. Enter a valid, active key, then retry the message.

### ILMUcode is missing from the model picker

Run **ILMUcode: Start Chat**, open the model picker, and look for the **ILMUcode** provider group. If it still does not appear, use **Developer: Reload Window** and check that the extension is enabled in that VS Code profile.

### Chat opens with another provider's model selected

Open the model picker and choose **ILMUcode**, then an ILMU model. The extension contributes the models to the picker but cannot change VS Code's selected model automatically.

## Capabilities

- Streamed text responses through ILMU's Chat Completions API.
- Tool calls for VS Code Agent mode.
- Image input with **ILMU GLM 5.3**.
- No inline code-completion provider; use Chat for interactive requests.

## Credits

The models and API used by this extension are provided by **ILMU AI**. ILMUcode is an independent VS Code integration and does not claim ownership of ILMU AI's models or services.
