// TextViewer.js
Ext.define('FileManagement.components.viewers.TextViewer', {
    extend: 'Ext.panel.Panel',
    xtype: 'textviewer',

    config: {
        src: null,
        fileId: null,
        isShared: false,
        permission: null
    },

    title: 'Text Viewer',
    layout: 'fit',
    closable: true,
    frame: true,
    modal: true,

    width: 600, // Set a fixed width
    height: 400, // Set a fixed height
    x: 220,
    y: 220,

    style: {
        zIndex: ++window.highestZIndex,
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
        constrain: true, // Enable constraint within a specified element
        dynamic: true, // Updates size dynamically as resizing
        minHeight: 300,
        minWidth: 450,
    },

    header: {
        listeners: {
            dblclick: function (header) {
                const panel = header.up('panel');
                FileManagement.components.utils.PanelUtils.toggleMaximize(panel);
            }
        }
    },

    tools: [
        {
            type: 'minimize',
            tooltip: 'Minimize to toolbar',
            handler: function () {
                FileManagement.components.utils.PanelUtils.minimizeToTaskbar(this.up('panel'));
            }
        },
        {
            type: 'maximize',
            itemId: 'maximizeTool',
            handler: function () {
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
            text: 'Beautify JSON',
            iconCls: 'fa fa-indent',
            handler: function (btn) {
                const viewer = btn.up('textviewer');
                viewer.beautifyJsonContent();
            }
        }
    ],

    listeners: {
        afterrender: function (panel) {
            // Ensure absolute positioning for free dragging
            const el = panel.getEl();
            if (el) {
                el.setStyle('z-index', ++window.highestZIndex); // Set a base z-index
            }
        }
    },

    initComponent: function () {
        const isShared = this.getIsShared && this.getIsShared();

        // Define items with the htmleditor for text editing
        this.items = [{
            xtype: 'htmleditor',
            enableFont: true, // Keep plain text editing
            enableSourceEdit: true, // Allow toggling between HTML source and view
            enableColors: true,
            enableAlignments: true,
            value: 'Loading...', // Temporary placeholder text
            style: 'width: 100%; height: 100%;',
            margin: '10',
            listeners: {
                afterrender: function(editor) {
                    if (isShared && editor.setReadOnly) {
                        editor.setReadOnly(true);
                    }
                }
            }
        }];

        // Add Save and Cancel buttons to the bottom toolbar
        this.bbar = [
            '->', // Align buttons to the right
            {
                xtype: 'tbtext',
                text: 'Shared file: read only',
                hidden: !isShared
            },
            {
                text: 'Save',
                iconCls: 'fa fa-save',
                hidden: isShared,
                disabled: isShared,
                handler: this.saveTextContent.bind(this)
            },
            {
                text: 'Cancel',
                iconCls: 'fa fa-ban',
                handler: () => {
                    const parent = this.up();
                    if (parent) {
                        parent.remove(this); // Remove the panel from the parent container
                    }
                }
            }
        ];

        this.callParent(arguments);

        // Fetch the text content after the component is initialized
        this.loadTextContent();
    },

    loadTextContent: async function () {
        const token = FileManagement.helpers.Functions.getToken();
        const fileUrl = this.getSrc();

        try {
            const response = await fetch(fileUrl, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('Failed to load text file');

            const textContent = await response.text();

            // Update the editor with the fetched content
            const htmlEditor = this.down('htmleditor');
            if (htmlEditor) {
                htmlEditor.setValue(textContent);
            }
        } catch (error) {
            FileManagement.components.utils.NotificationUtil.showError('Failed to load the text file: ' + error.message, 'Load Error');
        }
    },

    saveTextContent: async function () {
        const token = FileManagement.helpers.Functions.getToken();
        const fileId = this.getFileId();

        if (this.getIsShared && this.getIsShared()) {
            FileManagement.components.utils.NotificationUtil.showError('Shared text files can only be edited by the owner.', 'Read Only');
            return;
        }

        if (!fileId) {
            FileManagement.components.utils.NotificationUtil.showError('Missing file identifier.', 'Save Error');
            return;
        }

        // Get the updated content from the editor
        const htmlEditor = this.down('htmleditor');
        const updatedContent = htmlEditor ? htmlEditor.getValue() : '';

        try {
            const response = await fetch(FileManagementEnv.apiUrl(`/api/files/content/${fileId}`), {
                method: 'PUT', // Use PUT or POST depending on your API
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: updatedContent
                })
            });

            if (!response.ok) throw new Error('Failed to save text file');

            FileManagement.components.utils.NotificationUtil.showSuccess('File saved successfully!', 'Save Complete');
        } catch (error) {
            FileManagement.components.utils.NotificationUtil.showError('Failed to save the text file: ' + error.message, 'Save Error');
        }
    },

    beautifyJsonContent: function () {
        const htmlEditor = this.down('htmleditor');
        const content = htmlEditor ? htmlEditor.getValue() : '';

        try {
            const json = JSON.parse(content);
            const beautifiedJson = JSON.stringify(json, null, 4); // Pretty print JSON
            htmlEditor.setValue(beautifiedJson);
            FileManagement.components.utils.NotificationUtil.showSuccess('JSON content has been beautified.', 'Beautify Success');
        } catch (error) {
            FileManagement.components.utils.NotificationUtil.showError('Invalid JSON: ' + error.message, 'Beautify Error');
        }
    }
});
