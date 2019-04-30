/* Javascript */
$(function () {
  $('.btn-copy')
    .mouseleave(function () {
      var $element = $(this);
      $element.tooltip('hide').tooltip('disable');
    })

  var clipboard = new Clipboard('.btn-copy');
  clipboard.on('success', function (e) {
    $(e.trigger)
      .attr('title', 'Copied')
      .tooltip('fixTitle')
      .tooltip('enable')
      .tooltip('show');
  })

  $('[data-toggle=tooltip]').tooltip({
    trigger: 'hover',
  });
})


window.app = new Vue({
  el: '#app',
  data: {
    deviceUdid: deviceUdid,
    device: {
      ip: deviceIp,
      port: 7912,
    },
    deviceInfo: {},
    deviceList: [],
    mainDeviceLocation: [0,0],
    deviceCfg: {
      'db03aca0':['pro2',1080,2160,2.5, 125,90,0.5, 0],
      'd749c6c':['xiaomi6x',1080,2160,3, 150,130,0.5, 0],
      'S2D7N19109005177':['Mate20 Pro',1080,2340,4,200,0,0.462, 0],
      '98899a48464e524f33':['S8',1440,2960,4,200,0,0.486, 0],
      '5df4b17d':['x23',1080,2340,3,150,130,0.462, 0]
    },
    deviceCfging:{},
    fixConsole: '', // log for fix minicap and rotation
    navtabs: {
      active: location.hash.slice(1) || 'home',
      tabs: [],
    },
    error: '',
    control: null,
    loading: false,
    canvas: {
      bg: null,
      fg: null,
    },
    canvasStyle: {
      opacity: 1,
      width: 'inherit',
      height: 'inherit'
    },
    lastScreenSize: {
      screen: {},
      canvas: {
        width: 1,
        height: 1
      }
    },
    screenWS: null,
    browserURL: "",
    logcat: {
      follow: true,
      tagColors: {},
      lineNumber: 0,
      maxKeep: 1500,
      cachedScrollTop: 0,
      logs: [{
        lineno: 1,
        tag: "EsService2",
        level: "W",
        content: "loaded /system/lib/egl/libEGL_adreno200.so",
      }]
    },
    imageBlobBuffer: [],
    videoUrl: '',
    videoReceiver: null, // sub function to receive image
    inputText: '',
    inputWS: null,
    isMultiphone: true,
  },
  watch: {},
  computed: {
    deviceUrl: function () {
      return "http://" + this.device.ip + ":" + this.device.port;
    }
  },
  mounted: function () {
    var URL = window.URL || window.webkitURL;
    var currentSize = null;
    var self = this;
    $.notify.defaults({ className: "success" });

    this.canvas.bg = document.getElementById('bgCanvas')
    this.canvas.fg = document.getElementById('fgCanvas')
    // this.canvas = c;
    window.c = this.canvas.bg;
    var ctx = c.getContext('2d')

    $(window).resize(function () {
      self.resizeScreen();
    })

    this.initDragDealer();

    // get device info
    $.ajax({
      url: this.deviceUrl + "/info", // "/devices/" + this.deviceUdid + "/info",
      dateType: "json"
    }).then(function (ret) {
      //console.log("device info",ret);
      this.deviceInfo = ret;
      document.title = ret.model;
    }.bind(this))

    function sleep(numberMillis) {
      var now = new Date();
      var exitTime = now.getTime() + numberMillis;
      while (true) {
        now = new Date();
        if (now.getTime() > exitTime)
        return;
          }
    }
    sleep(2000);    
    $.ajax({
      url: "/list",
    }).then(function (ret) {
      console.log("ret",ret);
      var data = [];
      ret.map((d) => {
        if((d.using == false && d.present == true && d.ready == true) ){
          //d.multi = (self.deviceCfg[d.serial][2]/self.deviceCfg[d.serial][3]) / (self.deviceCfg[self.deviceInfo.serial][2] / self.deviceCfg[self.deviceInfo.serial][3]);
          d.multi = (self.deviceCfg[self.deviceInfo.serial][2] / self.deviceCfg[self.deviceInfo.serial][3]) / (self.deviceCfg[d.serial][2] / self.deviceCfg[d.serial][3]);
          d.navBar = self.deviceCfg[d.serial][5];
          d.appBotBar = self.deviceCfg[d.serial][4];
          d.heightY = self.deviceCfg[d.serial][7];
          data.push(d);
          this.deviceList.push(d);
        }
      });
      //this.deviceList = data;
      console.log("this.deviceList",this.deviceList);
    }.bind(this))

    this.reserveDevice()
      .then(function () {
        console.log("reserveDevice ...");
        this.enableTouch();
        this.openScreenStream();
      }.bind(this))

    // wakeup device on connect
    setTimeout(function () {
      this.keyevent("WAKEUP");
    }.bind(this), 1)

    window.k = setTimeout(function () {
      var lineno = (this.logcat.lineNumber += 1);
      this.logcat.logs.push({
        lineno: lineno,
        tag: "EsService2",
        level: "W",
        content: "loaded /system/lib/egl/libEGL_adreno200.so",
      });
      if (this.logcat.follow) {
        // only keep maxKeep lines
        var maxKeep = Math.max(20, this.logcat.maxKeep);
        var size = this.logcat.logs.length;
        this.logcat.logs = this.logcat.logs.slice(size - maxKeep, size);

        // scroll to end
        var el = this.$refs.tab_content;
        var logcat = this.logcat;
        if (el.scrollTop < logcat.cachedScrollTop) {
          this.logcat.follow = false;
        } else {
          setTimeout(function () {
            logcat.cachedScrollTop = el.scrollTop = el.scrollHeight - el.clientHeight;
          }, 2);
        }
      }
    }.bind(this), 200)

    this.inputWS = new WebSocket("ws://" + this.device.ip + ":" + this.device.port + "/whatsinput");
    this.inputWS.onmessage = function (message) {
      // console.log(message)
      var data = JSON.parse(message.data)
      if (data.type == "InputStart") {
        this.inputText = data.text;
      } else {
        console.log(data)
      }
    }.bind(this);

  },
  watch: {
    inputText: function (newText) {
      console.log(newText);
      this.inputWS.send(JSON.stringify({ type: "InputEdit", text: newText }))
    }
  },
  methods: {
    reserveDevice: function () {
      var dtd = $.Deferred();
      var ws = new WebSocket("ws://" + location.host + "/devices/" + this.deviceUdid + "/reserved")
      ws.onmessage = function (message) {
        console.log("WebSocket receive", message)
      }
      var key = setInterval(function () {
        ws.send("ping")
      }, 5000);
      ws.onopen = function () {
        dtd.resolve();
      }
      ws.onerror = function (err) {
        console.log("WebSocket Error " + err)
      }
      ws.onclose = function () {
        dtd.reject();
        clearInterval(key);
        console.log("websocket reserved closed");
      }
      return dtd.promise();
    },
    connectImage2VideoWebSocket: function (fps) {
      var protocol = location.protocol == "http:" ? "ws:" : "wss:";
      var wsURL = protocol + location.host + "/video/convert"
      var wsQueries = encodeURI("fps=" + fps) + "&" + encodeURI("udid=" + this.deviceUdid) + "&" + encodeURI("name=" + this.deviceInfo.model)
      var ws = new WebSocket(wsURL + "?" + wsQueries)
      var def = $.Deferred()
      ws.onopen = function () {
        def.resolve(this)
      }
      ws.onclose = function (ev) {
        def.reject("Somehow ws disconnected")
      }
      return def.promise();
    },
    startLowQualityScreenRecord: function (event) {
      $(event.target).notify("初始化中 ...");
      this.connectImage2VideoWebSocket(2)
        .done(function (ws) {
          $(event.target).notify("视频录制中, 再次点击停止");
          var key = setInterval(function () {
            $.ajax({
              url: this.deviceUrl + "/screenshot/0?thumbnail=800x800",
              method: "get",
              processData: false,
              cache: false,
              xhr: function () {
                var xhr = new XMLHttpRequest();
                xhr.responseType = "blob"
                return xhr;
              },
              success: function (data) {
                ws.send(data)
                console.log("screenshot")
              }
            })
          }.bind(this), 1000)
          this.videoReceiver = {
            ws: ws,
            key: key,
          }
        }.bind(this))
        .fail(function (err) {
          $(event.target).notify("录制启动失败, 请点击【关于我们】，联系网站管理员", "error");
        })
    },
    startVideoRecord: function (event) {
      $(event.target).notify("初始化中 ...");
      this.connectImage2VideoWebSocket(10)
        .done(function (ws) {
          $(event.target).notify("视频录制中, 再次点击停止");
          var cache = {}
          function receiver(_, data) {
            cache.last = data;
          }
          var key = setInterval(function () {
            var lastData = cache.last;
            cache.last = null;
            if (lastData) {
              ws.send(lastData)
            }
          }, 1000 / 6) // fps: 6
          receiver.ws = ws;
          receiver.key = key;

          $.subscribe('imagedata', receiver)
          this.videoReceiver = receiver;
        }.bind(this))
        .fail(function (err) {
          $(event.target).notify("录制启动失败, 请点击【关于我们】，联系网站管理员", "error");
        })
    },
    stopVideoRecord: function () {
      if (this.videoReceiver) {
        $.unsubscribe("imagedata", this.videoReceiver);
        this.videoReceiver.ws.close()
        clearInterval(this.videoReceiver.key);
        this.videoReceiver = null;
        $(event.target).notify("视频录制成功");
      }
    },
    toggleScreen: function () {
      if (this.screenWS) {
        this.screenWS.close();
        this.canvasStyle.opacity = 0;
        this.screenWS = null;
      } else {
        this.openScreenStream();
        this.canvasStyle.opacity = 1;
      }
    },
    saveShortVideo: function (event) {
      var fd = new FormData();
      this.imageBlobBuffer.forEach(function (blob) {
        fd.append('file', blob);
      });
      $(event.target).notify("视频后台合成中，请稍候 ...");
      console.log("upload")
      $.ajax({
        type: "post",
        url: "http://10.246.46.160:7000/img2video", // TODO: 临时地址，需要后期更换
        processData: false,
        contentType: false,
        data: fd,
        dateType: 'json',
      }).done(function (data) {
        console.log(data.url);
        this.videoUrl = data.url;
        $(event.target).notify("合成完毕");
      }.bind(this))
    },
    saveScreenshot: function () {
      $.ajax({
        url: this.deviceUrl + "/screenshot",
        cache: false,
        xhrFields: {
          responseType: 'image/png'
        },
      }).then(function (blob) {
        alert(typeof blob)
        // saveAs(blob, "screenshot33.jpg") // saveAs require FileSaver.js
      })
    },
    openBrowser: function (url) {
      if (!/^https?:\/\//.test(url)) {
        url = "http://" + url;
      }
      return this.shell("am start -a android.intent.action.VIEW -d " + url);
    },
    uploadFile: function (event) {
      var formData = new FormData(event.target);
      $(event.target).notify("Uploading ...");
      $.ajax({
        method: "post",
        url: this.deviceUrl + "/upload/sdcard/tmp/",
        data: formData,
        processData: false,
        contentType: false,
        enctype: 'multipart/form-data',
      })
        .then(function (ret) {
          $(event.target).notify("Upload success");
        }, function (err) {
          $(event.target).notify("Upload failed:" + err.responseText, "error")
          console.error(err)
        })
    },
    addTabItem: function (item) {
      this.navtabs.tabs.push(item);
    },
    changeTab: function (tabId) {
      location.hash = tabId;
    },
    fixRotation: function () {
      $.ajax({
        url: this.deviceUrl + "/info/rotation",
        method: "post",
      }).then(function (ret) {
        console.log("rotation fixed")
      })
    },
    fixMinicap: function () {
      this.fixConsole = "remove old minicap";
      $.ajax({
        method: "post",
        url: this.deviceUrl + "/shell",
        data: {
          command: "rm -f /data/local/tmp/minicap /data/local/tmp/minicap.so"
        }
      })
        .then(function () {
          this.fixConsole = "download mincap to device ..."
          console.log("download mincap to device ...");
          return $.ajax({
            url: this.deviceUrl + "/minicap",
            method: "put",
          })
        }.bind(this))
        .then(function () {
          this.fixConsole = "minicap fixed"
          console.log("minicap fixed");
        }.bind(this), function () {
          console.log("minicap can not be fixed, open Browser Console for more detail ...");
          this.fixConsole = "minicap can not be fixed, open Browser Console for more detail"
        }.bind(this))
    },

    fixMinitouch: function () {
      this.fixConsole = "remove old minitouch";
      $.ajax({
        method: "post",
        url: this.deviceUrl + "/shell",
        data: {
          command: "rm -f /data/local/tmp/minitouch"
        }
      })
        .then(function () {
          this.fixConsole = "download minitouch to device ..."
          console.log("download minitouch to device ...");
          return $.ajax({
            url: this.deviceUrl + "/minitouch",
            method: "put",
          })
        }.bind(this))
        .then(function () {
          this.fixConsole = "minitouch fixed"
          console.log("minitouch fixed");
        }.bind(this), function () {
          console.log("minitouch can not be fixed, open Browser Console for more detail ...");
          this.fixConsole = "minitouch can not be fixed, open Browser Console for more detail"
        }.bind(this))
    },

    startApp: function () {
      console.log('start app ...');
      var self = this;
      if(self.isMultiphone == true) {
        console.log("startApp isMultiphone",self.deviceList.length);
        console.log(this.deviceUrl)
        for(var i = 0; i < self.deviceList.length; i++){
          $.ajax({
            url: "http://" + self.deviceList[i].ip + ":7912" + "/shell",
            data: {
              command: "am start -n com.wuba/.activity.launch.LaunchActivity"
            }
          }).then(function (ret) {
            console.log("start app end")
          })
        }

      }else {
        $.ajax({
          url: this.deviceUrl + "/shell",
          data: {
            command: "am start -n com.wuba/.activity.launch.LaunchActivity"
          }
        }).then(function (ret) {
          console.log("start app end")
        })
      }
/*
      $.ajax({
        url: this.deviceUrl + "/shell",
        data: {
          command: "am start -n com.wuba/.activity.launch.LaunchActivity"
        }
      }).then(function (ret) {
        console.log("start app end")
      })
      */
      
    },

    fixUiautomator: function () {
      console.log('fixUiautomator...');
      var self = this;
      if(self.isMultiphone == true) {
        console.log("fixUiautomator isMultiphone",self.deviceList.length);
        for(var i = 0; i < self.deviceList.length; i++){
          console.log(self.deviceList[i].ip)
          $.ajax({
            url: "http://" + self.deviceList[i].ip + ":7912" + "/uiautomator",
            method: "POST",
            success: function (ret) {
              console.log(ret);
            },
            error: function (ret) {
              console.log(ret)
            }
          }).then(function (ret) {
            console.log("ret")
          })
        }

      }else {
        $.ajax({
          url: this.deviceUrl + "/uiautomator",
          method: "POST",
        }).then(function (ret) {
          console.log("ret")
        })
      }
    },

    startMonitor: function () {
      console.log('startMonitor ...');
    },

    startTesting: function () {
      console.log('startTesting ...');
    },

    endTesting: function () {
      console.log('endTesting ...');
    },

    tabScroll: function (ev) {
      // var el = ev.target;
      // var el = this.$refs.tab_content;
      // var bottom = (el.scrollTop == (el.scrollHeight - el.clientHeight));
      // console.log("Bottom", bottom, el.scrollTop, el.scrollHeight, el.clientHeight, el.scrollHeight - el.clientHeight)
      // console.log(ev.target.scrollTop, ev.target.scrollHeight, ev.target.clientHeight);
      this.logcat.follow = false;
    },
    followLog: function () {
      this.logcat.follow = !this.logcat.follow;
      if (this.logcat.follow) {
        var el = this.$refs.tab_content;
        el.scrollTop = el.scrollHeight - el.clientHeight;
      }
    },
    logcatTag2Color: function (tag) {
      var color = this.logcat.tagColors[tag];
      if (!color) {
        color = this.logcat.tagColors[tag] = getRandomRgb(5);
      }
      return color;
    },
    logcatLevel2Color: function (level) {
      switch (level) {
        case "W":
          return "goldenrod";
        case "I":
          return "darkgreen";
        case "D":
          return "gray";
        default:
          return "gray";
      }
    },
    hold: function (msecs) {
      this.control.touchDown(0, 0.5, 0.5, 5, 0.5)
      this.control.touchCommit();
      this.control.touchWait(msecs);
      this.control.touchUp(0)
      this.control.touchCommit();
    },
    keyevent: function (meta) {
      console.log("keyevent", meta)
      return this.shell("input keyevent " + meta.toUpperCase());
    },
    shell: function (command) {
      console.log("command",command)

      var self = this;
      if(self.isMultiphone == true) {
        console.log("shell isMultiphone",self.deviceList.length);
        for(var i = 0; i < self.deviceList.length; i++){
          $.ajax({
            url: "http://" + self.deviceList[i].ip + ":7912" + "/shell",
            method: "post",
            data: {
              command: command,
            },
            success: function (ret) {
              console.log(ret);
            },
            error: function (ret) {
              console.log(ret)
            }
          }).then(function (ret) {
            console.log("run shell end")
          })
        }

      }else {
        $.ajax({
          url: this.deviceUrl + "/shell",
          method: "post",
          data: {
            command: command,
          },
          success: function (ret) {
            console.log(ret);
          },
          error: function (ret) {
            console.log(ret)
          }
        }).then(function (ret) {
          console.log("run shell end")
        })
      }

      return ;
      /*$.ajax({
        url: this.deviceUrl + "/shell",
        method: "post",
        data: {
          command: command,
        },
        success: function (ret) {
          console.log(ret);
        },
        error: function (ret) {
          console.log(ret)
        }
      })
      */
    },
    showError: function (error) {
      this.loading = false;
      this.error = error;
      $('.modal').modal('show');
    },
    showAjaxError: function (ret) {
      if (ret.responseJSON && ret.responseJSON.description) {
        this.showError(ret.responseJSON.description);
      } else {
        this.showError("<p>Local server not started, start with</p><pre>$ python -m weditor</pre>");
      }
    },
    initDragDealer: function () {
      var self = this;
      var updateFunc = null;
      console.log("keyeinitDragDealervent")
      function dragMoveListener(evt) {
        evt.preventDefault();
        updateFunc(evt);
        self.resizeScreen();
      }

      function dragStopListener(evt) {
        console.log("dragStopListener")
        document.removeEventListener('mousemove', dragMoveListener);
        document.removeEventListener('mouseup', dragStopListener);
        document.removeEventListener('mouseleave', dragStopListener);
      }

      $('#vertical-gap1').mousedown(function (e) {
        console.log("mousedown")
        e.preventDefault();
        updateFunc = function (evt) {
          $("#left").width(evt.clientX);
        }
        document.addEventListener('mousemove', dragMoveListener);
        document.addEventListener('mouseup', dragStopListener);
        document.addEventListener('mouseleave', dragStopListener)
      });
    },
    resizeScreen: function (img) {
      // check if need update
      if (img) {
        if (this.lastScreenSize.canvas.width == img.width &&
          this.lastScreenSize.canvas.height == img.height) {
          return;
        }
      } else {
        img = this.lastScreenSize.canvas;
        if (!img) {
          return;
        }
      }
      var screenDiv = document.getElementById('screen');
      this.lastScreenSize = {
        canvas: {
          width: img.width,
          height: img.height
        },
        screen: {
          width: screenDiv.clientWidth,
          height: screenDiv.clientHeight,
        }
      }

      var canvasAspect = img.width / img.height;
      var screenAspect = screenDiv.clientWidth / screenDiv.clientHeight;
      if (canvasAspect > screenAspect) {
        Object.assign(this.canvasStyle, {
          width: Math.floor(screenDiv.clientWidth) + 'px', //'100%',
          height: Math.floor(screenDiv.clientWidth / canvasAspect) + 'px', // 'inherit',
        })
      } else if (canvasAspect < screenAspect) {
        Object.assign(this.canvasStyle, {
          width: Math.floor(screenDiv.clientHeight * canvasAspect) + 'px', //'inherit',
          height: Math.floor(screenDiv.clientHeight) + 'px', //'100%',
        })
      }
    },
    delayReload: function (msec) {
      setTimeout(this.screenDumpUI, msec || 1000);
    },
    drawBlobImageToScreen: function (blob) {
      // Support jQuery Promise
      var dtd = $.Deferred();
      var bgcanvas = this.canvas.bg,
        fgcanvas = this.canvas.fg,
        ctx = bgcanvas.getContext('2d'),
        self = this,
        URL = window.URL || window.webkitURL,
        BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
        img = this.imagePool.next();

      img.onload = function () {
        console.log("img.onload ")
        fgcanvas.width = bgcanvas.width = img.width
        fgcanvas.height = bgcanvas.height = img.height


        ctx.drawImage(img, 0, 0, img.width, img.height);
        self.resizeScreen(img);

        // Try to forcefully clean everything to get rid of memory
        // leaks. Note self despite this effort, Chrome will still
        // leak huge amounts of memory when the developer tools are
        // open, probably to save the resources for inspection. When
        // the developer tools are closed no memory is leaked.
        img.onload = img.onerror = null
        img.src = BLANK_IMG
        img = null
        blob = null

        URL.revokeObjectURL(url)
        url = null
        dtd.resolve();
      }

      img.onerror = function () {
        // Happily ignore. I suppose this shouldn't happen, but
        // sometimes it does, presumably when we're loading images
        // too quickly.

        // Do the same cleanup here as in onload.
        img.onload = img.onerror = null
        img.src = BLANK_IMG
        img = null
        blob = null

        URL.revokeObjectURL(url)
        url = null
        dtd.reject();
      }
      var url = URL.createObjectURL(blob)
      img.src = url;
      return dtd;
    },
    openScreenStream: function () {
      console.log("openScreenStream ...");
      var self = this;
      var BLANK_IMG =
        'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
      var protocol = location.protocol == "http:" ? "ws://" : "wss://"
      var ws = new WebSocket(this.deviceUrl.replace("http:", "ws:") + '/minicap');
      var canvas = document.getElementById('bgCanvas')
      var ctx = canvas.getContext('2d');
      var lastScreenSize = {
        screen: {},
        canvas: {}
      };

      this.screenWS = ws;
      var imagePool = new ImagePool(100);

      ws.onopen = function (ev) {
        console.log('screen websocket connected')
      };

      // FIXME(ssx): use pubsub is better
      var imageBlobBuffer = self.imageBlobBuffer;
      var imageBlobMaxLength = 300;

      ws.onmessage = function (message) {
        if (message.data instanceof Blob) {
          console.log("image received");
          $.publish("imagedata", message.data);

          var blob = new Blob([message.data], {
            type: 'image/jpeg'
          })

          imageBlobBuffer.push(blob);

          if (imageBlobBuffer.length > imageBlobMaxLength) {
            imageBlobBuffer.shift();
          }

          var img = imagePool.next();
          img.onload = function () {
            canvas.width = img.width
            canvas.height = img.height
            ctx.drawImage(img, 0, 0, img.width, img.height);
            
            self.resizeScreen(img);


            // Try to forcefully clean everything to get rid of memory
            // leaks. Note self despite this effort, Chrome will still
            // leak huge amounts of memory when the developer tools are
            // open, probably to save the resources for inspection. When
            // the developer tools are closed no memory is leaked.
            img.onload = img.onerror = null
            img.src = BLANK_IMG
            img = null
            blob = null

            URL.revokeObjectURL(url)
            url = null
          }

          img.onerror = function () {
            // Happily ignore. I suppose this shouldn't happen, but
            // sometimes it does, presumably when we're loading images
            // too quickly.

            // Do the same cleanup here as in onload.
            img.onload = img.onerror = null
            img.src = BLANK_IMG
            img = null
            blob = null

            URL.revokeObjectURL(url)
            url = null
          }

          var url = URL.createObjectURL(blob)
          img.src = url;
        } else if (/^data size:/.test(message.data)) {
          // console.log("receive message:", message.data)
        } else if (/^rotation/.test(message.data)) {
          self.rotation = parseInt(message.data.substr('rotation '.length), 10);
          console.log(self.rotation)
        } else {
          console.log("receive message 2:", message.data)
        }
      }

      ws.onclose = function (ev) {
        console.log("screen websocket closed", ev.code)
      }.bind(this)

      ws.onerror = function (ev) {
        console.log("screen websocket error");
        self.reConnectScreenStream();
      }
    },

    reConnectScreenStream: function() {
      this.openScreenStream();
    },
    enableTouch: function () {
      /**
       * TOUCH HANDLING
       */
      var self = this;
      var element = this.canvas.fg;

      var screen = {
        bounds: {}
      }
      console.log("enableTouch")

      var control = null;
      var multiControl = [];
      var WebSockets = {};
      
      WebSockets.init = function() {
        var ws = null;
        //var control = null;
        //var multiControl = [];
        console.log("create websocket");
        if(self.isMultiphone == true){
          for(var i = 0; i < self.deviceList.length; i++){
            //ws://192.168.199.171:7912
            var tmpUrl = "ws://" + self.deviceList[i].ip + ":" + self.deviceList[i].port  + "/minitouch";
            console.log("tmpurl",tmpUrl);
            var wsMulti = new WebSocket(tmpUrl)
            wsMulti.onerror = function (ev) {
              console.log("minitouch websocket error:", ev)
              onClose(ev);
            }
            wsMulti.onmessage = function (ev) {
              console.log("minitouch websocket receive message:", ev.data);
            }
            wsMulti.onclose = function (ev) {
              console.log("minitouch websocket closed");
              onClose(ev);
            }
            multiControl.push(MiniTouch.createNew(wsMulti));
          }
        
        }else{
          ws = new WebSocket(this.deviceUrl.replace("http:", "ws:") + "/minitouch")
          ws.onerror = function (ev) {
            console.log("minitouch websocket error:", ev);
            onClose(ev);
          }
          ws.onmessage = function (ev) {
            console.log("minitouch websocket receive message:", ev.data);
          }
          ws.onclose = function () {
            console.log("minitouch websocket closed");
            onClose(ev);
          }
          //control = this.control = MiniTouch.createNew(ws);
          control = iniTouch.createNew(ws);
        }
      }

      function reConnect(){
        console.log("socket 连接断开，正在尝试重新建立连接");
        WebSockets.init();
      }

      function onClose(ev) {
        console.log("DISCONNECTED")
        reConnect();
      }
      WebSockets.init();
      console.log("control",control);
      function calculateBounds() {
        var el = element;
        screen.bounds.w = el.offsetWidth
        screen.bounds.h = el.offsetHeight
        screen.bounds.x = 0
        screen.bounds.y = 0
        console.log("calculateBounds")
        while (el.offsetParent) {
          screen.bounds.x += el.offsetLeft
          screen.bounds.y += el.offsetTop
          el = el.offsetParent
        }
      }

      function activeFinger(index, x, y, pressure) {
        var scale = 0.5 + pressure
        $(".finger-" + index)
          .addClass("active")
          .css("transform", 'translate3d(' + x + 'px,' + y + 'px,0)')
      }

      function deactiveFinger(index) {
        $(".finger-" + index).removeClass("active")
      }

      function mouseDownListener(event) {
        console.log("mouseDownListener")
        var e = event;
        if (e.originalEvent) {
          e = e.originalEvent
        }
        // Skip secondary click
        if (e.which === 3) {
          return
        }
        e.preventDefault()

        fakePinch = e.altKey
        calculateBounds()

        var x = e.pageX - screen.bounds.x
        var y = e.pageY - screen.bounds.y
        var pressure = 0.5
        activeFinger(0, e.pageX, e.pageY, pressure);

        /*
        console.log("screen.bounds.x",screen.bounds.x);
        console.log("screen.bounds.y",screen.bounds.y);
        console.log("screen.bounds.w",screen.bounds.w);
        console.log("screen.bounds.h",screen.bounds.h);
        console.log("e.pageX",e.pageX);
        console.log("e.pageY",e.pageY);
        */

        var scaled = coords(screen.bounds.w, screen.bounds.h, x, y, self.rotation);
        self.mainDeviceLocation[0] = scaled.xP;
        self.mainDeviceLocation[1] = scaled.yP;
        if(self.isMultiphone == true) {
          console.log("isMultiphone",multiControl.length);
          var type = 0;
          var curDeviceHe = self.deviceCfg[self.deviceInfo.serial][2] * scaled.yP;
          var curDeviceNavHe = self.deviceCfg[self.deviceInfo.serial][2]- self.deviceCfg[self.deviceInfo.serial][5];
          var curDeviceBotHe = curDeviceNavHe - self.deviceCfg[self.deviceInfo.serial][4];
          console.log("curDeviceHe",curDeviceHe);
          console.log("curDeviceNavHe",curDeviceNavHe);
          console.log("curDeviceBotHe",curDeviceBotHe);
          if (curDeviceHe > curDeviceBotHe &&  curDeviceHe < curDeviceNavHe) {
            console.log("type 1")
            type = 1;
          }
          
          else if (curDeviceHe >= curDeviceNavHe) {
            console.log("type 3")
            type = 3;
          }
          else if (curDeviceHe < curDeviceBotHe) {
            for(var i = 0; i < multiControl.length; i++){
              console.log("self.deviceList[i].display.height",self.deviceList[i].display.height)
              var tmpY = scaled.yP * self.deviceList[i].multi * self.deviceList[i].display.height;
              var tmpNavHei = self.deviceList[i].display.height - self.deviceList[i].navBar;
              var tmpBotHei = tmpNavHei- self.deviceList[i].appBotBar;
              /*
              console.log(typeof(tmpY) + tmpY);
              console.log(typeof(tmpBotHei)+tmpBotHei);
              console.log(typeof(tmpNavHei) + tmpNavHei);
              */
              if(Number(tmpY) > Number(tmpBotHei)) {
                type = 2;
                console.log("type 2")
                break;
                
              }
            }
            
          }
          else {
            type = 0;
            console.log("type 0")
          }
          
          if (Number(type) == 0){
            console.log("im here 0")
            for(var i = 0; i < multiControl.length; i++){
              console.log("mutiControl",multiControl[i]);
              multiControl[i].touchDown(0, scaled.xP, scaled.yP * self.deviceList[i].multi, pressure);
              multiControl[i].touchCommit();
            }
          }
          else if(Number(type) == 1){
            console.log("im here 1")
            for(var i = 0; i < multiControl.length; i++){
              console.log("mutiControl",multiControl[i]);
              var  tmpNavHei= self.deviceList[i].display.height - self.deviceList[i].navBar;
              var  tmpBotHei= tmpNavHei- self.deviceList[i].appBotBar;
              var tmpScaledY = (tmpBotHei + tmpNavHei) / 2 / self.deviceList[i].display.height;
              multiControl[i].touchDown(0, scaled.xP, tmpScaledY, pressure);
              multiControl[i].touchCommit();
            }
          }
          else {
            console.log("bu fu he fan wei");
          }


        }else {
          console.log("isMultiphone",multiControl.length);
          console.log("control",control);
          control.touchDown(0, scaled.xP, scaled.yP, pressure);
          control.touchCommit();
        }
        //control.touchDown(0, scaled.xP, scaled.yP, pressure);
        //control.touchCommit();
        console.log("this.deviceList",self.deviceList)
        element.removeEventListener('mousemove', mouseHoverListener);
        element.addEventListener('mousemove', mouseMoveListener);
        document.addEventListener('mouseup', mouseUpListener);
      }

      function mouseMoveListener(event) {
        console.log("mouseMoveListener")
        var e = event
        if (e.originalEvent) {
          e = e.originalEvent
        }
        // Skip secondary click
        if (e.which === 3) {
          return
        }
        e.preventDefault()

        var pressure = 0.5
        activeFinger(0, e.pageX, e.pageY, pressure);
        var x = e.pageX - screen.bounds.x
        var y = e.pageY - screen.bounds.y
        console.log("screen.bounds.x",screen.bounds.x);
        console.log("screen.bounds.y",screen.bounds.y);
        console.log("screen.bounds.w",screen.bounds.w);
        console.log("screen.bounds.h",screen.bounds.h);
        console.log("e.pageX",e.pageX);
        console.log("e.pageY",e.pageY);
        var scaled = coords(screen.bounds.w, screen.bounds.h, x, y, self.rotation);
        if(self.isMultiphone == true) {
          /*
          console.log("isMultiphone",multiControl.length);
          for(var i = 0; i < multiControl.length; i++){
            multiControl[i].touchMove(0, scaled.xP, scaled.yP * self.deviceList[i].multi, pressure);
            multiControl[i].touchCommit();
          }*/
          console.log("isMultiphone",multiControl.length);
          var type = 0;
          var curDeviceHe = self.deviceCfg[self.deviceInfo.serial][2] * scaled.yP;
          var curDeviceNavHe = self.deviceCfg[self.deviceInfo.serial][2]- self.deviceCfg[self.deviceInfo.serial][5];
          var curDeviceBotHe = curDeviceNavHe - self.deviceCfg[self.deviceInfo.serial][4];
          if (curDeviceHe > curDeviceBotHe &&  curDeviceHe < curDeviceNavHe) {
            console.log("type 1")
            type = 1;
          }
          
          else if (curDeviceHe >= curDeviceNavHe) {
            console.log("type 3")
            type = 3;
          }
          else if (curDeviceHe < curDeviceBotHe) {
            for(var i = 0; i < multiControl.length; i++){
              console.log("self.deviceList[i].display.height",self.deviceList[i].display.height)
              var tmpY = scaled.yP * self.deviceList[i].multi * self.deviceList[i].display.height;
              var tmpNavHei = self.deviceList[i].display.height - self.deviceList[i].navBar;
              var tmpBotHei = tmpNavHei- self.deviceList[i].appBotBar;
              if(Number(tmpY) > Number(tmpBotHei)) {
                type = 2;
                console.log("type 2")
                break;    
              }
            }
            
          }
          else {
            type = 0;
            console.log("type 0")
          }
          
          if (Number(type) == 0){
            console.log("im here 0")
            for(var i = 0; i < multiControl.length; i++){
              console.log("mutiControl",multiControl[i]);
              multiControl[i].touchMove(0, scaled.xP, scaled.yP * self.deviceList[i].multi, pressure);
              multiControl[i].touchCommit();
            }
          }
          /*
          else if(Number(type) == 1){
            console.log("im here 1")
            for(var i = 0; i < multiControl.length; i++){
              console.log("mutiControl",multiControl[i]);
              var  tmpNavHei= self.deviceList[i].display.height - self.deviceList[i].navBar;
              var  tmpBotHei= tmpNavHei- self.deviceList[i].appBotBar;
              var tmpScaledY = (tmpBotHei + tmpNavHei) / 2 / self.deviceList[i].display.height;
              multiControl[i].touchMove(0, scaled.xP, tmpScaledY, pressure);
              multiControl[i].touchCommit();
            }
          }*/
          else {
            console.log("bu fu he fan wei");
          }
          self.mainDeviceLocation[0] = 0;
          self.mainDeviceLocation[1] = 0;
        }else{
          control.touchMove(0, scaled.xP, scaled.yP, pressure);
          control.touchCommit();
        }

        //control.touchMove(0, scaled.xP, scaled.yP, pressure);
        //control.touchCommit();
      }

      function mouseUpListener(event) {
        var e = event
        if (e.originalEvent) {
          e = e.originalEvent
        }
        // Skip secondary click
        if (e.which === 3) {
          return
        }
        e.preventDefault()
        console.log("mouseUpListener")
        if(self.isMultiphone == true) {
          console.log("isMultiphone",multiControl.length);
          for(var i = 0; i < multiControl.length; i++){
            multiControl[i].touchUp(0);
            multiControl[i].touchCommit();
          }

        }else{
          control.touchUp(0);
          control.touchCommit();
        }
        //control.touchUp(0)
        //control.touchCommit();
        stopMousing()
      }

      function stopMousing() {
        console.log("imstopMousingage")
        element.removeEventListener('mousemove', mouseMoveListener);
        // element.addEventListener('mousemove', mouseHoverListener);
        document.removeEventListener('mouseup', mouseUpListener);
        deactiveFinger(0);
      }

      function mouseHoverListener(event) {
        var e = event;
        if (e.originalEvent) {
          e = e.originalEvent
        }
        // Skip secondary click
        if (e.which === 3) {
          return
        }
        e.preventDefault()

        var x = e.pageX - screen.bounds.x
        var y = e.pageY - screen.bounds.y
      }

      function markPosition(pos) {
        var ctx = self.canvas.fg.getContext("2d");
        ctx.fillStyle = '#ff0000'; // red
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, 12, 0, 2 * Math.PI)
        ctx.closePath()
        ctx.fill()

        ctx.fillStyle = "#fff"; // white
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, 8, 0, 2 * Math.PI)
        ctx.closePath()
        ctx.fill();
      }

      var wheelTimer, fromYP;

      function mouseWheelDelayTouchUp() {
        console.log("mouseWheelDelayTouchUp");
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(function () {
          fromYP = null;
          if(self.isMultiphone == true) {
            console.log("isMultiphone",multiControl.length);
            for(var i = 0; i < multiControl.length; i++){
              multiControl[i].touchUp(1);
              multiControl[i].touchCommit();
            }
  
          }else{
            control.touchUp(1);
            control.touchCommit();
          }
          //control.touchUp(1)
          //control.touchCommit();
          // deactiveFinger(0);
          // deactiveFinger(1);
        }, 100)
      }

      function mouseWheelListener(event) {
        console.log("mouseWheelListener")
        var e = event;
        if (e.originalEvent) {
          e = e.originalEvent
        }
        e.preventDefault()
        calculateBounds()

        var x = e.pageX - screen.bounds.x
        var y = e.pageY - screen.bounds.y
        var pressure = 0.5;
        var scaled;

        if (!fromYP) {
          fromYP = y / screen.bounds.h; // display Y percent
          // touch down when first detect mousewheel
          scaled = coords(screen.bounds.w, screen.bounds.h, x, y, self.rotation);
          if(self.isMultiphone == true) {
            for(var i = 0; i < multiControl.length; i++){
              console.log("mutiControl",multiControl[i]);
              multiControl[i].touchDown(1, scaled.xP, scaled.yP * self.deviceList[i].multi, pressure);
              multiControl[i].touchCommit();
            }
            /*
            console.log("isMultiphone",multiControl.length);
          var type = 0;
          var curDeviceHe = self.deviceCfg[self.deviceInfo.serial][2] * scaled.yP;
          var curDeviceBotHe = self.deviceCfg[self.deviceInfo.serial][2]- self.deviceCfg[self.deviceInfo.serial][5];
          var curDeviceNavHe = curDeviceBotHe - self.deviceCfg[self.deviceInfo.serial][4];
          if (curDeviceHe >curDeviceNavHe &&  curDeviceHe < curDeviceBotHe) {
            console.log("type 1")
            type = 1;
          }
          
          else if (curDeviceHe >= curDeviceBotHe) {
            console.log("type 3")
            type = 3;
          }
          else if (curDeviceHe < curDeviceNavHe) {
            for(var i = 0; i < multiControl.length; i++){
              var tmpY = scaled.yP * self.deviceList[i].multi * self.deviceList[i].display.height;
              var tmpBotHei = self.deviceList[i].display.height - self.deviceList[i].appBotBar;
              var tmpNavHei = tmpBotHei- self.deviceList[i].navBar;
              if(tmpY > tmpNavHei ){
                type = 2;
                break;
              }
            }
            console.log("type 2")
          }
          else {
            type = 0;
            console.log("type 0")
          }
          
          if (type == 0){
            for(var i = 0; i < multiControl.length; i++){
              console.log("mutiControl",multiControl[i]);
              multiControl[i].touchDown(1, scaled.xP, scaled.yP * self.deviceList[i].multi, pressure);
              multiControl[i].touchCommit();
            }
          }
          else if(type == 1){
            for(var i = 0; i < multiControl.length; i++){
              console.log("mutiControl",multiControl[i]);
              var tmpBotHei = self.deviceList[i].display.height - self.deviceList[i].appBotBar;
              var tmpNavHei = tmpBotHei- self.deviceList[i].navBar;
              var tmpScaledY = (tmpBotHei + tmpNavHei) / 2 / self.deviceList[i].display.height;
              multiControl[i].touchDown(1, scaled.xP, tmpScaledY, pressure);
              multiControl[i].touchCommit();
            }
          }
          else {
            console.log("bu fu he fan wei");
          }*/
  
          }else{
            control.touchDown(1, scaled.xP, scaled.yP, pressure);
            control.touchCommit();
          }

          //control.touchDown(1, scaled.xP, scaled.yP, pressure);
          //control.touchCommit();
          // activeFinger(0, e.pageX, e.pageY, pressure);
        }
        // caculate position after scroll
        var toYP = fromYP + (event.wheelDeltaY < 0 ? -0.05 : 0.05);
        toYP = Math.max(0, Math.min(1, toYP));

        var step = Math.max((toYP - fromYP) / 5, 0.01) * (event.wheelDeltaY < 0 ? -1 : 1);
        for (var yP = fromYP; yP < 1 && yP > 0 && Math.abs(yP - toYP) > 0.0001; yP += step) {
          y = screen.bounds.h * yP;
          var pageY = y + screen.bounds.y;
          scaled = coords(screen.bounds.w, screen.bounds.h, x, y, self.rotation);
          // activeFinger(1, e.pageX, pageY, pressure);
          if(self.isMultiphone == true) {
            console.log("isMultiphone",multiControl.length);
            for(var i = 0; i < multiControl.length; i++){
              multiControl[i].touchMove(1, scaled.xP, scaled.yP * self.deviceList[i].multi, pressure);
              multiControl[i].touchWait(10);
              multiControl[i].touchCommit();
            }
  
          }else{
            control.touchMove(1, scaled.xP, scaled.yP * self.deviceList[i].multi, pressure);
            control.touchWait(10);
            control.touchCommit();
          }
          //control.touchMove(1, scaled.xP, scaled.yP, pressure);
          //control.touchWait(10);
          //control.touchCommit();
        }
        fromYP = toYP;
        mouseWheelDelayTouchUp()
      }

      /* bind listeners */
      element.addEventListener('mousedown', mouseDownListener);
      // element.addEventListener('mousemove', mouseHoverListener);
      element.addEventListener('mousewheel', mouseWheelListener);
    }
  }
})