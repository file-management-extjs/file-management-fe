Ext.define('FileManagement.components.utils.MessageBoxFix', {
    singleton: true,

    initialized: false,
    defaultMinWidth: 300,
    defaultMaxWidth: 560,

    init: function() {
        if (this.initialized || !Ext.window || !Ext.window.MessageBox) {
            return;
        }

        this.initialized = true;

        Ext.override(Ext.window.MessageBox, {
            show: function(config) {
                FileManagement.components.utils.MessageBoxFix.prepareForShow(this, config || {});
                const result = this.callParent(arguments);
                FileManagement.components.utils.MessageBoxFix.deferFit(this);
                return result;
            },

            afterShow: function() {
                this.callParent(arguments);
                FileManagement.components.utils.MessageBoxFix.fitMessageBox(this);
            },

            updateText: function() {
                const result = this.callParent(arguments);
                FileManagement.components.utils.MessageBoxFix.deferFit(this);
                return result;
            }
        });
    },

    prepareForShow: function(messageBox, config) {
        if (!messageBox) {
            return;
        }

        const sizing = this.resolveSizing(config || {});
        messageBox.fileManagementMessageBoxSizing = sizing;
        messageBox.minWidth = sizing.minWidth;
        messageBox.maxWidth = sizing.maxWidth;

        if (!messageBox.rendered) {
            messageBox.width = sizing.width;
            return;
        }

        messageBox.setWidth(sizing.width);
        if (!config.height && messageBox.getHeight && messageBox.getHeight() > 220) {
            messageBox.setHeight(160);
        } else if (config.height) {
            messageBox.setHeight(config.height);
        }
    },

    resolveSizing: function(config) {
        const viewportWidth = Ext.Element.getViewportWidth();
        const maxWidth = Math.max(260, Math.min(Number(config.maxWidth) || this.defaultMaxWidth, viewportWidth - 24));
        const minWidth = Math.min(maxWidth, Math.max(260, Number(config.minWidth) || this.defaultMinWidth));
        const configuredWidth = Number(config.width) || 0;
        const estimatedWidth = configuredWidth || this.estimateWidth(config, minWidth, maxWidth);

        return {
            width: Math.min(maxWidth, Math.max(minWidth, estimatedWidth)),
            minWidth,
            maxWidth
        };
    },

    estimateWidth: function(config, minWidth, maxWidth) {
        const message = String((config && config.msg) || '');
        const inlineWidth = this.extractInlineWidth(message);
        const text = message
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(div|p|li|tr|ul|ol)>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/[ \t\f\v]+/g, ' ')
            .replace(/\n\s+/g, '\n')
            .trim();
        const longestLine = text.split('\n').reduce(function(longest, line) {
            return Math.max(longest, line.length);
        }, 0);
        const iconSpace = config && config.icon ? 92 : 58;
        const textWidth = Math.ceil(Math.min(longestLine || 32, 72) * 7.2) + iconSpace;
        const contentWidth = inlineWidth ? inlineWidth + iconSpace : textWidth;

        return Math.min(maxWidth, Math.max(minWidth, contentWidth));
    },

    extractInlineWidth: function(message) {
        const match = String(message || '').match(/(?:^|[;"'\s])width\s*:\s*(\d+)px/i);
        return match ? Number(match[1]) : 0;
    },

    deferFit: function(messageBox) {
        Ext.defer(function() {
            FileManagement.components.utils.MessageBoxFix.fitMessageBox(messageBox);
        }, 1);
    },

    fitMessageBox: function(messageBox) {
        if (!messageBox || !messageBox.rendered || messageBox.destroyed || messageBox.destroying) {
            return;
        }

        const body = messageBox.body;
        const bodyEl = body && body.dom;
        const viewportHeight = Ext.Element.getViewportHeight();
        const sizing = messageBox.fileManagementMessageBoxSizing || this.resolveSizing({});
        const maxHeight = Math.max(160, viewportHeight - 40);

        messageBox.setWidth(sizing.width);

        if (body) {
            body.setStyle({
                overflow: 'visible',
                'overflow-x': 'hidden',
                'overflow-y': 'hidden'
            });
        }

        if (bodyEl) {
            if (bodyEl.scrollHeight > bodyEl.clientHeight) {
                const delta = bodyEl.scrollHeight - bodyEl.clientHeight + 18;
                messageBox.setHeight(Math.min(maxHeight, messageBox.getHeight() + delta));
            } else if (bodyEl.clientHeight > bodyEl.scrollHeight + 18) {
                const delta = bodyEl.clientHeight - bodyEl.scrollHeight - 10;
                messageBox.setHeight(Math.max(130, messageBox.getHeight() - delta));
            }
        }

        const promptField = messageBox.down && messageBox.down('textfield');
        if (promptField && promptField.el) {
            promptField.setWidth(Math.max(260, messageBox.getWidth() - 32));
        }

        messageBox.center();
    }
});
