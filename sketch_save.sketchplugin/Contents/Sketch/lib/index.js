function _(str) {
    return str
}

function pathJoin() {
    return toJSString(NSString.pathWithComponents([].slice.call(arguments)));
}

function quoteStr(str) {
    return '\'' + str + '\'';
}

function run(cmd) {
    var task = NSTask.alloc().init();
    task.setLaunchPath('/bin/bash');
    task.setArguments(['-c', cmd]);
    task.launch();
    task.waitUntilExit();
    return task.terminationStatus() == 0;
}

function is(layer, theClass) {
    if(!layer) return false;
    var klass = layer.class();
    return klass == theClass;
}

function toJSString(str) {
    return new String(str).toString();
}

function toJSNumber(str) {
    return Number(toJSString(str));
}

function pointToJSON(point) {
    return {
        x: parseFloat(point.x),
        y: parseFloat(point.y)
    };
}

function rectToJSON(rect, referenceRect) {
    if (referenceRect) {
        return {
            x: Math.round((rect.x() - referenceRect.x()) * 10) / 10,
            y: Math.round((rect.y() - referenceRect.y()) * 10) / 10,
            width: Math.round(rect.width() * 10) / 10,
            height: Math.round(rect.height() * 10) / 10
        };
    }

    return {
        x: Math.round(rect.x() * 10) / 10,
        y: Math.round(rect.y() * 10) / 10,
        width: Math.round(rect.width() * 10) / 10,
        height: Math.round(rect.height() * 10) / 10
    };
}

var SS = (function() {
    function SS(context) {
        this.prefs = NSUserDefaults.standardUserDefaults();
        this.context = context;
        this.document = context.document;
        this.documentData = this.document.documentData();
        this.UIMetadata = context.document.mutableUIMetadata();
        this.window = this.document.window();
        this.pages = this.document.pages();
        this.page = this.document.currentPage();
        this.extend(context);
    }

    var fn = SS.prototype;

    fn.extend = function(options, target) {
        var target = target || this;

        for (var key in options) {
            target[key] = options[key];
        }
        return target;
    };

    fn.getSavePath = function() {
        var fileName = this.document.displayName().stringByDeletingPathExtension();
        var savePanel = NSSavePanel.savePanel();

        savePanel.setTitle(_('Save File'));
        savePanel.setNameFieldLabel(_('Save to:'));
        savePanel.setPrompt(_('Save'));
        savePanel.setCanCreateDirectories(true);
        savePanel.setNameFieldStringValue(fileName);

        if (savePanel.runModal() != NSOKButton) {
            return false;
        }

        return savePanel.URL().path();
    };

    fn.getFilePath = function() {
        var filePath = this.document.fileURL() ? this.document.fileURL().path().stringByDeletingLastPathComponent() : '~';
        var fileName = fileName = this.document.displayName().stringByDeletingPathExtension();
        return filePath + '/' + fileName + '.sketch';
    };

    fn.message = function(message) {
        this.document.showMessage(message);
    };

    fn.writeFile = function(options) {
        options = this.extend(options, {
            content: 'Type something!',
            path: toJSString(NSTemporaryDirectory()),
            fileName: 'temp.txt'
        });
        var content = NSString.stringWithString(options.content),
            savePathName = [];

        NSFileManager
            .defaultManager()
            .createDirectoryAtPath_withIntermediateDirectories_attributes_error(options.path, true, nil, nil);

        savePathName.push(
            options.path,
            '/',
            options.fileName
        );
        savePathName = savePathName.join('');

        content.writeToFile_atomically_encoding_error(savePathName, false, 4, null);
    };

    fn.exportImage = function(options) {
        options = this.extend(options, {
            layer: void 0,
            path: toJSString(NSTemporaryDirectory()),
            scale: 1,
            name: 'preview',
            prefix: '',
            suffix: '',
            format: 'png'
        });
        var document = this.document,
            slice = MSExportRequest.exportRequestsFromExportableLayer(options.layer).firstObject(),
            savePathName = [];

        slice.scale = options.scale;
        slice.format = options.format;

        savePathName.push(
            options.path,
            '/',
            options.prefix,
            options.name,
            options.suffix,
            '.',
            options.format
        );
        savePathName = savePathName.join('');

        document.saveArtboardOrSlice_toFile(slice, savePathName);

        return savePathName;
    };

    fn.export = function() {
        var savePath = this.getSavePath();
        if (savePath) {
            this._save(savePath);
        } else {
            this.message('Please select a save path');
        }
    };

    fn.save = function() {
        this._save();
    };

    fn._save = function(savePath) {
        var filePath = this.getFilePath();
        if (!savePath) {
            savePath = filePath;
        }
        if (savePath.split('.').slice(-1)[0] !== 'sketch') {
            savePath += '.sketch';
        }
        var tmpDir = toJSString(NSTemporaryDirectory()) + toJSString(NSUUID.UUID());
        var unzipDir = pathJoin(tmpDir, 'unzip');
        var previewPath = pathJoin(unzipDir, '/previews/preview.png');
        var layer = this.getDummyLayer();
        var imgPath = this.exportImage({
            layer: layer,
            scale: 2
        });
        layer.parentGroup().removeLayer(layer);

        var res = run([
            'rm', '-rf', tmpDir,
            '&&', 'mkdir', '-p', unzipDir,
            '&&', 'unzip', quoteStr(filePath), '-d', unzipDir,
            '&&', 'mv', imgPath, previewPath,
            '&&', 'cd', unzipDir,
            '&&', 'zip', '-r', quoteStr(savePath), '.',
            '&&', 'rm', '-rf', tmpDir
        ].join(' '));

        if (res) {
            this.message('Saved to ' + savePath);
        } else {
            this.message('Save failed!')
        }
    };

    fn.makeSavable = function(optionKey) {
        if (this.selection.count() <= 0) {
            this.message(_('Select a layer to add exportable!'));
            return false;
        }

        for (var i = 0; i < this.selection.count(); i++) {
            var layer = this.selection[i],
                slice = layer;

            if (!optionKey && !this.is(layer, MSSliceLayer)) {
                slice = MSSliceLayer.sliceLayerFromLayer(layer);

                var msRect = MSRect.rectWithUnionOfRects([
                    MSRect.alloc().initWithRect(slice.absoluteRect().rect()),
                    MSRect.alloc().initWithRect(layer.absoluteRect().rect())
                ]);

                slice.absoluteRect().setRect(msRect.rect());

                if (this.is(layer, MSLayerGroup)) {
                    slice.moveToLayer_beforeLayer(layer, layer.firstLayer());
                    slice.exportOptions().setLayerOptions(2);
                }
            }

            slice.exportOptions().removeAllExportFormats();

            var size = slice.exportOptions().addExportFormat();
            size.setName('');
            size.setScale(1);

            if (optionKey || this.is(layer, MSSliceLayer)) {
                layer.setIsSelected(0);
                layer.setIsSelected(1);
            } else if(sliceCopy){
                slice.setIsSelected(1);
            }
        }
    };

    fn.getDummyLayer = function() {
        var minX = minY = maxX = maxY = 0
        var layers = this.context.document.currentPage().layers()
        layers.forEach(function(layer) {
            var r = layer.rect()
            minX = Math.min(r.origin.x, minX)
            minY = Math.min(r.origin.y, minY)
            maxX = Math.max(r.origin.x + r.size.width, maxX)
            maxY = Math.max(r.origin.y + r.size.height, maxY)
        })

        var newArtboard = MSArtboardGroup.new()
        newArtboard.setName('dummy')
        var artboardFrame = newArtboard.frame()
        artboardFrame.setX(minX)
        artboardFrame.setY(minY)
        artboardFrame.setWidth(maxX - minX)
        artboardFrame.setHeight(maxY - minY)
        this.context.document.currentPage().addLayers([newArtboard])
        return newArtboard
    }

    return SS;
}());
