// ViewerFactory.js
Ext.define('FileManagement.components.viewers.ViewerFactory', {
    singleton: true,

    requires: [
        'FileManagement.components.viewers.AudioViewer',
        'FileManagement.components.viewers.HtmlViewer',
        'FileManagement.components.utils.PanelUtils'
    ],

    createViewer: function(record) {
        const fileType = record.get('mimetype') || record.get('type') || '';
        const fileId = record.get('id');
        const fileName = record.get('name');
        const isShared = !!record.get('isShared');
        const permission = record.get('permission');
        const mainPanel = Ext.getCmp('mainPanelRegion');

        let viewer;

        if (fileType.startsWith('audio/')) {
            viewer = Ext.ComponentQuery.query('audioviewer')[0];

            if (viewer && !viewer.destroyed) {
                viewer.loadTrack({
                    fileId,
                    fileName,
                    mimeType: fileType,
                    autoPlay: true
                });
                FileManagement.components.utils.PanelUtils.restoreFromTaskbar(viewer);
                return viewer;
            }

            viewer = Ext.create('FileManagement.components.viewers.AudioViewer', {
                title: `Audio Player: ${fileName}`,
                fileId,
                fileName,
                mimeType: fileType,
                autoPlay: true
            });
        } else if (fileType.startsWith('image/')) {
            const fileUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
            viewer = Ext.create('FileManagement.components.viewers.ImageViewer', {
                src: fileUrl,
                title: `Image: ${fileName}`,
                fileId,
                isShared,
                permission
            });
        } else if (fileType === 'application/pdf') {
            const fileUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
            viewer = Ext.create('FileManagement.components.viewers.PDFViewer', {
                src: fileUrl,
                title: `PDF: ${fileName}`
            });
        } else if (fileType === 'text/html' || fileType === 'application/xhtml+xml') {
            const fileUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
            viewer = Ext.create('FileManagement.components.viewers.HtmlViewer', {
                src: fileUrl,
                title: `HTML Preview: ${fileName}`,
                fileName
            });
        } else if (fileType.startsWith('application/vnd') || fileType.includes('msword')) {
            const fileUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
            viewer = Ext.create('FileManagement.components.viewers.OfficeDocumentViewer', {
                src: fileUrl,
                title: `Office Document Viewer: ${fileName}`
            });
        } else if (['text/plain', 'application/json'].includes(fileType)) {
            const fileUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
            viewer = Ext.create('FileManagement.components.viewers.TextViewer', {
                src: fileUrl,
                fileId,
                title: `Text Viewer: ${fileName}`,
                isShared,
                permission
            });
        } else if (fileType === 'application/zip') {
            const fileUrl = FileManagementEnv.apiUrl(`/api/files/view/${fileId}`);
            viewer = Ext.create('FileManagement.components.viewers.ZipViewer', {
                src: fileUrl,
                fileName: fileName,
                filePath: record.get('path'),
                title: `Zip File Contents: ${fileName}`,
                isShared,
                permission
            });
        } else if (fileType.startsWith('video/')) {
            viewer = Ext.create('FileManagement.components.viewers.VideoViewer', {
                title: `Video Viewer: ${fileName}`,
                fileId,
                autoPlay: false
            });
        } else {
            Ext.Msg.alert('Unsupported File Type', 'The selected file type is not supported for viewing.');
            return;
        }

        this.prepareUploadedItemViewer(viewer);

        viewer.show = function () {
            if (!viewer.ownerCt) {
                mainPanel.add(viewer); // Add the viewer panel to the main region
            } else if (viewer.hidden && Ext.isFunction(Ext.panel.Panel.prototype.show)) {
                Ext.panel.Panel.prototype.show.call(viewer);
            }

            FileManagement.components.utils.PanelUtils.prepareWorkspacePanel(viewer);
            FileManagement.components.viewers.ViewerFactory.applyDefaultViewerSize(viewer);
            FileManagement.components.utils.PanelUtils.activateWorkspacePanel(viewer);
            FileManagement.components.utils.PanelUtils.updateNavigationPanelList();
        };

        return viewer;
    },

    prepareUploadedItemViewer: function(viewer) {
        if (!viewer) {
            return;
        }

        viewer.fileManagementUploadedItemViewer = true;
        viewer.preventWorkspaceResponsiveFit = true;

        if (!viewer.resizable || viewer.resizable === true) {
            viewer.resizable = {
                constrain: true,
                dynamic: true
            };
        } else if (Ext.isObject(viewer.resizable)) {
            viewer.resizable.constrain = viewer.resizable.constrain !== false;
            viewer.resizable.dynamic = viewer.resizable.dynamic !== false;
        }
    },

    getMainViewSize: function() {
        const mainPanel = Ext.getCmp('mainPanelRegion');
        const fallback = {
            width: Ext.Element.getViewportWidth(),
            height: Ext.Element.getViewportHeight()
        };

        if (!mainPanel) {
            return fallback;
        }

        const size = mainPanel.getSize ? mainPanel.getSize() : null;
        if (size && size.width && size.height) {
            return size;
        }

        const box = mainPanel.getBox ? mainPanel.getBox() : null;
        if (box && box.width && box.height) {
            return box;
        }

        return fallback;
    },

    getPreferredViewerSize: function(viewer, options = {}) {
        const configuredWidth = Number(options.preferredWidth) ||
            Number(viewer.width) ||
            (viewer.initialConfig ? Number(viewer.initialConfig.width) : 0) ||
            (viewer.getWidth ? Number(viewer.getWidth()) : 0);
        const configuredHeight = Number(options.preferredHeight) ||
            Number(viewer.height) ||
            (viewer.initialConfig ? Number(viewer.initialConfig.height) : 0) ||
            (viewer.getHeight ? Number(viewer.getHeight()) : 0);
        const mainViewSize = this.getMainViewSize();
        const maxWidth = Math.max(1, Math.floor(mainViewSize.width * 0.5));
        const maxHeight = Math.max(1, Math.floor(mainViewSize.height * 0.5));

        return {
            width: Math.min(configuredWidth || maxWidth, maxWidth),
            height: Math.min(configuredHeight || maxHeight, maxHeight)
        };
    },

    relaxViewerMinimumSize: function(viewer, width, height) {
        const minWidth = Math.min(Number(viewer.minWidth) || width, width);
        const minHeight = Math.min(Number(viewer.minHeight) || height, height);

        viewer.minWidth = minWidth;
        viewer.minHeight = minHeight;

        if (viewer.setMinWidth) {
            viewer.setMinWidth(minWidth);
        }

        if (viewer.setMinHeight) {
            viewer.setMinHeight(minHeight);
        }

        if (viewer.resizable && Ext.isObject(viewer.resizable)) {
            viewer.resizable.minWidth = Math.min(Number(viewer.resizable.minWidth) || minWidth, minWidth);
            viewer.resizable.minHeight = Math.min(Number(viewer.resizable.minHeight) || minHeight, minHeight);
        }

        if (viewer.resizer) {
            viewer.resizer.minWidth = Math.min(Number(viewer.resizer.minWidth) || minWidth, minWidth);
            viewer.resizer.minHeight = Math.min(Number(viewer.resizer.minHeight) || minHeight, minHeight);
        }
    },

    clampViewerPosition: function(viewer, width, height) {
        if (!viewer || !viewer.setPosition) {
            return;
        }

        const mainViewSize = this.getMainViewSize();
        const currentX = viewer.getX ? Number(viewer.getX()) : Number(viewer.x);
        const currentY = viewer.getY ? Number(viewer.getY()) : Number(viewer.y);
        const x = Math.max(0, Math.min(Number.isFinite(currentX) ? currentX : 0, Math.max(0, mainViewSize.width - width)));
        const y = Math.max(0, Math.min(Number.isFinite(currentY) ? currentY : 0, Math.max(0, mainViewSize.height - height)));

        viewer.setPosition(x, y);
    },

    applyDefaultViewerSize: function(viewer, options = {}) {
        if (!viewer || viewer.destroyed || viewer.destroying) {
            return;
        }

        if (viewer.fileManagementViewerDefaultSized && options.force !== true) {
            return;
        }

        const size = this.getPreferredViewerSize(viewer, options);
        this.relaxViewerMinimumSize(viewer, size.width, size.height);

        if (viewer.setSize) {
            viewer.setSize(size.width, size.height);
        } else {
            viewer.width = size.width;
            viewer.height = size.height;
        }

        this.clampViewerPosition(viewer, size.width, size.height);
        viewer.fileManagementViewerDefaultSized = true;
    }
});
