import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const PrefsWidget = GObject.registerClass(
    class PrefsWidget extends Adw.PreferencesPage {
        _init(settings) {
            super._init();

            this._settings = settings;

            // Create API Key group
            const apiGroup = new Adw.PreferencesGroup({
                title: _('OpenAI API Settings')
            });
            this.add(apiGroup);

            // Create API Key row
            const apiKeyRow = new Adw.EntryRow({
                title: _('API Key'),
                tooltip_text: _('Enter your OpenAI API key here')
            });

            // Set current value
            apiKeyRow.text = this._settings.get_string('whisper-api-key');

            // Connect to change event
            apiKeyRow.connect('changed', (entry) => {
                this._settings.set_string('whisper-api-key', entry.text);
            });

            apiGroup.add(apiKeyRow);

            // Add helper text
            const helpGroup = new Adw.PreferencesGroup();
            this.add(helpGroup);

            const helpLabel = new Gtk.Label({
                label: _('Get your API key from <a href="https://platform.openai.com/account/api-keys">OpenAI</a>'),
                use_markup: true,
                margin_top: 10
            });
            helpLabel.connect('activate-link', (label, uri) => {
                Gtk.show_uri(null, uri, Gtk.get_current_event_time());
                return true;
            });

            helpGroup.add(helpLabel);
            // Create Shortcuts group
            const shortcutsGroup = new Adw.PreferencesGroup({
                title: _('Keyboard Shortcuts')
            });
            this.add(shortcutsGroup);

            // Create shortcut selector row
            const shortcutRow = new Adw.ActionRow({
                title: _('Toggle Recording'),
                subtitle: _('Keyboard shortcut to start or stop recording')
            });

            // Create the shortcut controller
            const shortcutLabel = new Gtk.ShortcutLabel({
                valign: Gtk.Align.CENTER,
                disabled_text: _('Disabled')
            });

            const currentAccelerator = this._getCurrentAccelerator();
            shortcutLabel.set_accelerator(currentAccelerator);

            // Create the edit button
            const editButton = new Gtk.Button({
                valign: Gtk.Align.CENTER,
                icon_name: 'edit-symbolic',
                tooltip_text: _('Edit shortcut')
            });

            // Create a disable/enable switch
            const shortcutSwitch = new Gtk.Switch({
                valign: Gtk.Align.CENTER,
                active: currentAccelerator !== '',
                tooltip_text: _('Enable or disable keyboard shortcut')
            });

            // Handle shortcut switch state change
            shortcutSwitch.connect('notify::active', (widget) => {
                if (widget.get_active()) {
                    // Enable shortcut - use the previous value or default if none
                    const lastAccelerator = this._settings.get_strv('toggle-recording-shortcut-backup')[0] || '<Control><Alt>a';
                    this._settings.set_strv('toggle-recording-shortcut', [lastAccelerator]);
                    shortcutLabel.set_accelerator(lastAccelerator);
                } else {
                    // Disable shortcut - save current value as backup and set to empty
                    const currentValue = this._settings.get_strv('toggle-recording-shortcut');
                    if (currentValue.length > 0 && currentValue[0] !== '') {
                        this._settings.set_strv('toggle-recording-shortcut-backup', currentValue);
                    }
                    this._settings.set_strv('toggle-recording-shortcut', ['']);
                    shortcutLabel.set_accelerator('');
                }
            });

            // Handle the edit button
            editButton.connect('clicked', () => {
                if (shortcutSwitch.get_active()) {
                    this._showShortcutDialog(shortcutLabel);
                }
            });

            shortcutRow.add_suffix(shortcutLabel);
            shortcutRow.add_suffix(editButton);
            shortcutRow.add_suffix(shortcutSwitch);
            shortcutsGroup.add(shortcutRow);
        }

        _getCurrentAccelerator() {
            const shortcuts = this._settings.get_strv('toggle-recording-shortcut');
            return shortcuts.length > 0 ? shortcuts[0] : '';
        }

        _showShortcutDialog(shortcutLabel) {
            const dialog = new Gtk.Dialog({
                title: _('Set Shortcut'),
                use_header_bar: true,
                modal: true,
                resizable: false
            });

            // Add buttons
            dialog.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
            dialog.add_button(_('Set'), Gtk.ResponseType.OK);
            dialog.set_default_response(Gtk.ResponseType.OK);

            const contentArea = dialog.get_content_area();
            contentArea.spacing = 12;
            contentArea.margin_start = 12;
            contentArea.margin_end = 12;
            contentArea.margin_top = 12;
            contentArea.margin_bottom = 12;

            const shortcutKey = new Gtk.ShortcutLabel({
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
                disabled_text: _('Press any key combination')
            });

            shortcutKey.set_accelerator(this._getCurrentAccelerator());

            const shortcutController = new Gtk.EventControllerKey();

            let newAccelerator = null;

            shortcutController.connect('key-pressed', (controller, keyval, keycode, state) => {
                // Skip modifier keys
                if (keyval === Gdk.KEY_Control_L || keyval === Gdk.KEY_Control_R ||
                    keyval === Gdk.KEY_Alt_L || keyval === Gdk.KEY_Alt_R ||
                    keyval === Gdk.KEY_Shift_L || keyval === Gdk.KEY_Shift_R ||
                    keyval === Gdk.KEY_Meta_L || keyval === Gdk.KEY_Meta_R) {
                    return Gdk.EVENT_PROPAGATE;
                }

                newAccelerator = Gtk.accelerator_name(keyval, state);
                shortcutKey.set_accelerator(newAccelerator);

                return Gdk.EVENT_STOP;
            });

            dialog.add_controller(shortcutController);
            contentArea.append(shortcutKey);
            dialog.connect('response', (dlg, response) => {
                if (response === Gtk.ResponseType.OK && newAccelerator) {
                    this._settings.set_strv('toggle-recording-shortcut', [newAccelerator]);
                    shortcutLabel.set_accelerator(newAccelerator);
                }
                dialog.destroy();
            });

            dialog.show();
        }
    }
);

export default class WhisperTranscriberPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new PrefsWidget(settings);
        window.add(page);
    }
}
