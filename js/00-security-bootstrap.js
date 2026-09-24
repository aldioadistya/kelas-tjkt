(function(){
      var isLocal = /^(localhost|127\.0\.0\.1|::1)$/.test(location.hostname);
      if (location.protocol === 'http:' && !isLocal) {
        location.replace('https://' + location.host + location.pathname + location.search + location.hash);
      }
      window.__KELASKU_DEBUG__ = false;
      try {
        var originalError = console.error ? console.error.bind(console) : function(){};
        var originalWarn = console.warn ? console.warn.bind(console) : function(){};
        console.error = function(){ if (window.__KELASKU_DEBUG__) originalError.apply(console, arguments); };
        console.warn = function(){ if (window.__KELASKU_DEBUG__) originalWarn.apply(console, arguments); };
      } catch (_) {}
      if (!window.__KELASKU_DEBUG__) {
        window.addEventListener('error', function(e){
          try { e.preventDefault(); } catch (_) {}
        });
        window.addEventListener('unhandledrejection', function(e){
          try { e.preventDefault(); } catch (_) {}
        });
      }
    })();
