// GNOME Extension: Whisper Transcriber
// Description: Records audio, transcribes it using OpenAI Whisper API, and copies to clipboard

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Gtk from 'gi://Gtk';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

// Extension state
let indicator = null;
let isRecording = false;
let recordingPath = '';
let recordingProcess = null;
let settings = null;
let keyboardShortcut = null;
let timeoutIds = [];

// API key settings key
const API_KEY_SETTING = 'whisper-api-key';
const TOGGLE_SHORTCUT_SETTING = 'toggle-recording-shortcut';
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

/**
 * Check if required dependencies are installed
 * @returns {boolean} True if all dependencies are available
 */
function _checkDependencies() {
    // Use Shell.AppSystem to check for applications instead of spawning processes
    const appSystem = Shell.AppSystem.get_default();
    
    let missingDeps = [];

    // Check for ffmpeg availability via which command (non-blocking approach)
    try {
        const ffmpegFile = Gio.File.new_for_path('/usr/bin/ffmpeg');
        if (!ffmpegFile.query_exists(null)) {
            const ffmpegFile2 = Gio.File.new_for_path('/usr/local/bin/ffmpeg');
            if (!ffmpegFile2.query_exists(null)) {
                missingDeps.push('ffmpeg');
            }
        }
    } catch (e) {
        missingDeps.push('ffmpeg');
    }

    // Check for curl availability
    try {
        const curlFile = Gio.File.new_for_path('/usr/bin/curl');
        if (!curlFile.query_exists(null)) {
            const curlFile2 = Gio.File.new_for_path('/usr/local/bin/curl');
            if (!curlFile2.query_exists(null)) {
                missingDeps.push('curl');
            }
        }
    } catch (e) {
        missingDeps.push('curl');
    }

    if (missingDeps.length > 0) {
        Main.notifyError(
            _('Whisper Transcriber Error'),
            _('Missing required dependencies: %s').format(missingDeps.join(', '))
        );
        return false;
    }

    // Check /tmp directory write permissions
    try {
        let tempFile = '/tmp/whisper_transcriber_test_' + Math.floor(Date.now() / 1000);
        GLib.file_set_contents(tempFile, 'test');
        GLib.unlink(tempFile);
    } catch (e) {
        Main.notifyError(
            _('Whisper Transcriber Error'),
            _('Cannot write to /tmp directory. Check permissions.')
        );
        return false;
    }

    return true;
}

const WhisperTranscriberIndicator = GObject.registerClass(
    class WhisperTranscriberIndicator extends PanelMenu.Button {
        _init(depsAvailable) {
            super._init(0.0, _('Whisper Transcriber'));

            this._depsAvailable = depsAvailable;
            this._checkCount = 0;

            // Create the panel icon
            this.icon = new St.Icon({
                icon_name: 'audio-input-microphone-symbolic',
                style_class: 'system-status-icon'
            });
            this.add_child(this.icon);

            // Create the menu
            this._buildMenu();
        }

        _buildMenu() {
            // Record button
            this.recordItem = new PopupMenu.PopupMenuItem(_('Record Audio'));
            this.recordItem.connect('activate', () => {
                if (this._depsAvailable) {
                    if (isRecording) {
                        this._stopRecording();
                    } else {
                        this._startRecording();
                    }
                } else {
                    this._notify(_('Missing dependencies. Check system logs for details.'));
                }
            });
            this.menu.addMenuItem(this.recordItem);

            // If deps are missing, disable the Record Audio item
            if (!this._depsAvailable) {
                this.recordItem.reactive = false;
                this.recordItem.add_style_class_name('error-text');
            }

            // Separator
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Settings
            const settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
            settingsItem.connect('activate', () => {
                this._openSettings();
            });
            this.menu.addMenuItem(settingsItem);
        }

        toggleRecording() {
            if (this._depsAvailable) {
                if (isRecording) {
                    this._stopRecording();
                } else {
                    this._startRecording();
                }
            } else {
                this._notify(_('Missing dependencies. Check system logs for details.'));
            }
        }

        _notify(message) {
            Main.notify(_('Whisper Transcriber'), message);
        }

        _openSettings() {
            // Launch preferences
            if (this._extension) {
                this._extension.openPreferences();
            }
        }

        setExtension(extension) {
            this._extension = extension;
        }

        _startRecording() {
            if (isRecording) return;

            // Check API key
            const apiKey = settings.get_string(API_KEY_SETTING);
            if (!apiKey) {
                this._notify(_('Please set your OpenAI API key in the extension settings'));
                this._openSettings();
                return;
            }

            // Simple path in /tmp
            recordingPath = '/tmp/whisper_recording_' + Math.floor(Date.now() / 1000) + '.ogg';

            // Update UI
            this.icon.icon_name = 'media-record-symbolic';
            this.icon.style_class = 'system-status-icon recording-active';
            this.recordItem.label.text = _('Stop Recording');
            isRecording = true;

            // Start ffmpeg process directly
            try {
                const ffmpegArgs = [
                    'ffmpeg',
                    '-f', 'alsa',
                    '-i', 'default',
                    '-c:a', 'libvorbis',
                    '-y',  // Overwrite output file if it exists
                    recordingPath     // Output file
                ];

                // Spawn the process with a unique identifier for easier killing
                this._logDebug(_('Recording...'));

                let spawnResult = GLib.spawn_async(
                    null,           // Working directory (null = default)
                    ffmpegArgs,     // Arguments
                    null,           // Environment variables (null = inherit)
                    GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,  // Use PATH and don't reap child
                    null            // Child setup function
                );

                let success = spawnResult[0];
                let pid = spawnResult[1];

                this._logDebug(_('Spawn result - success: %s, pid: %s').format(success, pid));

                if (success && pid > 0) {
                    recordingProcess = pid;
                    this._logDebug(_('Started recording process with PID: %s').format(recordingProcess));
                } else {
                    throw new Error("Failed to start recording process - invalid PID");
                }
            } catch (e) {
                this._notify(_('Error starting recording: %s').format(e.message));
                this._resetUI();
            }
        }

        _stopRecording() {
            if (!isRecording) return;

            // Terminate the recording process using the stored PID
            try {
                if (recordingProcess && recordingProcess > 0) {
                    this._logDebug(_('Attempting to terminate PID: %s').format(recordingProcess));
                    
                    // Send SIGTERM to the specific process using async subprocess
                    try {
                        const proc = Gio.Subprocess.new(
                            ['kill', '-TERM', recordingProcess.toString()],
                            Gio.SubprocessFlags.NONE
                        );
                        
                        proc.wait_async(null, (proc, result) => {
                            try {
                                const success = proc.wait_finish(result);
                                if (success) {
                                    this._logDebug(_('Successfully terminated recording process (PID: %s)').format(recordingProcess));
                                } else {
                                    this._logDebug(_('Kill command failed for PID: %s').format(recordingProcess));
                                }
                            } catch (e) {
                                this._logDebug(_('Error waiting for kill process: %s').format(e.message));
                            }
                        });
                    } catch (e) {
                        this._logDebug(_('Error creating kill subprocess: %s').format(e.message));
                    }
                    
                    recordingProcess = null;
                } else {
                    this._logDebug(_('No valid recording process PID to terminate: %s').format(recordingProcess));
                }

                this._logDebug(_('Processing recording...'));
            } catch (e) {
                this._notify(_('Error stopping recording: %s').format(e.message));
                this._logDebug(_('Kill error details: %s').format(e.message));
            }

            this._waitForFileCompletion(recordingPath, 0);
        }

        _resetUI() {
            this.icon.icon_name = 'audio-input-microphone-symbolic';
            this.icon.style_class = 'system-status-icon';
            this.recordItem.label.text = _('Record Audio');
            isRecording = false;
        }

        _processAudio(filePath) {
            // Show processing indicator
            this.icon.icon_name = 'emblem-synchronizing-symbolic';
            this.icon.style_class = 'system-status-icon processing-active';
            this.recordItem.reactive = false;

            this._logDebug(_('Transcribing...'));

            // Get API key from settings
            const apiKey = settings.get_string(API_KEY_SETTING);
            if (!apiKey) {
                this._notify(_('API key not set. Please configure in settings.'));
                this._openSettings();
                this._resetProcessingUI();
                return;
            }

            // Run curl asynchronously to avoid UI freezing
            try {
                // Create a temp file for the output
                const outputPath = '/tmp/whisper_output_' + Math.floor(Date.now() / 1000) + '.txt';

                // Build a command that writes to the output file
                const command = 'curl -s "https://api.openai.com/v1/audio/transcriptions" ' +
                               '-H "Authorization: Bearer ' + apiKey + '" ' +
                               '-H "Content-Type: multipart/form-data" ' +
                               '-F "file=@' + filePath + '" ' +
                               '-F "model=whisper-1" ' +
                               '-F "response_format=text" > ' + outputPath + ' 2>/tmp/whisper_error.txt';

                // Log command for debugging (without API key)
                this._logDebug(_('Running command: %s').format(command.replace(apiKey, 'API_KEY_HIDDEN')));

                // Run the command asynchronously
                let spawnResult = GLib.spawn_async(
                    null,                         // Working directory
                    ['bash', '-c', command],      // Command
                    null,                         // Environment
                    GLib.SpawnFlags.SEARCH_PATH,  // Flags
                    null                          // Child setup function
                );

                let success = spawnResult[0];

                if (!success) {
                    throw new Error(_('Failed to launch transcription process'));
                }

                // Set up a timeout to check for the output file
                this._checkCount = 0;  // Reset counter
                this._checkTranscriptionResult(outputPath, filePath);

            } catch (e) {
                this._notify(_('Error launching transcription: %s').format(e.message.substring(0, 100)));
                this._resetProcessingUI();

                // Clean up file on error
                try {
                    GLib.unlink(filePath);
                } catch (e) {
                    // Ignore file cleanup errors
                }
            }
        }

        // Reset UI after processing
        _resetProcessingUI() {
            this.icon.icon_name = 'audio-input-microphone-symbolic';
            this.icon.style_class = 'system-status-icon';
            this.recordItem.reactive = true;
        }

        // Add debug logging method
        _logDebug(message) {
            console.log('[Whisper Transcriber] ' + message);
        }

        // Check for transcription results
        _checkTranscriptionResult(outputPath, originalFilePath) {
            // Check if the output file exists after a short delay
            const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                // Remove from tracked timeouts when done
                const index = timeoutIds.indexOf(timeoutId);
                if (index > -1) {
                    timeoutIds.splice(index, 1);
                }
                try {
                    // Check if file exists
                    if (GLib.file_test(outputPath, GLib.FileTest.EXISTS)) {
                        // Read the output file
                        let fileContents = GLib.file_get_contents(outputPath);
                        let success = fileContents[0];
                        let contents = fileContents[1];

                        if (success && contents && contents.length > 0) {
                            // Convert contents to string
                            const decoder = new TextDecoder('utf-8');
                            const transcription = decoder.decode(contents).trim();

                            if (transcription.length > 0) {
                                // Copy to clipboard
                                St.Clipboard.get_default().set_text(CLIPBOARD_TYPE, transcription);

                                // Notify user
                                const truncated = transcription.length > 50
                                    ? transcription.substring(0, 50) + '...'
                                    : transcription;
                                this._notify(_('Transcription copied to clipboard: "%s"').format(truncated));
                            } else {
                                this._notify(_('Transcription returned empty result'));

                                // Check for error output
                                this._checkErrorFile();
                            }

                            // Clean up files
                            try {
                                GLib.unlink(outputPath);
                                GLib.unlink(originalFilePath);
                            } catch (e) {
                                // Ignore cleanup errors
                            }

                            // Reset UI
                            this._resetProcessingUI();
                            return GLib.SOURCE_REMOVE; // Stop checking
                        }
                    }

                    // If we reach here, either the file doesn't exist yet or it's empty
                    // Continue checking until timeout (20 seconds max)
                    this._checkCount++;

                    if (this._checkCount > 40) { // 40 * 500ms = 20 seconds
                        this._notify(_('Transcription timed out'));
                        this._checkErrorFile();

                        // Clean up
                        try {
                            GLib.unlink(outputPath);
                            GLib.unlink(originalFilePath);
                        } catch (e) {
                            // Ignore cleanup errors
                        }

                        // Reset UI
                        this._resetProcessingUI();
                        return GLib.SOURCE_REMOVE; // Stop checking
                    }

                    return GLib.SOURCE_CONTINUE; // Continue checking
                } catch (e) {
                    this._notify(_('Error checking results: %s').format(e.message.substring(0, 100)));
                    this._resetProcessingUI();
                    return GLib.SOURCE_REMOVE; // Stop checking on error
                }
            });
            
            // Track timeout for cleanup
            timeoutIds.push(timeoutId);
        }

        // Check for error details
        _checkErrorFile() {
            try {
                if (GLib.file_test('/tmp/whisper_error.txt', GLib.FileTest.EXISTS)) {
                    let fileContents = GLib.file_get_contents('/tmp/whisper_error.txt');
                    let success = fileContents[0];
                    let contents = fileContents[1];

                    if (success && contents && contents.length > 0) {
                        const decoder = new TextDecoder('utf-8');
                        const errorMsg = decoder.decode(contents).trim();
                        this._notify(_('Error details: %s').format(errorMsg.substring(0, 100)));
                        this._logDebug(_('Full error: %s').format(errorMsg));
                    }
                }
            } catch (e) {
                // Ignore errors reading the error file
            }
        }
        _waitForFileCompletion(filePath, attempts) {
            const MAX_ATTEMPTS = 20; // Maximum number of attempts (10 seconds total)

            if (attempts >= MAX_ATTEMPTS) {
                this._logDebug('Timeout waiting for file to be finalized');
                this._resetUI();
                this._processAudio(filePath); // Try processing anyway
                return;
            }

            // Check if file exists and has size
            const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                // Remove from tracked timeouts when done
                const index = timeoutIds.indexOf(timeoutId);
                if (index > -1) {
                    timeoutIds.splice(index, 1);
                }
                try {
                    if (GLib.file_test(filePath, GLib.FileTest.EXISTS)) {
                        // Get file info to check size
                        const file = Gio.File.new_for_path(filePath);
                        const info = file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
                        const fileSize = info.get_size();

                        this._logDebug(`File size: ${fileSize} bytes`);

                        if (fileSize > 0) {
                            // File exists and has content
                            this._logDebug('File finalized successfully');
                            this._resetUI();
                            this._processAudio(filePath);
                            return GLib.SOURCE_REMOVE;
                        }
                    }

                    // File doesn't exist or has no content yet, try again
                    this._logDebug(`Waiting for file to be finalized, attempt ${attempts + 1}/${MAX_ATTEMPTS}`);
                    this._waitForFileCompletion(filePath, attempts + 1);

                } catch (e) {
                    this._logDebug(`Error checking file: ${e.message}`);
                    // Continue waiting despite error
                    this._waitForFileCompletion(filePath, attempts + 1);
                }

                return GLib.SOURCE_REMOVE;
            });
            
            // Track timeout for cleanup
            timeoutIds.push(timeoutId);
        }
    }
);

export default class WhisperTranscriberExtension extends Extension {
    enable() {
        console.log('Enabling Whisper Transcriber extension');

        // Load settings
        settings = this.getSettings();

        // Check dependencies
        const depsAvailable = _checkDependencies();

        // Create the indicator
        indicator = new WhisperTranscriberIndicator(depsAvailable);
        indicator.setExtension(this);

        // Add the indicator to the panel
        Main.panel.addToStatusArea('whisper-transcriber', indicator);

        // Set up keyboard shortcut
        this._setupKeyboardShortcut();
    }

    disable() {
        console.log('Disabling Whisper Transcriber extension');

        // Clean up all active timeouts
        timeoutIds.forEach(id => {
            GLib.Source.remove(id);
        });
        timeoutIds = [];

        // Stop any ongoing recording
        if (isRecording) {
            try {
                indicator._stopRecording();
            } catch (e) {
                // Ignore errors during cleanup
            }
        }

        // Remove keyboard shortcuts
        this._removeKeyboardShortcut();

        // Remove the indicator from the panel
        if (indicator) {
            indicator.destroy();
            indicator = null;
        }

        // Clean up settings
        settings = null;
    }

    _setupKeyboardShortcut() {
        // Get shortcut setting
        const shortcuts = settings.get_strv(TOGGLE_SHORTCUT_SETTING);

        // Only set up shortcut if it exists and is not empty  
        if (shortcuts && shortcuts.length > 0 && shortcuts[0] && shortcuts[0].length > 0) {
            // Validate the accelerator format
            Gtk.accelerator_parse(shortcuts[0]);

            // Set up the key binding
            if (Main.wm.addKeybinding) {
                keyboardShortcut = Main.wm.addKeybinding(
                    TOGGLE_SHORTCUT_SETTING,
                    settings,
                    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                    Shell.ActionMode.ALL,
                    () => {
                        if (indicator) {
                            indicator.toggleRecording();
                        }
                    }
                );
                console.log('Keyboard shortcut for Whisper Transcriber registered: ' + shortcuts[0]);
            }
        } else {
            console.log('Whisper Transcriber keyboard shortcut is disabled');
        }

        // Listen for changes to the shortcut setting
        this._settingsChangedId = settings.connect('changed::' + TOGGLE_SHORTCUT_SETTING, () => {
            this._removeKeyboardShortcut();
            this._setupKeyboardShortcut();
        });
    }

    _removeKeyboardShortcut() {
        if (this._settingsChangedId) {
            settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (keyboardShortcut && Main.wm.removeKeybinding) {
            Main.wm.removeKeybinding(TOGGLE_SHORTCUT_SETTING);
            keyboardShortcut = null;
        }
    }
}
