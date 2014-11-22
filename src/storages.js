// This file don't use angular.js and jQuery.
(function(window) {
  "use strict";

  function TabSession(key, currentKey, max_sessions) {
    debug('the constructor of TabSession class.');
    this.time = null;
    this.key = key || sessionKey || 'sessions';
    this.currentKey = currentKey || currentSessionKey || 'currentSession';
    this.sessions = [];
    this.max_sessions = max_sessions || 10;
  }
  TabSession.prototype.read = function(sessions) {
    if (toType(sessions) !== 'array' && toType(sessions) !== 'string') {
      error('a invalid type of arugments.');
      return;
    }
    this.sessions = (toType(sessions) === 'string') ?
                    JSON.parse(sessions) : sessions;
  };
  TabSession.prototype.update = function(session, callback) {
    debug('update function of TabSession class.', session);
    if (session === void 0 || session === null) {
      error('a invalid type of arguments.');
      return;
    }

    if (angular.isDate(this.time)) {
      var t = this.sessions.filter(function(v) {
        return v.date !== this.time.getTime();
      }, this);
      this.sessions = t;
    }

    if (dictSize(session) > 0) {
      this.time = new Date();
      this.sessions.push(
        { date: this.time.getTime(), session: cloneObject(session) });
    } else {
      this.time = null;
    }

    this.sessions = this.getDeletedOldSession(this.max_sessions);

    var write = {};
    write[this.key] = JSON.stringify(this.sessions);
    write[this.currentKey] = this.time ? this.time.getTime() : this.time;
    chrome.storage.local.set(write, callback);
  };
  TabSession.prototype.get = function(callback) {
    debug('get function of TabSession class.');
    if (toType(callback) !== 'function') {
      error('A invalid type of arugments.');
      return;
    }
    // this.keyのまま使うとthis.keyの値が消滅する
    var key = this.key;
    chrome.storage.local.get(key, function(items) {
      if (chrome.runtime.lastError) {
        error(chrome.runtime.lastError.messsage);
        return;
      }

      var sessions = items[key];
      if (toType(sessions) === 'string' && sessions !== '{}') {
        callback(JSON.parse(sessions));
      } else {
        callback(null);
      }
    });
  };
  TabSession.prototype.remove = function(date, callback) {
    debug('remove function of TabSession class.');

    if (toType(date) !== 'date') {
      error('A invalid type of arguments.');
      return;
    }

    var dateTime = date.getTime();
    var filterFunc = function(x) {
      return x.date !== dateTime;
    };
    var t = this.sessions.filter(filterFunc);
    this.sessions = t;

    var write = {};
    write[this.key] = JSON.stringify(this.sessions);
    chrome.storage.local.set(write, callback);
  };
  TabSession.prototype.removeItem = function(date, key, callback) {
    debug('removeItem function of TabSession class.');

    if (toType(date) !== 'date' && toType(key) !== 'string') {
      error('A invalid type of arguments.');
      return;
    }

    var dateTime = date.getTime();
    var filterFunc = function(x) {
      if (x.date !== dateTime) {
        return true;
      }

      delete x.session[key];
      for (var k in x.session) {
        if (x.session.hasOwnProperty(k)) {
          return true;
        }
      }
      return false;
    };
    var t = this.sessions.filter(filterFunc);
    this.sessions = t;

    var write = {};
    write[this.key] = JSON.stringify(this.sessions);
    chrome.storage.local.set(write, callback);
  };
  TabSession.prototype.removeAll = function(callback) {
    debug('removeAll function of TabSession class.');

    this.sessions = [];
    chrome.storage.local.remove(this.key, callback);
  };
  TabSession.prototype.getDeletedOldSession = function(max_sessions) {
    var length = this.sessions.length - (max_sessions || this.max_sessions);
    return length <= 0 ? this.sessions : this.sessions.slice(0, length);
  };
  TabSession.prototype.setMaxSession = function(max_sessions) {
    if (max_sessions > 0) {
      this.max_sessions = max_sessions;
    } else {
      error('invalid arguments.', max_sessions);
    }
  };
  window.TabSession = window.TabSession || TabSession;

  function TabHistory(key, max_history) {
    debug('the constructor of TabHistory class.');
    this.key = key;
    this.max_history = max_history || 7;
    this.history = {};
  }
  TabHistory.prototype.read = function(dataObj, callback) {
    debug('read function of TabHistory class.');
    if (dataObj === void 0 || dataObj === null) {
      chrome.storage.local.get(this.key, function(items) {
        if (chrome.runtime.lastError) {
          error(chrome.runtime.lastError.messsage);
          return;
        }

        this.history = items[this.key];
        if (toType(callback) === 'function') {
          callback();
        }
      });
    } else if (toType(dataObj) === 'object') {
      this.history = dataObj;
    } else {
      throw new Error('read function of TabHistory class is error.' +
                      'dataObj is invalid.');
    }
  };
  TabHistory.prototype.write = function(tab, callback) {
    debug('write function of TabHistory class.');
    var now = new Date();
    var date = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    var write_date = date.getTime();
    if (this.history[write_date] === void 0 ||
        this.history[write_date] === null) {
      this.history[write_date] = [];
    } else {
      // Check to if previously purge url.
      this.history[write_date] = this.history[write_date].filter(function(v) {
        return v.url !== tab.url;
      });
    }
    this.history[write_date].push({
      'title': tab.title ? tab.title : 'Unknown',
      'url': tab.url,
      'time': now.getTime(),
    });

    this.oldDelete();

    var write = {};
    write[historyKey] = this.history;
    chrome.storage.local.set(write, callback);
  };
  TabHistory.prototype.remove = function(date, callback) {
    debug('removeItem function of TabHistory class.');

    delete this.history[date.getTime()];

    var write = {};
    write[historyKey] = this.history;
    chrome.storage.local.set(write, callback);
  };
  TabHistory.prototype.removeItem = function(date, item, callback) {
    debug('removeItem function of TabHistory class.');

    var filterFunc = function(x) {
      return x.time !== item.time;
    };
    for (var key in this.history) {
      if (this.history.hasOwnProperty(key)) {
        if (parseInt(key, 10) === date.getTime()) {
          var t = this.history[key].filter(filterFunc);
          if (t.length === 0) {
            delete this.history[key];
          } else {
            this.history[key] = t;
          }
          break;
        }
      }
    }

    var write = {};
    write[historyKey] = this.history;
    chrome.storage.local.set(write, callback);
  };
  // Delete the history of pre-history
  TabHistory.prototype.oldDelete = function() {
    debug('oldDelete function of TabHistory class.');
    // milliseconds * seconds * minutes * hours * days
    var criterion = 1000 * 60 * 60 * 24 * this.max_history;
    var now = new Date();
    var removeTime = now.getTime() - criterion;
    var removeDates = [];
    for (var dateTime in this.history) {
      if (this.history.hasOwnProperty(dateTime)) {
        if (parseInt(dateTime, 10) < removeTime) {
          removeDates.push(dateTime);
        }
      }
    }
    for (var i = 0, len = removeDates.length; i < len; i++) {
      delete this.history[removeDates[i]];
    }
  };
  TabHistory.prototype.setKey = function(keyName) {
    debug('setKey function of TabHistory class.');
    if (toType(keyName) === 'string') {
      this.key = keyName;
    } else {
      throw new Error('setKey of TabHistory class is failed.' +
                      'Invalid arugments');
    }
  };
  TabHistory.prototype.setMaxHistory = function(max) {
    debug('setMaxHistory function of TabHistory class.');
    if (toType(max) === 'number') {
      this.max_history = max;
    } else {
      throw new Error('setMaxHistory of TabHistory class is failed.' +
                      'Invalid arugments');
    }
  };
  window.TabHistory = window.TabHistory || TabHistory;
})(window);
