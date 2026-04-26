Ext.define('FileManagement.components.utils.MessageBoxFix', {
    singleton: true,

    initialized: false,
    defaultMinWidth: 250,
    defaultMaxWidth: 560,
    defaultMinHeight: 110,
    defaultMaxHeight: 500,

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

            hide: function() {
                const result = this.callParent(arguments);
                FileManagement.components.utils.MessageBoxFix.resetAfterHide(this);
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
        config.width = sizing.width;
        config.minWidth = sizing.minWidth;
        config.maxWidth = sizing.maxWidth;
        config.minHeight = sizing.minHeight;
        config.maxHeight = sizing.maxHeight;
        messageBox.minWidth = sizing.minWidth;
        messageBox.maxWidth = sizing.maxWidth;
        messageBox.minHeight = sizing.minHeight;
        messageBox.maxHeight = sizing.maxHeight;

        if (!messageBox.rendered) {
            messageBox.width = sizing.width;
            messageBox.height = config.height || sizing.minHeight;
            return;
        }

        this.resetRenderedHeight(messageBox);
        messageBox.setWidth(sizing.width);
        messageBox.setHeight(config.height || sizing.minHeight);
    },

    resolveSizing: function(config) {
        const viewportWidth = Ext.Element.getViewportWidth();
        const maxWidth = Math.max(260, Math.min(Number(config.maxWidth) || this.defaultMaxWidth, viewportWidth - 24));
        const minWidth = Math.min(maxWidth, Math.max(220, Number(config.minWidth) || this.defaultMinWidth));
        const configuredWidth = Number(config.width) || 0;
        const estimatedWidth = configuredWidth || this.estimateWidth(config, minWidth, maxWidth);
        const viewportHeight = Ext.Element.getViewportHeight();
        const maxHeight = Math.max(this.defaultMinHeight, Math.min(Number(config.maxHeight) || this.defaultMaxHeight, viewportHeight - 40));
        const minHeight = Math.min(maxHeight, Math.max(90, Number(config.minHeight) || this.defaultMinHeight));

        return {
            width: Math.min(maxWidth, Math.max(minWidth, estimatedWidth)),
            minWidth,
            maxWidth,
            minHeight,
            maxHeight
        };
    },

    estimateWidth: function(config, minWidth, maxWidth) {
        const message = String((config && (config.message || config.msg || config.html)) || '');
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

    resetRenderedHeight: function(messageBox) {
        const elements = [
            messageBox.el,
            messageBox.body,
            messageBox.topContainer && messageBox.topContainer.el,
            messageBox.promptContainer && messageBox.promptContainer.el
        ];

        Ext.Array.each(elements, function(element) {
            if (element && element.dom) {
                element.setStyle('height', '');
            }
        });
    },

    resetAfterHide: function(messageBox) {
        if (!messageBox) {
            return;
        }

        messageBox.fileManagementMessageBoxSizing = null;
        messageBox.minWidth = messageBox.defaultMinWidth || this.defaultMinWidth;
        messageBox.maxWidth = messageBox.defaultMaxWidth || this.defaultMaxWidth;
        messageBox.minHeight = messageBox.defaultMinHeight || this.defaultMinHeight;
        messageBox.maxHeight = messageBox.defaultMaxHeight || this.defaultMaxHeight;

        if (messageBox.rendered) {
            this.resetRenderedHeight(messageBox);
            messageBox.width = null;
            messageBox.height = null;
        }
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

        if (messageBox.hidden === true || (messageBox.isVisible && !messageBox.isVisible())) {
            return;
        }

        const body = messageBox.body;
        const bodyEl = body && body.dom;
        const viewportHeight = Ext.Element.getViewportHeight();
        const sizing = messageBox.fileManagementMessageBoxSizing || this.resolveSizing({});
        const maxHeight = Math.max(sizing.minHeight, Math.min(sizing.maxHeight, viewportHeight - 40));

        messageBox.setWidth(sizing.width);

        if (body) {
            body.setStyle({
                overflow: 'visible',
                'overflow-x': 'hidden',
                'overflow-y': 'hidden'
            });
        }

        const contentHeight = this.calculateContentHeight(messageBox, sizing);
        if (contentHeight) {
            messageBox.setHeight(Math.min(maxHeight, Math.max(sizing.minHeight, contentHeight)));
        }

        if (bodyEl) {
            if (bodyEl.scrollHeight > bodyEl.clientHeight) {
                const delta = bodyEl.scrollHeight - bodyEl.clientHeight + 18;
                messageBox.setHeight(Math.min(maxHeight, messageBox.getHeight() + delta));
            } else if (bodyEl.clientHeight > bodyEl.scrollHeight + 18) {
                const delta = bodyEl.clientHeight - bodyEl.scrollHeight - 10;
                messageBox.setHeight(Math.max(sizing.minHeight, messageBox.getHeight() - delta));
            }
        }

        const promptField = messageBox.down && messageBox.down('textfield');
        if (promptField && promptField.el) {
            promptField.setWidth(Math.max(260, messageBox.getWidth() - 32));
        }

        messageBox.center();
    },

    calculateContentHeight: function(messageBox, sizing) {
        const headerHeight = this.getOuterHeight(messageBox.header);
        const bodyChrome = this.getVerticalChrome(messageBox.body);
        const windowChrome = this.getVerticalChrome(messageBox.el);
        const toolbarHeight = this.isVisible(messageBox.bottomTb) ? this.getOuterHeight(messageBox.bottomTb) : 0;
        const topHeight = this.getTopContainerContentHeight(messageBox);
        const progressHeight = this.isVisible(messageBox.progressBar) ? this.getOuterHeight(messageBox.progressBar) : 0;
        const contentHeight = headerHeight + bodyChrome + windowChrome + toolbarHeight + topHeight + progressHeight;

        return contentHeight ? Math.ceil(contentHeight) : sizing.minHeight;
    },

    getTopContainerContentHeight: function(messageBox) {
        const topContainer = messageBox.topContainer;
        const topChrome = this.getVerticalChrome(topContainer && topContainer.el);
        const iconHeight = this.isVisible(messageBox.iconComponent) ? this.getOuterHeight(messageBox.iconComponent) : 0;
        const messageHeight = this.isVisible(messageBox.msg) ? this.getOuterHeight(messageBox.msg) : 0;
        const textFieldHeight = this.isVisible(messageBox.textField) ? this.getOuterHeight(messageBox.textField) : 0;
        const textAreaHeight = this.isVisible(messageBox.textArea) ? this.getOuterHeight(messageBox.textArea) : 0;
        const promptHeight = messageHeight + textFieldHeight + textAreaHeight;

        return Math.max(iconHeight, promptHeight) + topChrome;
    },

    isVisible: function(component) {
        return component && component.hidden !== true && (!component.isVisible || component.isVisible());
    },

    getOuterHeight: function(componentOrElement) {
        const element = componentOrElement && componentOrElement.el ? componentOrElement.el : componentOrElement;
        const dom = element && element.dom;

        if (!dom) {
            return 0;
        }

        const rect = dom.getBoundingClientRect();
        const styles = window.getComputedStyle ? window.getComputedStyle(dom) : null;
        const marginTop = styles ? parseFloat(styles.marginTop) || 0 : 0;
        const marginBottom = styles ? parseFloat(styles.marginBottom) || 0 : 0;
        const scrollHeight = dom.scrollHeight || 0;

        return Math.max(rect.height, scrollHeight) + marginTop + marginBottom;
    },

    getVerticalChrome: function(componentOrElement) {
        const element = componentOrElement && componentOrElement.el ? componentOrElement.el : componentOrElement;
        const dom = element && element.dom;

        if (!dom || !window.getComputedStyle) {
            return 0;
        }

        const styles = window.getComputedStyle(dom);

        return [
            styles.paddingTop,
            styles.paddingBottom,
            styles.borderTopWidth,
            styles.borderBottomWidth,
            styles.marginTop,
            styles.marginBottom
        ].reduce(function(total, value) {
            return total + (parseFloat(value) || 0);
        }, 0);
    }
});
