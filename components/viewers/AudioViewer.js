Ext.define('FileManagement.components.viewers.AudioViewer', {
    extend: 'Ext.panel.Panel',
    xtype: 'audioviewer',

    requires: [
        'FileManagement.components.utils.NotificationUtil',
        'FileManagement.components.utils.PanelUtils',
        'FileManagement.helpers.Functions'
    ],

    title: 'Audio Player',
    layout: {
        type: 'vbox',
        align: 'stretch'
    },
    closable: true,
    frame: true,
    modal: true,

    width: 520,
    height: 260,
    x: 24,
    y: 24,

    config: {
        fileId: null,
        fileName: '',
        mimeType: 'audio/mpeg',
        autoPlay: false,
        loop: false
    },

    draggable: {
        onMouseUp: function(e, panel) {
            FileManagement.components.utils.PanelUtils.onMouseUp(panel ?? this.panel, e, this);
        },
        onDrag: function(e, panel) {
            FileManagement.components.utils.PanelUtils.onDrag(panel ?? this.panel, e, this);
        }
    },

    resizable: {
        constrain: true,
        dynamic: true,
        minHeight: 230,
        minWidth: 420
    },

    header: {
        listeners: {
            dblclick: function(header) {
                const panel = header.up('panel');
                FileManagement.components.utils.PanelUtils.toggleMaximize(panel);
            }
        }
    },

    tools: [
        {
            type: 'minimize',
            tooltip: 'Minimize to toolbar',
            handler: function() {
                FileManagement.components.utils.PanelUtils.minimizeToTaskbar(this.up('panel'));
            }
        },
        {
            type: 'maximize',
            itemId: 'maximizeTool',
            handler: function() {
                const panel = this.up('panel');
                if (panel && !panel.maximized) {
                    FileManagement.components.utils.PanelUtils.maximizePanel(panel);
                } else if (panel) {
                    FileManagement.components.utils.PanelUtils.minimizePanel(panel);
                }
            }
        }
    ],

    tbar: [
        {
            text: 'Play',
            itemId: 'playButton',
            iconCls: 'fa fa-play',
            disabled: true,
            handler: function(button) {
                button.up('audioviewer').playAudio();
            }
        },
        {
            text: 'Pause',
            itemId: 'pauseButton',
            iconCls: 'fa fa-pause',
            disabled: true,
            handler: function(button) {
                button.up('audioviewer').pauseAudio();
            }
        },
        {
            text: 'Restart',
            itemId: 'restartButton',
            iconCls: 'fa fa-rotate-left',
            disabled: true,
            handler: function(button) {
                button.up('audioviewer').restartAudio();
            }
        },
        '->',
        {
            text: 'Mute',
            itemId: 'muteButton',
            iconCls: 'fa fa-volume-xmark',
            disabled: true,
            enableToggle: true,
            handler: function(button, pressed) {
                button.up('audioviewer').setMuted(pressed);
            }
        }
    ],

    listeners: {
        beforedestroy: function(panel) {
            panel.stopCurrentAudio();
        },
        destroy: function(panel) {
            panel.revokeObjectUrl();
        },
        afterrender: function(panel) {
            const el = panel.getEl();
            if (el) {
                el.setStyle('z-index', ++window.highestZIndex);
            }
        }
    },

    initComponent: function() {
        const fileName = this.getFileName ? this.getFileName() : this.fileName;

        Ext.apply(this, {
            bodyPadding: 12,
            items: [
                {
                    xtype: 'container',
                    layout: {
                        type: 'hbox',
                        align: 'middle'
                    },
                    margin: '0 0 10 0',
                    items: [
                        {
                            xtype: 'component',
                            width: 54,
                            html: '<i class="fa fa-music blue-icon" style="font-size: 36px;"></i>'
                        },
                        {
                            xtype: 'container',
                            flex: 1,
                            items: [
                                {
                                    xtype: 'component',
                                    itemId: 'trackTitle',
                                    html: Ext.String.htmlEncode(fileName || 'Audio file'),
                                    style: 'font-size: 18px; font-weight: bold; line-height: 24px;'
                                },
                                {
                                    xtype: 'displayfield',
                                    itemId: 'trackStatus',
                                    fieldLabel: 'Status',
                                    labelWidth: 48,
                                    value: 'Loading audio...'
                                }
                            ]
                        }
                    ]
                },
                {
                    xtype: 'container',
                    itemId: 'audioHost',
                    height: 52,
                    margin: '0 0 10 0',
                    layout: 'fit'
                },
                {
                    xtype: 'progressbar',
                    itemId: 'playbackProgress',
                    value: 0,
                    text: '00:00 / 00:00'
                }
            ]
        });

        this.callParent(arguments);
        this.on('afterrender', function() {
            this.loadTrack({
                fileId: this.getFileId ? this.getFileId() : this.fileId,
                fileName: this.getFileName ? this.getFileName() : this.fileName,
                mimeType: this.getMimeType ? this.getMimeType() : this.mimeType,
                autoPlay: this.getAutoPlay ? this.getAutoPlay() : this.autoPlay
            });
        }, this, { single: true });
    },

    loadTrack: async function(track) {
        if (this.isPanelInactive()) {
            return;
        }

        const fileId = track.fileId;
        const fileName = track.fileName || 'Audio file';
        const mimeType = track.mimeType || 'audio/mpeg';
        const autoPlay = !!track.autoPlay;
        const audioUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
        const token = FileManagement.helpers.Functions.getToken();

        this.stopCurrentAudio();
        this.setFileId(fileId);
        this.setFileName(fileName);
        this.setMimeType(mimeType);
        this.setAutoPlay(autoPlay);
        this.setTitle(`Audio Player: ${fileName}`);
        this.updateTrackTitle(fileName);
        this.updateTaskbarButton(fileName);
        this.updateStatus('Loading audio...');
        this.updatePlaybackProgress();
        this.setPlayerButtonsDisabled(true);
        this.setLoading('Loading audio...');

        try {
            const response = await fetch(audioUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load audio');
            }

            const audioBlob = await response.blob();
            if (this.isPanelInactive()) {
                return;
            }

            this.objectUrl = URL.createObjectURL(audioBlob);
            this.renderAudioElement();
            this.updateStatus('Ready to play');
            this.setPlayerButtonsDisabled(false);
        } catch (error) {
            this.updateStatus('Unable to load audio');
            FileManagement.components.utils.NotificationUtil.showError('Unable to load audio.', 'Load Error');
            console.error('Audio loading failed:', error);
        } finally {
            if (!this.isPanelInactive()) {
                this.setLoading(false);
            }
        }
    },

    stopCurrentAudio: function() {
        if (this.audioEl) {
            this.unbindAudioEvents(this.audioEl);
            this.audioEl.pause();
            this.audioEl.removeAttribute('src');
            this.audioEl.load();
            this.audioEl = null;
        }

        this.revokeObjectUrl();
    },

    renderAudioElement: function() {
        if (this.isPanelInactive()) {
            return;
        }

        const host = this.down('#audioHost');
        if (!host) {
            return;
        }

        host.removeAll(true);

        const audioComponent = host.add({
            xtype: 'component',
            autoEl: {
                tag: 'audio',
                controls: true,
                autoplay: this.getAutoPlay ? this.getAutoPlay() : this.autoPlay,
                loop: this.getLoop ? this.getLoop() : this.loop,
                preload: 'metadata',
                style: 'width: 100%;',
                src: this.objectUrl,
                type: this.getMimeType ? this.getMimeType() : this.mimeType || 'audio/mpeg'
            },
            listeners: {
                afterrender: (component) => {
                    this.audioEl = component.getEl().dom;
                    this.bindAudioEvents(this.audioEl);
                }
            }
        });

        return audioComponent;
    },

    bindAudioEvents: function(audioEl) {
        this.audioHandlers = {
            loadedmetadata: () => this.updatePlaybackProgress(),
            timeupdate: () => this.updatePlaybackProgress(),
            play: () => this.updateStatus('Playing'),
            pause: () => this.updateStatus('Paused'),
            ended: () => this.updateStatus('Finished'),
            error: () => this.updateStatus('Playback error'),
            contextmenu: (event) => {
                if (event.cancelable !== false) {
                    event.preventDefault();
                }
            }
        };

        Object.keys(this.audioHandlers).forEach((eventName) => {
            audioEl.addEventListener(eventName, this.audioHandlers[eventName]);
        });

        audioEl.setAttribute('controlslist', 'nodownload noremoteplayback');

        const autoPlay = this.getAutoPlay ? this.getAutoPlay() : this.autoPlay;

        if (autoPlay) {
            audioEl.play().catch(() => {
                if (!this.isPanelInactive()) {
                    this.updateStatus('Ready to play');
                }
            });
        }
    },

    unbindAudioEvents: function(audioEl) {
        if (!audioEl || !this.audioHandlers) {
            return;
        }

        Object.keys(this.audioHandlers).forEach((eventName) => {
            audioEl.removeEventListener(eventName, this.audioHandlers[eventName]);
        });

        this.audioHandlers = null;
    },

    playAudio: function() {
        if (this.isPanelInactive() || !this.audioEl) {
            return;
        }

        this.audioEl.play().catch(() => {
            if (!this.isPanelInactive()) {
                FileManagement.components.utils.NotificationUtil.showError('Unable to start playback.', 'Playback Error');
            }
        });
    },

    pauseAudio: function() {
        if (!this.isPanelInactive() && this.audioEl) {
            this.audioEl.pause();
        }
    },

    restartAudio: function() {
        if (this.isPanelInactive() || !this.audioEl) {
            return;
        }

        this.audioEl.currentTime = 0;
        this.playAudio();
    },

    setMuted: function(muted) {
        if (!this.isPanelInactive() && this.audioEl) {
            this.audioEl.muted = muted;
        }
    },

    updateStatus: function(status) {
        if (this.isPanelInactive()) {
            return;
        }

        const statusField = this.down('#trackStatus');
        if (statusField) {
            statusField.setValue(Ext.String.htmlEncode(status));
        }
    },

    updateTrackTitle: function(fileName) {
        if (this.isPanelInactive()) {
            return;
        }

        const title = this.down('#trackTitle');
        if (title) {
            title.update(Ext.String.htmlEncode(fileName || 'Audio file'));
        }
    },

    updateTaskbarButton: function(fileName) {
        if (this.isPanelInactive()) {
            return;
        }

        const button = FileManagement.components.utils.PanelUtils.getPanelToggleButton(this);
        if (button && button.setText) {
            button.setText(fileName || 'Audio Player');
        }
    },

    updatePlaybackProgress: function() {
        if (this.isPanelInactive()) {
            return;
        }

        const progressBar = this.down('#playbackProgress');
        if (!progressBar || !this.audioEl) {
            return;
        }

        const duration = Number.isFinite(this.audioEl.duration) ? this.audioEl.duration : 0;
        const currentTime = Number.isFinite(this.audioEl.currentTime) ? this.audioEl.currentTime : 0;
        const progress = duration > 0 ? currentTime / duration : 0;
        const text = `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;

        progressBar.updateProgress(progress, text, true);
    },

    setPlayerButtonsDisabled: function(disabled) {
        if (this.isPanelInactive()) {
            return;
        }

        ['playButton', 'pauseButton', 'restartButton', 'muteButton'].forEach((itemId) => {
            const button = this.down(`#${itemId}`);
            if (button) {
                button.setDisabled(disabled);
            }
        });
    },

    revokeObjectUrl: function() {
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }
    },

    isPanelInactive: function() {
        return this.destroying || this.destroyed || !this.items || !this.items.items;
    },

    formatTime: function(seconds) {
        const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
        const minutes = Math.floor(safeSeconds / 60);
        const remainder = safeSeconds % 60;

        return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    }
});
