﻿(function() {
  'use strict';

  var optionModule = angular.module('options', ['myCommons']);
  optionModule.config(['$compileProvider', function($compileProvider){
    var urlRegex =
    /^\s*(data|https?|ftp|mailto|file|chrome-extension|blob:chrome-extension):/;
    $compileProvider.aHrefSanitizationWhitelist(urlRegex);
    $compileProvider.imgSrcSanitizationWhitelist(urlRegex);
  }]);
  optionModule.controller('OptionController',
    ['$scope', '$http', '$document', function($scope, $http, $document) {
    $scope.options = angular.copy(defaultValues);
    $scope.currentLocale = chrome.i18n.getUILanguage();

    var regTool = $document.find(
      '[ng-controller="RegexToolController"]');
    $scope.showRegexTool = function() {
      regTool.toggleClass('show');
    };

    // select menu.
    $scope.selectMenu = '';
    $scope.menuItems = angular.copy(optionMenus);
    var menu = {
      menuElement: $document.find('#config_change'),
      barName: 'change_bar',
      enable: function(name) {
        this.commonFunc(name, true, 'black');
      },
      disable: function(name) {
        this.commonFunc(name, false, 'lightgray');
      },
      commonFunc: function(name, show, color) {
        if (name.length === 0) {
          error('The name of arguments of commonFunc is length zero.');
          return;
        }

        var t = this.menuElement.find('.' + name);
        if (t.length !== 0) {
          var bar = t.find('.' + this.barName);
          (show) ? bar.show() : bar.hide();
          t.find('[translation="' + name + '"]').css('color', color);
        }
      },
    };

    var pageElement = $document.find('#option_items').children('section');
    var footer = $document.find('footer');
    $scope.$watch('selectMenu', function(newValue, oldValue) {
      debug('selectMenu was changed. on OptionController.',
        newValue, oldValue);
      if (angular.isString(newValue) && angular.isString(oldValue)) {
        menu.disable(oldValue);
        menu.enable(newValue);

        pageElement.each(function(index, element) {
          var el = angular.element(element);
          var className = el.attr('class').replace(/ng-scope/, '').trim();
          if (newValue === className) {
            el.show();
          } else {
            el.hide();
          }
        });

        if (newValue === 'option' || newValue === 'keybind') {
          footer.show();
        } else {
          footer.hide();
        }
      }
    });

    $scope.menuSelect = function($event) {
      $scope.selectMenu = angular.element(
        $event.target).attr('translation').trim();

      if ($scope.showRestoreMessage) {
        $scope.showRestoreMessage = false;
        $scope.showOldRestoreTitle = true;
      }
    };

    $document.ready(function(){
      $scope.menuItems.forEach(function(value) {
        menu.disable(value.name);
      });

      chrome.runtime.sendMessage(
        { event: 'display_option_page' }, function(response) {
        $scope.$apply(function() {
          if (response === 'updated') {
            $scope.showRestoreMessage =
              !angular.copy($scope.options.when_updated_restore_session);
            // 4 == changed history.
            response = 4;
          }
          $scope.selectMenu = $scope.menuItems[response ? response : 0].name;
        });
      });
    });

    chrome.runtime.onMessage.addListener(function(message) {
      if (message.event === 'contextMenus') {
        $scope.$apply(function() {
          $scope.selectMenu = $scope.menuItems[message.index].name;
        });
      }
    });
  }]);

  optionModule.controller('keybindController',
    ['$scope', '$document', function($scope, $document) {
    $scope.keys = [];
    $scope.start = null;

    var section = $document.find('[ng-controller="keybindController"]');
    $scope.$watch('options.keybind', function(newValue, oldValue) {
      debug('keybind was changed.', newValue, oldValue);
      if (angular.isObject(newValue)) {
        var pressKeys = section.find('input[type="text"].pressKey');
        if (pressKeys.length === 0) {
          error('option.keybind is watching error.' +
                        ' pressKeys is zero.');
          return;
        }

        var obj = null;
        var className = null;
        for (var i = 0, len = pressKeys.length; i < len; i++) {
          className = pressKeys[i].parentNode.parentNode.className;
          obj = angular.fromJson(newValue[className]);
          pressKeys[i].value = jQuery.isEmptyObject(obj) ?
                               '' : generateKeyString(obj);
        }
      }
    });

    $scope.setBind = function($event) {
      $scope.start = angular.element($event.target.parentNode.parentNode)[0];
    };

    $scope.clearBind = function($event) {
      var keyBinds = angular.copy($scope.options.keybind);
      keyBinds[$event.target.parentNode.parentNode.className] = '{}';
      $scope.$parent.options.keybind = keyBinds;
    };

    $document.keyup(function(event) {
      if (angular.isObject($scope.start)) {
        var keyBinds = angular.copy($scope.options.keybind);
        keyBinds[$scope.start.className] = angular.toJson(keyCheck(event));
        $scope.$apply(function() {
          $scope.$parent.options.keybind = keyBinds;
        });

        $scope.start = null;
      }
    });

    angular.forEach($scope.options.keybind, function(value, key) {
      $scope.keys.push({ name: key, value: value });
    });
  }]);

  optionModule.controller('historyController', ['$scope', function($scope) {
    $scope.history = [];
    $scope.selectHistory = '';
    var searchDate = null;

    $scope.$watch('selectHistory', function(newValue) {
      debug(
        'selectHistory was changed on historyController.', newValue);
      if (angular.isUndefined(newValue) || newValue === null) {
        searchDate = null;
        return;
      }

      var histories = angular.copy($scope.history);
      for (var i = 0, len = histories.length; i < len; i++) {
        if (histories[i].date === newValue.getTime()) {
          searchDate = histories[i].date;
          break;
        } else {
          searchDate = null;
        }
      }
    });

    $scope.deleteHistory = function(date) {
      var histories = angular.copy($scope.history);
      var t = histories.filter(function(x) {
        return x.date !== date;
      });
      histories = t;

      $scope.history = histories;

      var writeHistory = {};
      histories.forEach(function(v) {
        writeHistory[v.date] = v.history;
      });

      var write = {};
      write[historyKey] = writeHistory;
      chrome.storage.local.set(write, function() {
        chrome.runtime.sendMessage({ event: 'deleteHistory', date: date });
      });
    };

    $scope.deleteHistoryItem = function(date, deleteItem) {
      var histories = angular.copy($scope.history);
      var t = histories.filter(function(x) {
        if (x.date !== date) {
          return true;
        }

        var hi = angular.copy(x.history);
        var hit = hi.filter(function(x2) {
          return x2.time !== deleteItem.time;
        });
        x.history = hit;

        return hit.length > 0 ? true : false;
      });
      histories = t;

      $scope.history = histories;

      var writeHistory = {};
      histories.forEach(function(v) {
        writeHistory[v.date] = v.history;
      });

      var write = {};
      write[historyKey] = writeHistory;
      chrome.storage.local.set(write, function() {
        chrome.runtime.sendMessage(
          { event: 'deleteHistoryItem', date: date, item: deleteItem });
      });
    };

    $scope.showDate = function(date) {
      if (angular.isNumber(searchDate)) {
        return (date === searchDate) ? true : false;
      } else {
        return true;
      }
    };

    var showHistory = function(optionHistories) {
      var histories = [];
      for (var key in optionHistories) {
        if (optionHistories.hasOwnProperty(key)) {
          histories.push({
            date: parseInt(key, 10),
            history: angular.copy(optionHistories[key]) });
        }
      }
      $scope.history = angular.copy(histories);
    };

    var firstFlag = true;
    var showFlag = false;
    $scope.$watch('selectMenu', function(newValue) {
      debug('selectMenu was changed on historyController.');
      showFlag = (newValue === 'history') ? true : false;
      if (firstFlag && showFlag) {
        showHistory($scope.options.history);
        firstFlag = false;
      }
    });

    $scope.$watchCollection('options.history', function(newValues, oldValues) {
      debug('option.history was changed.', newValues, oldValues);
      if (showFlag) {
        showHistory(newValues);
      }
    });
  }]);

  optionModule.controller('sessionHistoryController',
    ['$scope', function($scope) {
      $scope.sessionHistory = [];
      $scope.showSavedSession = null;

      $scope.$watch('options.sessions', function(newValue) {
        debug('options.sessions was changed ' +
                      'on sessionHistoryController', newValue);
        if (!angular.isString(newValue)) {
          return;
        }
        $scope.sessionHistory = angular.fromJson(newValue);
      });

      $scope.$watch('options.savedSessions', function(newValue, oldValue) {
        debug('options.savedSessions was changed ' +
          'on sessionHistoryController', newValue, oldValue);
      });

      $scope.savedSessionClicked = function(session) {
        $scope.showSavedSession = angular.copy(session);
      };
      $scope.deleteSavedSession = function(session) {
        if (!angular.isObject(session)) {
          return;
        }

        var sessions = angular.copy($scope.options.savedSessions);
        var t = sessions.filter(function(v) {
          return v.date !== session.date;
        });
        sessions = t;

        $scope.options.savedSessions = sessions;
        $scope.showSavedSession = null;

        var write = {};
        write.savedSessions = sessions;
        chrome.storage.local.set(write);
      };

      $scope.deleteSavedSpecificSession = function(session, deleteItemKey) {
        var savedSessions = angular.copy($scope.options.savedSessions);
        var t = savedSessions.filter(function(v) {
          if (v.date !== session.date) {
            return true;
          }

          delete v.session[deleteItemKey];
          delete session.session[deleteItemKey]; // session = data in $scope.
          if (jQuery.isEmptyObject(v.session)) {
            return false;
          }
          return true;
        });
        savedSessions = t;

        $scope.options.savedSessions = savedSessions;

        var write = {};
        write.savedSessions = savedSessions;
        chrome.storage.local.set(write);
      };

      $scope.deleteSpecificSession = function(sessions, deleteItemKey) {
        var sessionHistory = angular.copy($scope.sessionHistory);
        var t = sessionHistory.filter(function(v) {
          if (v.date !== sessions.date) {
            return true;
          }

          delete v.session[deleteItemKey];
          return jQuery.isEmptyObject(v.session) ? false : true;
        });
        sessionHistory = t;

        $scope.sessionHistory = sessionHistory;

        var write = {};
        write[sessionKey] = angular.toJson(sessionHistory);
        chrome.storage.local.set(write, function() {
          chrome.runtime.sendMessage(
            { event: 'deleteSessionItem',
              session: sessions,
              key: deleteItemKey });
        });
      };

      $scope.saved = function(session) {
        session = angular.copy(session);

        var writeSessions = angular.copy($scope.options.savedSessions);
        for (var i = 0, len = writeSessions.length; i < len; i++) {
          if (writeSessions[i].date === session.date) {
            error('already same data have added.');
            return;
          }
        }

        $scope.options.savedSessions.push(session);
        writeSessions.push(session);

        var write = {};
        write.savedSessions = writeSessions;
        chrome.storage.local.set(write);
      };
      $scope.deleted = function(session) {
        var sessions = angular.copy($scope.sessionHistory);
        var t = sessions.filter(function(v) {
          return (v.date !== session.date) ? true : false;
        });
        sessions = t;

        $scope.sessionHistory = sessions;

        // purge.jsのtabSession側と二重書き込みになるが念のためやっておく。
        var write = {};
        write[sessionKey] = sessions;
        chrome.storage.local.set(write, function() {
          chrome.runtime.sendMessage(
            { event: 'deleteSession', session: session });
        });
      };

      $scope.restored = function(session) {
        chrome.runtime.sendMessage(
          { event: 'restore', session: session.session });
      };
  }]);

  optionModule.controller('changeHistoryController',
    ['$scope', '$http', function($scope, $http) {
    $scope.changed = [];

    $http.get(changeHistory)
    .success(function(data) {
      var lists = data.split('\n');
      var text = null;
      var dateVer = null;
      var items = [];
      var changed = [];
      for (var i = 0, len = lists.length; i < len; i++) {
        text = jQuery.trim(lists[i]);
        if (text.length === 0) {
          continue;
        }

        if (text.match(/^\d+\/\d+\/\d+/) !== null) {
          if (angular.isString(dateVer) && items.length > 0) {
            changed.push({ dateVer: dateVer, items: items });
            dateVer = null;
            items = [];
          }

          dateVer = text;
        } else {
          items.push(text);
        }
      }
      $scope.changed = changed;
    })
    .error(function(){
      error('changed history do not get.');
    });
  }]);

  optionModule.controller('storageController',
    ['$scope', '$document', function($scope, $document) {
    var status = $document.find('#status');
    var statusSync = $document.find('#status_sync');
    var configStatus = $document.find('#config_view_status');
    var configView = $document.find('#config_view');

    $scope.$watchCollection('options', function(newValues, oldValues) {
      debug('options was changed.', newValues, oldValues);
    });

    $scope.save = function() {
      chrome.storage.local.set($scope.options, function() {
        chrome.runtime.sendMessage({ event: 'initialize' });
        updateMessage(status, 'saved.');
      });
    };
    $scope.load = function() {
      loadFunc(chrome.storage.local, function() {
        updateMessage(status, 'loaded.');
      });
    };
    $scope.init = function() {
      angular.copy(defaultValues, $scope.$parent.options);
      updateMessage(status, 'initialized.');
    };
    $scope.syncSave = function() {
      chrome.storage.sync.set($scope.options);
      updateMessage(statusSync, 'saved.');
    };
    $scope.syncLoad = function() {
      loadFunc(chrome.storage.sync, function() {
        updateMessage(statusSync, 'loaded.');
      });
    };
    $scope.export = function() {
      var exportOptions = angular.copy($scope.options);
      delete exportOptions.backup;
      delete exportOptions.history;
      configView.val(angular.toJson(exportOptions, true));
      updateMessage(configStatus, 'exported.');
    };
    $scope.import = function() {
      angular.copy(angular.fromJson(configView.val()), $scope.$parent.options);
      updateMessage(configStatus, 'imported.');
    };
    function getStorage(storageType, callback) {
      storageType.get(null, function(items) {
        var options = {};
        for (var key in defaultValues) {
          if (defaultValues.hasOwnProperty(key)) {
            options[key] = items.hasOwnProperty(key) ?
                              items[key] : defaultValues[key];
          }
        }
        (callback || angular.noop)(options);
      });
    }
    function loadFunc(storageType, callback) {
      getStorage(storageType, function(items) {
        $scope.$parent.options = items;
        (callback || angular.noop)(items);
      });
    }
    function updateMessage(element, message) {
      element.text(message);
      setTimeout(function() {
        element.text('');
      }, 1000);
    }

    // initialize.
    $scope.load();
  }]);

  optionModule.controller('RegexToolController',
    ['$scope', '$sce', function($scope, $sce) {
    $scope.regex = [
      {
        translationName: 'regex_reference',
        reference: [
          [
            { word: '[abc]',    translationName : 'regex_single' },
            { word: '.',        translationName : 'regex_any_single' },
            { word: '(...)',    translationName : 'regex_capture' },
          ],
          [
            { word: '[^abc]',   translationName : 'regex_any_except' },
            { word: '\\s',      translationName : 'regex_whitespace' },
            { word: '(a|b)',    translationName : 'regex_or' },
          ],
          [
            { word: '[a-z]',    translationName : 'regex_range' },
            { word: '\\S',      translationName : 'regex_non_whitespace' },
            { word: 'a?',       translationName : 'regex_zero_one' },
          ],
          [
            { word: '[a-zA-Z]', translationName : 'regex_range_or' },
            { word: '\\d',      translationName : 'regex_digit' },
            { word: 'a*',       translationName : 'regex_zero_more' },
          ],
          [
            { word: '^',        translationName : 'regex_start' },
            { word: '\\D',      translationName : 'regex_non_digit' },
            { word: 'a+',       translationName : 'regex_one_more' },
          ],
          [
            { word: '$',        translationName : 'regex_end' },
            { word: '\\w',      translationName : 'regex_word' },
            { word: 'a{3}',     translationName : 'regex_exactly' },
          ],
          [
            { word: '\\W',      translationName : 'regex_non_word' },
            { word: 'a{3,}',    translationName : 'regex_three_or_more' },
            { word: '\\b',      translationName : 'regex_word_boundary' },
          ],
          [
            { word: 'a{3,6}',   translationName : 'regex_between' },
          ],
        ],
      },
    ];
    $scope.$watch('regex.word', function(newValue, oldValue) {
      debug('regex.word is changed.', newValue, oldValue);
      regexCheck();
    });
    $scope.$watch('regex.option', function(newValue, oldValue) {
      debug('regex.option is changed.', newValue, oldValue);
      regexCheck();
    });
    $scope.$watch('regex.target', function(newValue, oldValue) {
      debug('regex.target is changed.', newValue, oldValue);
      regexCheck();
    });

    function replacer(str) {
      return '<span style="background: red;">' + str + '</span>';
    }

    function regexCheck() {
      var splitedTargets;
      var regex;
      try {
        splitedTargets = $scope.regex.target.split('\n');
        regex = new RegExp(
          $scope.regex.word, $scope.regex.option === true ? 'i' : '');
      } catch (e) {
        error('regexCheck is error. so this process is skipped.');
        return;
      }

      var resultHTML = '';
      splitedTargets.forEach(function(v) {
        resultHTML += v.replace(regex, replacer) + '<br>';
      });
      $scope.regex.result = $sce.trustAsHtml(resultHTML);
    }
  }]);
})();
