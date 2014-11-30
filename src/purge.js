﻿(function() {
  "use strict";

  // my option settings.
  var myOptions = null;

  /**
   * set setInterval returned value.
   * key   = tabId
   * value = return setInterval value.
   */
  var ticked = {};

  /**
   * When purge tabs, the object that the scroll position of purging tabs
   * is saved.
   * key   = tabId
   * value = the object that represent the scroll position(x, y).
   */
  var tempScrollPositions = {};

  // the string that represents the temporary exclusion list
  var tempRelease = [];

  // Before selecting the active tab, and the user has been selected tab.
  var oldActiveIds = {};

  var tabSession = new TabSession(sessionKey, currentSessionKey);
  var tabHistory = new TabHistory(historyKey);

  var currentIcon = null;
  var displayPageOfOption = null;
  var disableTimer = false;

  /**
   * The dict object contains the information
   * on the tab that ran the purging memory.
   *
   * key = tabId.
   * value = object.
   *    the values in the object are following.
   *       title          : title.
   *       iconURI        : the dateURI of icon.
   *       url            : the url before purging.
   *       purgeurl       : the url of release page of this id.
   *       scrollPosition : the object that represent the scroll position(x, y).
   */
  var unloaded = {};
  var unloadedCount = 0;
  Object.observe(unloaded, function(changes) {
    debug('unloaded was changed.', changes);

    var tabId;
    changes.forEach(function(v) {
      tabId = parseInt(v.name, 10);
      switch (v.type) {
        case 'add':
          unloadedCount++;
          deleteTick(tabId);
          break;
        case 'delete':
          unloadedCount--;
          tempScrollPositions[tabId] = v.oldValue.scrollPosition;
          setTick(tabId);
          break;
      }
    });
    chrome.browserAction.setBadgeText({ text: unloadedCount.toString() });
    tabSession.update(unloaded);
  });
  
  /**
   * return the current tab object.
   *
   * @return {Promise} return promise object.
   *                   If run the reject function, return Error object.
   *                   If run the resolve function,
   *                   return the object of the current tab.
   */
  function getCurrentTab()
  {
    return new Promise(function(resolve, reject) {
      chrome.tabs.getSelected(function(tab) {
        if (chrome.runtime.lastError) {
          error(chrome.runtime.lastError.message);
          reject();
          return;
        }
        resolve(tab);
      });
    });
  }

  /**
   * check If the url has contained the release pages.
   *
   * @param {String} url - the target url.
   * @return {Boolean} If the url is contained, return true.
   *                   if the different, return false.
   */
  function isReleasePage(url)
  {
    debug('isReleasePage', url);
    return url.indexOf(blankUrl) === 0;
  }

  /**
  * Check whether the user matches that set the exclusion list.
  * @param {String} url - the url to check whether matches.
  * @param {Object} excludeObj - the object represent exclusion list settings.
  *                        list    - 除外リストの値。複数のものは\nで区切る.
  *                        options - 正規表現のオプション.
  *                        returnValue - 一致したときに返す返り値
  * @return {Number} 引数にはnullかreturnValueの値が入る
  */
  function checkMatchUrlString(url, excludeObj)
  {
    debug('checkMatchUrlString');

    var excludeArray = excludeObj.list.split('\n');
    for (var i = 0, len = excludeArray.length; i < len; i++) {
      if (excludeArray[i] !== '') {
        var re = new RegExp(excludeArray[i], excludeObj.options);
        if (re.test(url)) {
          return excludeObj.returnValue;
        }
      }
    }
    return null;
  }

  /**
   * return the exclusion list have been set argument,
   *
   * @param {String} target - the name of the target list.
   *                   If the value is undefined, return normal exlusion list.
   * @return {Object} the object of the list relation.
   */
  function getTargetExcludeList(target)
  {
    debug('getTargetExcludeList', target);
    switch (target) {
      case 'extension':
        return {
          list: extensionExcludeUrl,
          options: 'i',
          returnValue: EXTENSION_EXCLUDE,
        };
      case 'keybind':
        return {
          list: myOptions.keybind_exclude_url,
          options: myOptions.keybind_regex_insensitive ? 'i' : '',
          returnValue: KEYBIND_EXCLUDE,
        };
      default:
        return {
          list: myOptions.exclude_url,
          options: myOptions.regex_insensitive ? 'i' : '',
          returnValue: USE_EXCLUDE,
        };
    }
    error('getTargetExcludeList was error.', target);
    return null;
  }

  /**
  * 与えられたURLが全ての除外リストに一致するか検索する。
  * @param {String} url - 対象のURL.
  * @return {Promise} return promise object.
  *             If be ran resolve function, return value is following.
  *               EXTENSION_EXCLUDE = 拡張機能内の除外リストと一致
  *               USE_EXCLUDE    = ユーザー指定の除外アドレスと一致
  *               TEMP_EXCLUDE   = 一時的な非解放リストと一致
  *               NORMAL_EXCLUDE = 一致しなかった。
  *             And if match the exclusion list of key bindings,
  *             make a bit addition of KEYBIND_EXCLUDE.
  *
  *             When you compare these values, you should use bit addition.
  */
 function checkExcludeList(url)
  {
    debug('checkExcludeList');

    // Check the keybind exclude list.
    var keybind = checkMatchUrlString(
      url, getTargetExcludeList('keybind')) || 0;

    // Check the exclude list in the extension.
    var result = checkMatchUrlString(url, getTargetExcludeList('extension'));
    if (result) {
      return result | keybind;
    }

    // Check the normal exclude list.
    result = checkMatchUrlString(url, getTargetExcludeList());
    if (result) {
      return result | keybind;
    }

    // Check to the temporary exclude list or don't match the exclude lists.
    return ((tempRelease.indexOf(url) !== -1) ?
                  TEMP_EXCLUDE : NORMAL_EXCLUDE) | keybind;
  }

  /**
   * 指定したタブの状態に合わせ、ブラウザアクションのアイコンを変更する。
   * @param {Tab} tab 対象のタブ.
   * @param {Promise} promiseが返る。
   */
  function reloadBrowserIcon(tab)
  {
    debug('reloadBrowserIcon');

    var deferred = Promise.defer();

    var changeIcon = disableTimer ? DISABLE_TIMER : checkExcludeList(tab.url);
    chrome.browserAction.setIcon(
      { path: icons[changeIcon], tabId: tab.id }, function() {
        if (chrome.runtime.lastError) {
          error(chrome.runtime.lastError.message);
          deferred.reject();
          return;
        }
        currentIcon = changeIcon;

        var ALL_VALUES_EXCEPT_KEYBIND =
          DISABLE_TIMER |
          NORMAL_EXCLUDE | USE_EXCLUDE | TEMP_EXCLUDE | EXTENSION_EXCLUDE;
        var title = 'Tab Memory Purge\n';
        switch (changeIcon & ALL_VALUES_EXCEPT_KEYBIND) {
          case DISABLE_TIMER:
            title += "The purging timer of the all tabs has stopped.";
            break;
          case NORMAL_EXCLUDE:
            title += "The url of this tab isn't include exclude list.";
            break;
          case USE_EXCLUDE:
            title += "The url of this tab is included your exclude list.";
            break;
          case TEMP_EXCLUDE:
            title += "The url of this tab is included" +
                    " your temporary exclude list.";
            break;
          case EXTENSION_EXCLUDE:
            title += "The url of this tab is included" +
                    " exclude list of in this extension.";
            break;
          default:
            error('Invalid state. ' + changeIcon);
            deferred.reject();
            break;
        }
        if (changeIcon & KEYBIND_EXCLUDE) {
          title += "\nAnd also included in the exclude list of key bindings.";
        }

        chrome.browserAction.setTitle({ tabId: tab.id, title: title });
        deferred.resolve();
      }
    );

    return deferred.promise;
  }

  /**
   * Return the split object of the arguments of the url.
   *
   * @param {String} url -  the url of getting parameters.
   * @param {String} name -  the target parameter name.
   * @return {String} the string of a parameter.
   */
  function getParameterByName(url, name) {
    debug('getParameterByName', url, name);

    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(decodeURIComponent(url));
    return results === null ?
      "" : decodeURIComponent(results[1].replace(/\+/g, " "));
  }

  /**
   * When purged tabs, return the url for reloading tab.
   *
   * @param {Object} tab - the object of reloading tab.
   * @return {Promise} return the promise object.
   *                  If be ran resolve function,
   *                  return the object that contains the url and iconDataURI.
   *                  but If don't get tab.favIconUrl, don't return iconDataURI.
   */
  function getPurgeURL(tab) {
    debug('getPurgeURL', tab);
    function getURL(tab, iconDataURI)
    {
      debug('getURL', tab, iconDataURI);

      var deferred = Promise.defer();
      setTimeout(function() {
        var args = '' ;

        args += tab.title ?
        '&title=' + encodeURIComponent(tab.title) : '';
        if (iconDataURI) {
          args += '&favicon=' + encodeURIComponent(iconDataURI);
        } else {
          args += tab.favIconUrl ?
            '&favicon=' + encodeURIComponent(tab.favIconUrl) : '';
        }

        var page = blankUrl;
        if (tab.url) {
          args += '&url=' + encodeURIComponent(tab.url);
        }

        deferred.resolve(encodeURI(page) + '?' + encodeURIComponent(args));
      }, 0);
      return deferred.promise;
    }

    var deferred = Promise.defer();
    setTimeout(function() {
      if (toType(tab) !== 'object') {
        error('getPurgeURL is invalid arguments.');
        deferred.reject();
        return;
      }

      if (tab.favIconUrl) {
        getDataURI(tab.favIconUrl).then(function(iconDataURI) {
          getURL(tab, iconDataURI).then(function(url) {
            deferred.resolve({ url: url, iconDataURI: iconDataURI });
          }, deferred.reject);
        }, deferred.reject);
      } else {
        getURL(tab, null).then(function(url) {
          deferred.resolve({ url: url });
        }, deferred.reject);
      }
    }, 0);

    return deferred.promise;
  }

  /**
  * タブの解放を行います。
  * @param {Number} tabId タブのID.
  * @param {Promise} promiseが返る。
  */
  function purge(tabId)
  {
    debug('purge');

    var deferred = Promise.defer();
    setTimeout(function() {
      if (toType(tabId) !== 'number') {
        error("tabId is not number.");
        deferred.reject();
        return;
      }

      if (unloaded.hasOwnProperty(tabId)) {
        log('Already purging. "' + tabId + '"');
        deferred.reject();
        return;
      }

      chrome.tabs.get(tabId, function(tab) {
        if (chrome.runtime.lastError) {
          error(chrome.runtime.lastError.message);
          deferred.reject();
          return;
        }

        var state = checkExcludeList(tab.url);
        if (state & EXTENSION_EXCLUDE) {
          log('The tabId have been included the exclusion list of extension. ' +
              tabId);
          deferred.reject();
          return;
        }

        chrome.tabs.executeScript(
          tabId, { file: getScrollPosScript }, function(scrollPosition) {
            if (chrome.runtime.lastError) {
              error(chrome.runtime.lastError.message);
              deferred.reject();
              return;
            }

            getPurgeURL(tab).then(function(returnObject) {
              var url = returnObject.url;
              var iconURI = returnObject.iconDataURI;

              function afterPurge(updated) {
                if (chrome.runtime.lastError) {
                  error(chrome.runtime.lastError.message);
                  deferred.reject();
                  return;
                }

                unloaded[updated.id] = {
                  title: tab.title,
                  iconDataURI: iconURI || icons[NORMAL_EXCLUDE],
                  url: tab.url,
                  purgeurl: url,
                  scrollPosition: scrollPosition[0] || { x: 0 , y: 0 }
                };

                tabHistory.write(tab).then(deferred.resolve, deferred.reject);
              }

              chrome.tabs.executeScript(tabId, {
                code: 'window.location.replace("' + url + '");' },
              function() {
                chrome.tabs.get(tabId, afterPurge);
              });
            });
          });
        });
    }, 0);
    return deferred.promise;
  }

  /**
  * 解放したタブを復元します。
  * @param {Number} tabId 復元するタブのID.
  * @return {Promise} promiseが返る。
  */
  function unPurge(tabId)
  {
    debug('unPurge', tabId);

    var deferred = Promise.defer();
    setTimeout(function() {
      if (toType(tabId) !== 'number') {
        error("tabId is not number.");
        deferred.reject();
        return;
      }

      var url = unloaded[tabId].url;
      chrome.tabs.sendMessage(tabId,
        { event: 'location_replace' }, function(useChrome) {
          // If the url is empty in purge page.
          if (useChrome) {
            chrome.tabs.update(tabId, { url: url }, deferred.resolve);
          } else {
            deferred.resolve();
          }
        }
      );
    }, 0);
    return deferred.promise;
  }

  /**
  * 解放状態・解放解除を交互に行う
  * @param {Number} tabId 対象のタブのID.
  * @return {Promise} promiseが返る。
  */
   function purgeToggle(tabId)
  {
    debug('purgeToggle');
    var deferred = Promise.defer();
    setTimeout(function() {
      if (toType(tabId) !== 'number') {
        error("tabId is not number.");
        deferred.reject();
        return;
      }

      if (unloaded.hasOwnProperty(tabId)) {
        unPurge(tabId).then(deferred.resolve, deferred.reject);
      } else {
        purge(tabId).then(deferred.resolve, deferred.reject);
      }
    }, 0);
    return deferred.promise;
  }

  /**
  * 定期的に実行される関数。アンロードするかどうかを判断。
  * @param {Number} tabId 処理を行うタブのID.
  * @return {Promise} Promiseが返る。
  */
  function tick(tabId)
  {
    debug('tick');
    var deferred = Promise.defer();
    setTimeout(function() {
      if (toType(tabId) !== 'number' || unloaded.hasOwnProperty(tabId)) {
        error("tabId isn't number or added to unloaded already. " + tabId);
        deferred.reject();
        return;
      }

      chrome.tabs.get(tabId, function(tab) {
        if (chrome.runtime.lastError) {
          log('tick function is skipped.', tabId);
          deferred.reject();
          return;
        }

        // アクティブタブへの処理の場合、行わない
        if (tab.active) {
          // アクティブにしたタブのアンロード時間更新
          setTick(tabId).then(deferred.resolve, deferred.reject);
        } else {
          purge(tabId).then(deferred.resolve, deferred.reject);
        }
      });
    }, 0);
    return deferred.promise;
  }

  /**
  * 定期的な処理を停止
  * @param {Number} tabId 停止するタブのID.
  */
  function deleteTick(tabId)
  {
    debug('deleteTick');
    if (ticked.hasOwnProperty(tabId)) {
      clearInterval(ticked[tabId]);
      delete ticked[tabId];
    }
  }

  /**
  * 定期的に解放処理の判断が行われるよう設定します。
  * 既に設定済みなら時間を延長します。
  * @param {Number} tabId 設定するタブのID.
  * @return {Promise} Promiseが返る。
  */
  function setTick(tabId)
  {
    debug('setTick');
    var deferred = Promise.defer();

    setTimeout(function() {
      if (disableTimer) {
        deferred.resolve();
        return;
      }

      if (toType(tabId) !== 'number') {
        error("tabId is not number.");
        deferred.reject();
        return;
      }

      chrome.tabs.get(tabId, function(tab) {
        if (chrome.runtime.lastError) {
          log('setTick function is skipped.');
          deferred.resolve();
          return;
        }

        // 全ての除外アドレス一覧と比較
        var state = checkExcludeList(tab.url);
        if (state & NORMAL_EXCLUDE) { // 除外アドレスに含まれていない場合
          // 分(設定) * 秒数 * ミリ秒
          var timer = parseInt(myOptions.timer, 10) * 60 * 1000;

          // Update.
          deleteTick(tabId);
          ticked[tabId] = setInterval(function() { tick(tabId); } , timer);
        } else { // include exclude list
          deleteTick(tabId);
        }

        deferred.resolve();
      });
    }, 0);
    
    return deferred.promise;
  }

  /**
  * 指定した辞書型の再帰処理し、タブを復元する。
  * 引数は第一引数のみを指定。
  *
  * @param {Object} object オブジェクト型。これのみを指定する.
  *                        基本的にオブジェクト型unloaded変数のバックアップを渡す.
  * @param {Array} keys オブジェクト型のキー名の配列.省略可能.
  * @param {Number} index keysの再帰処理開始位置.デフォルトは0、省略可能.
  * @param {Number} end keysの最後の要素から一つ後の位置.
  *                     デフォルトはkeys.length、省略可能.
  * @return {Promise} promiseが返る。
  */
 function restore(object, keys, index, end)
 {
   debug('restore');

   var deferred = Promise.defer();
   setTimeout(function restore_inner(object, keys, index, end) {
     // 最後まで処理を行ったらunloadedに上書き
     if (index >= end) {
       for (var k in object) {
         if (object.hasOwnProperty(k) && !unloaded.hasOwnProperty(k)) {
           unloaded[k] = object[k];
         }
       }
       deferred.resolve(true);
       return;
     }

     // 初期値
     if (toType(keys) !== 'array') {
       keys = [];
       for (var key in object) {
         if (object.hasOwnProperty(key)) {
           keys.push(key);
         }
       }
       index = 0;
       end = keys.length;
     }

     var tabId = parseInt(keys[index], 10);
     chrome.tabs.get(tabId, function(tab) {
       // If occur a error and tab is undefined, it is ignore.
       if (chrome.runtime.lastError || tab === void 0) {
         if (tab !== void 0 && isReleasePage(tab.url)) {
           restore_inner(object, keys, ++index, end);
           return;
         }

         // タブが存在しない場合、新規作成
         var purgeurl = object[tabId].purgeurl;
         chrome.tabs.create({ url: purgeurl, active: false }, function(tab) {
           if (chrome.runtime.lastError) {
             error(chrome.runtime.lastError.message);
           } else {
             var temp = object[tabId];
             delete object[tabId];
             object[tab.id] = temp;
           }

           restore_inner(object, keys, ++index, end);
         });
       } else {
         restore_inner(object, keys, ++index, end);
       }
     });
   }(object, keys, index, end), 0);
   return deferred.promise;
  }

  function switchTempRelease(url)
  {
    debug('switchTempRelease', url);

    var index = tempRelease.indexOf(url);
    if (index === -1) {
      // push url in tempRelease.
      tempRelease.push(url);
    } else {
      // remove url in tempRelease.
      tempRelease.splice(index, 1);
    }
  }

  /**
  * 非解放・非解放解除を交互に行う
  * @param {Tab} tab 対象のタブオブジェクト.
  */
  function tempReleaseToggle(tab)
  {
    debug('tempReleaseToggle');

    switchTempRelease(tab.url);
    setTick(tab.id);
    reloadBrowserIcon(tab);
  }

  /**
  * 指定されたタブに最も近い未解放のタブをアクティブにする。
  * 右側から探索され、見つからなかったら左側を探索する。
  * 何も見つからなければ新規タブを作成してそのタブをアクティブにする。
  * @param {Tab} tab 基準点となるタブ.
  * @return {Promise} promiseが返る。
  */
 function searchUnloadedTabNearPosition(tab)
  {
    debug('searchUnloadedTabNearPosition');

    var deferred = Promise.defer();

    // 現在のタブの左右の未解放のタブを選択する
    chrome.windows.get(tab.windowId, { populate: true }, function(win) {
      if (chrome.runtime.lastError) {
        error(chrome.runtime.lastError.message);
        deferred.reject();
        return;
      }

      var tabs = win.tabs.filter(function(v) {
        return !unloaded.hasOwnProperty(v.id) && !isReleasePage(v.url);
      });
      var t = tabs.filter(function(v) {
        return v.index >= tab.index;
      });
      var tLength = 0;
      if (t.length === 0) {
        t = tabs.filter(function(v) {
          return v.index < tab.index;
        });
        tLength = t.length - 1;
      }

      if (t.length > 0) {
        // If found tab, It's active.
        chrome.tabs.update(t[tLength].id, { active: true }, deferred.resolve);
      } else {
        // If can not find the tab to activate to create a new tab.
        chrome.tabs.create({ active: true }, deferred.resolve);
      }
    });

    return deferred.promise;
  }

  /**
   * the context menu is initializing.
   * @return {Promise} promiseが返る。
   */
  function initializeContextMenu()
  {
    debug('initializeContextMenu');

    var deferred = Promise.defer();
    // Remove all context menu.
    // then create context menu on the browser action.
    chrome.contextMenus.removeAll(function() {
      var parentMenuId = 'parentMenu';
      chrome.contextMenus.create(
        { id: parentMenuId,
          title: chrome.i18n.getMessage('optionPage'),
          contexts: ['browser_action'] },
        function() {
          optionMenus.forEach(function(value, i) {
            chrome.contextMenus.create(
              { id: i.toString(),
                title: chrome.i18n.getMessage(value.name),
                parentId: parentMenuId,
                contexts: ['browser_action'] });
          });

          deferred.resolve(true);
        }
      );
      chrome.contextMenus.create(
        { id: switchDisableTimerMenuItemId,
          title: chrome.i18n.getMessage('switchTimer'),
          contexts: ['browser_action'] });
      chrome.contextMenus.create(
        { id: excludeDialogMenuItemId,
          title: chrome.i18n.getMessage('add_current_tab_exclude_list'),
          contexts: ['browser_action'] });
    });
    return deferred.promise;
  }

  /**
   * 拡張機能がインストールされたときの処理
   */
  function onInstall() {
    debug('Extension Installed.');

    return new Promise(function(resolve) {
      // インストール時にオプションページを表示
      chrome.tabs.create({ url: optionPage }, resolve);
    });
  }

  /**
   * 拡張機能がアップデートされたときの処理
   */
  function onUpdate() {
    debug('Extension Updated.');

    return new Promise(function(resolve, reject) {
      getInitAndLoadOptions().then(function(options) {
        // the changed history of the option menu.
        displayPageOfOption = "updated";
        chrome.tabs.create({ url: optionPage }, resolve);

        if (options.when_updated_restore_session) {
          var sessions = JSON.parse(options[sessionKey]);
          if (sessions.length > 0) {
            restore(sessions[sessions.length - 1].session).then(function() {
              return new Promise(function(resolve) {
                log('restore is completed.');
                resolve();
              });
            }).then(resolve, reject);
            return;
          }
        }
        resolve();
      }, reject);
    });
  }

  /**
   * 拡張機能のバージョンを返す
   * @return {String} 拡張機能のバージョン.
   */
  function getVersion() {
    debug('getVersion');
    var details = chrome.app.getDetails();
    return details.version;
  }

  function versionCheckAndUpdate()
  {
    debug('versionCheckUpdate');

    var deferred = Promise.defer();
    var currVersion = getVersion();
    chrome.storage.local.get(versionKey, function(storages) {
      function update()
      {
        return new Promise(function(resolve) {
          var write = {};
          write[versionKey] = currVersion;
          chrome.storage.local.set(write, resolve);
        });
      }

      if (chrome.runtime.lastError) {
        error(chrome.runtime.lastError.message);
        deferred.reject();
        return;
      }

      // ver chrome.storage.
      var prevVersion = storages[versionKey];
      if (currVersion !== prevVersion) {
        // この拡張機能でインストールしたかどうか
        if (prevVersion === void 0) {
          onInstall().then(update).then(deferred.resolve, deferred.reject);
        } else {
          onUpdate().then(update).then(deferred.resolve, deferred.reject);
        }
      } else {
        deferred.resolve();
      }
    });
    return deferred.promise;
  }

  /**
   * getInitAndLoadOptions
   * Load my options in chrome.storage.
   * And If an item doesn't contain to default values, it is deleted.
   * And those are deleted too from chrome.storage.
   *
   * @return {Promise} return promise.
   *                   If returned reject, return a error message.
   *                   If returned resolve, return getting my options.
   */
  function getInitAndLoadOptions()
  {
    debug('getInitAndLoadOptions');

    var deferred = Promise.defer();
    chrome.storage.local.get(null, function(items) {
      if (chrome.runtime.lastError) {
        error(chrome.runtime.lastError.message);
        deferred.reject();
        return;
      }
      var key;

      // All remove invalid options. but exclude version.
      var removeKeys = [];
      for (key in items) {
        if (items.hasOwnProperty(key) && !defaultValues.hasOwnProperty(key)) {
          removeKeys.push(key);
          delete items[key];
        }
      }

      chrome.storage.local.remove(removeKeys, function() {
        if (chrome.runtime.lastError) {
          error(chrome.runtime.lastError.message);
          deferred.reject();
          return;
        }

        // My options are initialized.
        var options = items;
        for (key in defaultValues) {
          if (defaultValues.hasOwnProperty(key) &&
              !options.hasOwnProperty(key)) {
            options[key] = defaultValues[key];
          }
        }

        deferred.resolve(options);
      });
    });
    return deferred.promise;
  }

  /**
   * be initializing.
   */
  function initialize()
  {
    debug('initialize');

    versionCheckAndUpdate()
    .then(getInitAndLoadOptions)
    .then(function(options) {
      myOptions = options;

      initializeContextMenu();
      chrome.browserAction.setBadgeBackgroundColor({ color: '#0066FF' });

      // initialize badge.
      chrome.browserAction.setBadgeText({ text: unloadedCount.toString() });

      // initialize history.
      tabHistory.read(myOptions.history).then(function() {
        tabHistory.setMaxHistory(parseInt(myOptions.max_history, 10));
      });

      // initialize session.
      tabSession.read(myOptions[sessionKey]).then(function() {
        tabSession.setMaxSession(parseInt(myOptions.max_sessions, 10));
      });

      // Apply timer to exist tabs.
      chrome.tabs.query({}, function(tabs) {
        if (chrome.runtime.lastError) {
          error(chrome.runtime.lastError.message);
          return;
        }

        function toAdd(current, iconURI)
        {
          if (isReleasePage(current.url)) {
            unloaded[current.id] = {
              title          : current.title,
              iconURI        : iconURI || icons[NORMAL_EXCLUDE],
              url            : getParameterByName(current.url, 'url'),
              purgeurl       : current.url,
              scrollPosition : { x: 0 , y: 0 },
            };
          }
          setTick(current.id);
        }

        // If already purging tab, be adding the object of purging tab.
        tabs.forEach(function(v) {
          var result = checkExcludeList(v.url);
          if (result & NORMAL_EXCLUDE) {
            if (v.favIconUrl) {
              getDataURI(v.favIconUrl).then(function(response) {
                toAdd(v, response);
              });
            } else {
              toAdd(v);
            }
          }
        });
      });

      initializeContextMenu();
      chrome.browserAction.setBadgeBackgroundColor({ color: '#0066FF' });
    });
  }

  /**
   * This function will check memory capacity.
   * If the memory is shortage, return true.
   *
   * @param criteria_memory_size criteria memory size(MByte).
   * @return {Promise} promiseが返る。
   */
  function isLackTheMemory(criteria_memory_size)
  {
    debug('isLackTheMemory');

    var deferred = Promise.defer();
    chrome.system.memory.getInfo(function(info) {
      if (chrome.runtime.lastError) {
        error(chrome.runtime.lastError.message);
        deferred.reject();
        return;
      }

      var ratio = info.availableCapacity / Math.pow(1024.0, 2);
      debug('availableCapacity(MByte):', ratio);
      if (ratio < parseFloat(criteria_memory_size)) {
        deferred.resolve(true);
      } else {
        deferred.resolve(false);
      }
    });
    return deferred.promise;
  }

  /**
   * This function repeats the process of releasing the tab
   * when the memory is shortage.
   *
   * @param ids target array of the id of the tabs.
   * @return {Promise} promiseが返る。
   */
  function autoPurgeLoop(ids)
  {
    debug('autoPurgeLoop');

    var deferred = Promise.defer();
    setTimeout(function() {
      function autoPurgeLoop_inner(ids, index) {
        index = (toType(index) === 'number') ? index : 0;
        if (ids.length <= index) {
          deferred.resolve('autoPurgeLoop is out of length.');
          return;
        }

        tick(ids[index]).then(function() {
          isLackTheMemory(myOptions.remaiming_memory).then(function(result) {
            if (result) {
              autoPurgeLoop_inner(ids, index + 1);
            } else {
              deferred.resolve();
            }
          });
        });
      }
      autoPurgeLoop_inner(ids);
    }, 0);
    return deferred.promise;
  }

  /**
   * check run auto purge or not.
   * @return {Promise} promiseが返る。
   */
  function autoPurgeCheck()
  {
    debug('autoPurgeCheck');
    var deferred = Promise.defer();
    setTimeout(function() {
      if (myOptions.enable_auto_purge) {
        isLackTheMemory(myOptions.remaiming_memory).then(function(result) {
          if (result) {
            var ids = [];
            for (var i in ticked) {
              if (ticked.hasOwnProperty(i)) {
                ids.push(parseInt(i, 10));
              }
            }
            autoPurgeLoop(ids).then(deferred.resolve, deferred.reject);
          } else {
            deferred.resolve();
          }
        });
      }
    }, 0);
    return deferred.promise;
  }

  /**
   * onActivatedFunc
   *
   * @param tabId the id of the tab.
   * @return {Promise} promiseが返る。
   */
  function onActivatedFunc(tabId)
  {
    debug('onActivatedFunc', tabId);
    var deferred = Promise.defer();
    chrome.tabs.get(tabId, function(tab) {
      if (chrome.runtime.lastError) {
        error(chrome.runtime.lastError.message);
        deferred.reject();
        return;
      }

      if (myOptions.purging_all_tabs_except_active) {
        purgingAllTabsExceptForTheActiveTab();
      }

      // アイコンの状態を変更
      reloadBrowserIcon(tab);

      // 前にアクティブにされていたタブのアンロード時間を更新
      if (oldActiveIds[tab.windowId]) {
        setTick(oldActiveIds[tab.windowId]);
      }
      oldActiveIds[tab.windowId] = tabId;

      deferred.resolve();
    });
    return deferred.promise;
  }

  chrome.tabs.onActivated.addListener(function(activeInfo) {
    debug('chrome.tabs.onActivated.', activeInfo);
    if (unloaded.hasOwnProperty(activeInfo.tabId) && !myOptions.no_release) {
      unPurge(activeInfo.tabId).then(function() {
        return onActivatedFunc(activeInfo.tabId);
      });
    } else {
      onActivatedFunc(activeInfo.tabId);
    }
  });

  chrome.tabs.onCreated.addListener(function(tab) {
    debug('chrome.tabs.onCreated.', tab);
    setTick(tab.id).then(function() {
      return new Promise(function(resolve, reject) {
        if (myOptions.purging_all_tabs_except_active) {
          purgingAllTabsExceptForTheActiveTab().then(resolve, reject);
        } else {
          resolve();
        }
      });
    }).then(autoPurgeCheck);
  });

  chrome.tabs.onRemoved.addListener(function(tabId) {
    debug('chrome.tabs.onRemoved.', tabId);
    delete unloaded[tabId];
  });

  chrome.tabs.onAttached.addListener(function(tabId) {
    debug('chrome.tabs.onAttached.', tabId);
    setTick(tabId).then(function() {
      return new Promise(function(resolve, reject) {
        if (myOptions.purging_all_tabs_except_active) {
          purgingAllTabsExceptForTheActiveTab().then(resolve, reject);
        } else {
          resolve();
        }
      });
    });
  });

  chrome.tabs.onDetached.addListener(function(tabId) {
    debug('chrome.tabs.onDetached.', tabId);
    delete unloaded[tabId];
  });

  function purgingAllTabsExceptForTheActiveTab()
  {
    /*jshint loopfunc: true*/
    debug('purgingAllTabsExceptForTheActiveTab');

    var deferred = Promise.defer();
    chrome.tabs.query({}, function(tabs) {
      var maxOpeningTabs = myOptions.max_opening_tabs;
      var t = tabs.filter(function(v) {
        return !isReleasePage(v.url);
      });

      var alreadyPurgedLength = tabs.length - t.length;
      var maxLength = tabs.length - alreadyPurgedLength - maxOpeningTabs;
      if (maxLength <= 0) {
        debug("The counts of open tabs are within set value.");
        deferred.reject();
        return;
      }

      t = t .filter(function(v) {
        return !v.active && (checkExcludeList(v.url) & NORMAL_EXCLUDE) !== 0;
      });

      for (var j = 0, lenJ = t.length; j < lenJ && j < maxLength; j++) {
        purge(t[j].id);
      }

      deferred.resolve();
    });
    return deferred.promise;
  }

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'loading') {
      debug('chrome.tabs.onUpdated. loading.', tabId, changeInfo, tab);

      if (!isReleasePage(tab.url) && unloaded.hasOwnProperty(tabId)) {
        delete unloaded[tabId];
      }

      if (myOptions.purging_all_tabs_except_active) {
        purgingAllTabsExceptForTheActiveTab();
      }

      // 自動開放処理が有効かつメモリ不足の場合は
      // アクティブタブと除外対象以外を自動開放。
      autoPurgeCheck();
    } else {
      debug('chrome.tabs.onUpdated. complete.', tabId, changeInfo, tab);
      reloadBrowserIcon(tab);

      // 解放解除時に動作。
      // 指定したタブの解放時のスクロール量があった場合、それを復元する
      var scrollPos = tempScrollPositions[tabId];
      if (toType(scrollPos) === 'object') {
        chrome.tabs.executeScript(
          tabId, { code: 'scroll(' + scrollPos.x + ', ' + scrollPos.y + ');' },
          function() {
            if (chrome.runtime.lastError) {
              error(chrome.runtime.lastError.message);
            }

            delete tempScrollPositions[tabId];
          }
        );
      } else {
        delete tempScrollPositions[tabId];
      }
    }
  });

  chrome.windows.onRemoved.addListener(function(windowId) {
    debug('chrome.windows.onRemoved.', windowId);
    delete oldActiveIds[windowId];
  });

  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    debug('chrome.runtime.onMessage.', message, sender);
    switch (message.event) {
      case 'initialize':
        initialize();
        break;
      case 'release':
        getCurrentTab().then(function(tab) {
          return new Promise(function(resolve, reject) {
            purgeToggle(tab.id).then(function() {
              return searchUnloadedTabNearPosition(tab);
            }, reject)
            .then(resolve, reject);
          });
        });
        break;
      case 'switch_not_release':
        getCurrentTab().then(function(tab) {
          return new Promise(function(resolve) {
            tempReleaseToggle(tab);
            resolve();
          });
        });
        break;
      case 'all_purge':
      case 'all_purge_without_exclude_list':
        chrome.tabs.query({}, function(results) {
          if (chrome.runtime.lastError) {
            error(chrome.runtime.lastError.message);
            return;
          }

          var t = results.filter(function(v) {
            var state = checkExcludeList(v.url);
            return !unloaded.hasOwnProperty(v.id) &&
                   ((message.event === 'all_purge') ?
                    EXTENSION_EXCLUDE ^ state : NORMAL_EXCLUDE & state) !== 0;
          });
          if (t.length === 0) {
            return;
          }
          results = t;

          var p = [];
          results.forEach(function(v) {
            p.push(purge(v.id));
          });
          Promise.all(p).then(function() {
            return new Promise(function(resolve, reject) {
              getCurrentTab()
              .then(searchUnloadedTabNearPosition)
              .then(resolve, reject);
            });
          });
        });
        break;
      case 'all_unpurge':
        // 解放されている全てのタブを解放解除
        for (var key in unloaded) {
          if (unloaded.hasOwnProperty(key)) {
            unPurge(parseInt(key, 10));
          }
        }
        break;
      case 'add_to_temp_exclude_list':
        getCurrentTab().then(function(tab) {
          return new Promise(function(resolve, reject) {
            var index = tempRelease.indexOf(tab.url);
            if (index === -1) {
              tempRelease.push(tab.url);
              setTick(tab.id).then(function() {
                return reloadBrowserIcon(tab);
              }, reject)
              .then(resolve, reject);
            } else {
              resolve();
            }
          });
        });
        break;
      case 'load_options_and_reload_current_tab':
        getCurrentTab().then(function(tab) {
          return new Promise(function(resolve, reject) {
            getInitAndLoadOptions().then(function(options) {
              myOptions = options;

              setTick(tab.id).then(function() {
                return reloadBrowserIcon(tab);
              }, reject)
              .then(resolve, reject);
            });
          });
        });
        break;
      case 'deleteHistory':
        tabHistory.remove(new Date(message.date));
        break;
      case 'deleteHistoryItem':
        tabHistory.removeItem(new Date(message.date), message.item);
        break;
      case 'deleteSession':
        tabSession.remove(new Date(message.session.date));
        break;
      case 'deleteSessionItem':
        tabSession.removeItem(new Date(message.session.date), message.key);
        break;
      case 'restore':
        restore(message.session).then(function() {
          return new Promise(function(resolve) {
            log('restore is completed.');
            resolve();
          });
        });
        break;
      case 'current_icon':
        sendResponse(currentIcon);
        break;
      case 'display_option_page':
        sendResponse(displayPageOfOption);
        displayPageOfOption = null;
        break;
      case 'keybind_check_exclude_list':
        var state = checkExcludeList(message.location.href);
        sendResponse(state ^ (EXTENSION_EXCLUDE | KEYBIND_EXCLUDE));
        break;
    }
  });

  function switchDisableTimerState()
  {
    debug('switchDisableTimerState');

    return new Promise(function(resolve, reject) {
      function lastProcess()
      {
        disableTimer = disableTimer ? false : true;
        getCurrentTab().then(reloadBrowserIcon).then(resolve, reject);
      }

      if (disableTimer) {
        chrome.tabs.query({}, function(tabs) {
          if (chrome.runtime.lastError) {
            error(chrome.runtime.lastError.message);
            reject();
            return;
          }

          tabs.forEach(function(v) {
            var result = checkExcludeList(v.url);
            if (result & NORMAL_EXCLUDE && !isReleasePage(v.url)) {
              setTick(v.id);
            }
          });
          lastProcess();
        });
      } else {
        for (var i in ticked) {
          if (ticked.hasOwnProperty(i)) {
            clearInterval(ticked[i]);
          }
        }
        ticked = {};
        lastProcess();
      }
    });
  }

  chrome.contextMenus.onClicked.addListener(function(info) {
    debug('chrome.contextMenus.onClicked.addListener', info);
    switch (info.menuItemId) {
    case excludeDialogMenuItemId:
      getCurrentTab().then(function(tab) {
        return new Promise(function(resolve) {
          chrome.tabs.sendMessage(
            tab.id, { event: 'showExcludeDialog' }, resolve);
        });
      });
      break;
    case switchDisableTimerMenuItemId:
      switchDisableTimerState();
      break;
    default:
      chrome.tabs.query({ url: optionPage }, function(results) {
        if (chrome.runtime.lastError) {
          error(chrome.runtime.lastError.message);
          return;
        }

        if (results.length === 0) {
          displayPageOfOption = parseInt(info.menuItemId, 10);
          chrome.tabs.create({ url: optionPage });
        } else {
          chrome.tabs.update(results[0].id, { active: true }, function() {
            if (chrome.runtime.lastError) {
              error(chrome.runtime.lastError.message);
              return;
            }

            chrome.tabs.sendMessage(results[0].id,
              { event: 'contextMenus', index: info.menuItemId });
          });
        }
      });
      break;
    }
  });

  initialize();
})();
