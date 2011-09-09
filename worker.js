/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var WorkerPage = (function() {
  function constructor(workerPDF, page) {
    this.workerPDF = workerPDF;
    this.page = page;
    
    this.ref = page.ref;
  }
  
  constructor.prototype = {
    get width() {
      return this.page.width;
    },
    
    get height() {
      return this.page.height;
    },
    
    get stats() {
      return this.page.stats;
    },
    
    startRendering: function(ctx, callback, errback)  {
      this.ctx = ctx;
      this.callback = callback;
      // TODO: Place the worker magic HERE.
      // this.page.startRendering(ctx, callback, errback);
      
      this.startRenderingTime = Date.now();
      this.workerPDF.startRendering(this)
    },
    
    startRenderingFromIRQueue: function(IRQueue, fonts) {
      var gfx = new CanvasGraphics(this.ctx);
      
      var startTime = Date.now();
      var callback = function(err) {
        var pageNum = this.page.pageNumber + 1;
        console.log("page=%d - rendering time: time=%dms", 
          pageNum, Date.now() - startTime);
        console.log("page=%d - total time: time=%dms", 
          pageNum, Date.now() - this.startRenderingTime);

        this.callback(err);
      }.bind(this);
      this.page.startRenderingFromIRQueue(gfx, IRQueue, fonts, callback);
    },
    
    getLinks: function() {
      return this.page.getLinks();
    }
  };
  
  return constructor;
})();

// This holds a list of objects the IR queue depends on.
var Objects = {
  resolve: function(objId, data) {
    // In case there is a promise already on this object, just resolve it.
    if (Objects[objId]) {
      Objects[objId].resolve(data);
    } else {
      Objects[objId] = new Promise(objId, data);
    }
  },

  get: function(objId) {
    var obj = Objects[objId];
    if (!obj || !obj.isResolved) {
      throw "Requesting object that isn't resolved yet";
    }
    return obj.data;
  }
};

var Promise = (function() {
  function Promise(name, data) {
    this.name = name;
    // If you build a promise and pass in some data it's already resolved.
    if (data != null) {
      this.isResolved = true;
      this.data = data;
    } else {
      this.isResolved = false;      
    }
    this.callbacks = [];
  };
  
  Promise.prototype = {
    resolve: function(data) {
      console.log("resolve", this.name);
      
      if (this.isResolved) {
        throw "A Promise can be resolved only once";
      }
      
      this.isResolved = true;
      this.data = data;
      var callbacks = this.callbacks;
      
      for (var i = 0; i < callbacks.length; i++) {
        callbacks[i].call(null, data);
      }
    },
    
    then: function(callback) {
      // If the promise is already resolved, call the callback directly.
      if (this.isResolved) {
        callback.call(null, this.data);
      } else {
        this.callbacks.push(callback);        
      }
    }
  }
  return Promise;
})();

var WorkerPDFDoc = (function() {
  function constructor(data) {
    this.data = data;
    this.stream = new Stream(data);
    this.pdf = new PDFDoc(this.stream);
    
    this.catalog = this.pdf.catalog;
    
    this.pageCache = [];
    
    var useWorker = true;
    
    if (useWorker) {
      var worker = new Worker("../worker/boot.js");      
    } else {
      // If we don't use a worker, just post/sendMessage to the main thread.
      var worker = {
        postMessage: function(obj) {
          worker.onmessage({data: obj});
        }
      }
    }

    var handler = this.handler = new MessageHandler("main", worker);
    handler.on("page", function(data) {
      var pageNum = data.pageNum;
      var page = this.pageCache[pageNum];
      

      page.startRenderingFromIRQueue(data.IRQueue, data.fonts);
    }, this);

    handler.on("obj", function(data) {
      var objId   = data[0];
      var objType = data[1];

      switch (objType) {
        case "JpegStream":
          var IR = data[2];
          new JpegStreamIR(objId, IR);
        break;
        case "Font":
          var name = data[2];
          var file = data[3];
          var properties = data[4];

          console.log("got new font", name);

          var font = {
            name: name,
            file: file,
            properties: properties
          };

          // Some fonts don't have a file, e.g. the build in ones like Arial.
          if (file) {
            var fontFileDict = new Dict();
            fontFileDict.map = file.dict.map;

            var fontFile = new Stream(file.bytes, file.start,
                                      file.end - file.start, fontFileDict);
                                 
            // Check if this is a FlateStream. Otherwise just use the created 
            // Stream one. This makes complex_ttf_font.pdf work.
            var cmf = file.bytes[0];
            if ((cmf & 0x0f) == 0x08) {
              font.file = new FlateStream(fontFile);
            } else {
              font.file = fontFile;
            }          
          }

          FontLoader.bind(
            [ font ],
            function(fontObjs) {
              var fontObj = fontObjs[0];
              Objects.resolve(objId, fontObj);
            }
          );
        break;
        default:
          throw "Got unkown object type " + objType;
      }
    }, this);
    
    if (!useWorker) {
      // If the main thread is our worker, setup the handling for the messages
      // the main thread sends to it self.
      WorkerHandler.setup(handler);
    }
    
    handler.send("doc", data);
  }

  constructor.prototype = {
    get numPages() {
      return this.pdf.numPages;
    },
    
    startRendering: function(page) {
      this.handler.send("page_request", page.page.pageNumber + 1);
    },
    
    getPage: function(n) {
      if (this.pageCache[n]) {
        return this.pageCache[n];
      }
      
      var page = this.pdf.getPage(n);
      return this.pageCache[n] = new WorkerPage(this, page);
    }
  };
  
  return constructor;
})();
