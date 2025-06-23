# Whisper Transcriber GNOME Extension

A GNOME Shell extension that allows you to record audio from your microphone, transcribe it using OpenAI's Whisper API, and copy the transcription to your clipboard.

## Features

- Simple panel icon integration into GNOME Shell
- Two-click recording start/stop
- Automatic transcription using OpenAI's Whisper API
- Results copied directly to clipboard
- Non-blocking UI during transcription process

## Requirements

- GNOME Shell (version 43+)
- ffmpeg (for audio recording)
- curl (for API communication)
- An OpenAI API key with access to the Whisper API
- Write access to /tmp directory for both ffmpeg and curl

## Installation

### Manual Installation

1. Clone this repository directly into your extensions directory:
```bash
git clone https://github.com/alanpca/gnome-whisper-transcriber.git ~/.local/share/gnome-shell/extensions/whisper-transcriber@opreto.com
```

2. Compile the schema:
```bash
cd ~/.local/share/gnome-shell/extensions/whisper-transcriber@opreto.com/schemas
glib-compile-schemas .
```

3. Restart GNOME Shell:
   - On X11: Press Alt+F2, type 'r' and press Enter
   - On Wayland: Log out and log back in

4. Enable the extension:
```bash
gnome-extensions enable whisper-transcriber@opreto.com
```

## Configuration

1. Click on the microphone icon in the GNOME panel
2. Select "Settings"
3. Enter your OpenAI API key in the field
4. Close the settings window

## Usage

1. Click the microphone icon in the panel to open the menu
2. Select "Record Audio" to start recording
3. Speak into your microphone
4. Click the microphone icon again to stop recording and start transcription
5. Wait for the transcription to complete (notification will appear)
6. The transcribed text will be automatically copied to your clipboard

## Troubleshooting

### Checking Requirements

Make sure ffmpeg and curl are installed:

```bash
# For Debian/Ubuntu
sudo apt install ffmpeg curl

# For Fedora
sudo dnf install ffmpeg curl
```

### Verify /tmp Access

Both ffmpeg and curl must have write access to the /tmp directory:

```bash
# Test ffmpeg write access
ffmpeg -f alsa -i default -t 1 /tmp/test.ogg

# Test curl write access
curl -s https://example.com -o /tmp/test.txt
```

### Debug Logs

Check the GNOME Shell logs for errors:

```bash
journalctl -f /usr/bin/gnome-shell | grep "Whisper Transcriber"
```

### Common Issues

1. **Extension doesn't appear in panel**: Make sure the extension is enabled and the schema is properly compiled.

2. **Recording doesn't work**: Check if ffmpeg is installed and can access your microphone.

3. **Transcription fails**: Verify your API key is correct and has access to the Whisper API.

4. **UI freezes**: The extension should use asynchronous processing, but if you encounter UI freezes, please report the issue.

## License

This extension is released under the [MIT License](LICENSE).

## Credits

- Developed by [Alan P. Laudicina](https://alanp.ca/) at [Opreto](https://www.opreto.com/)
- Uses OpenAI's Whisper API for speech recognition
