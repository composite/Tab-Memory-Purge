/** blank.htmlで行う処理のスクリプトファイル */
(function(window, document) {
  "use strict";

  // variables.//{{{
  var db = null;

  var sNumMaxRecorsiveCount = 3;

  const sElementIcon  = document.querySelector('#favicon');
  const sElementTitle = document.querySelector('#title');
  const sElementUrl   = document.querySelector('#url');

  const gObjF5Key = generateKeyString({
    ctrl    : false,
    alt     : false,
    shift   : false,
    meta    : false,
    keyCode : 116,
  });
  //}}}

  function navigateToPageBeforePurged()//{{{
  {
    var lObjArgs = getQueryString(document);
    if (lObjArgs.url) {
      window.location.replace(lObjArgs.url);
    }
  }//}}}

  function getDataOfBeforeToPurge()//{{{
  {
    var lStrUrl      = "";
    var lStrNewTitle = "";
    var lElFavicon   = document.createDocumentFragment();
    var lStrHost     = "";

    lStrUrl = sElementUrl.textContent;
    return ajax({ url: lStrUrl, responseType: 'document' })
    .then(pObjResult => {
      if (pObjResult.status === 200) {
        lStrNewTitle = pObjResult.response.title;
        if (lStrNewTitle) {
          document.title            = lStrNewTitle;
          sElementTitle.textContent = lStrNewTitle;
          sElementTitle.removeAttribute('style');

          lElFavicon =
            pObjResult.response.querySelector('link[rel="shortcut icon"]');
          lStrHost   = getHostName(lStrUrl);

          db.add({
            name: gStrDbPageInfoName,
            data: {
              url:   lStrUrl,
              title: lStrNewTitle || 'Unknown',
              host:  lStrHost,
            },
          });

          if (lElFavicon) {
            getDataURI(lElFavicon.href)
            .then(pStrIconDataURI => {
              db.add({
                name: gStrDbDataURIName,
                data: {
                  host:    lStrHost,
                  dataURI: pStrIconDataURI,
                }
              });
            });
          }
        }
        return loadPurgedTabInfo();
      }
    });
  }//}}}

  function loadPurgedTabInfo()
  {
    var lObjArgs    = {};
    var lStrUrl     = '';
    var lStrName    = '';
    var lStrFavicon = '';

    var lElSpan = document.createDocumentFragment();
    var lElA    = document.createDocumentFragment();
    var lElHead = document.createDocumentFragment();
    var lElLink = document.createDocumentFragment();

    return new Promise((resolve, reject) => {
      lObjArgs = getQueryString(document);

      (() => {
        return new Promise(resolve => {
          chrome.runtime.sendMessage(
            { event: 'check_purged_tab', url: lObjArgs.url }, resolve);
        });
      })()
      .then(() => {
        lElSpan = sElementUrl;
        while (lElSpan.firstChild) {
          lElSpan.removeChild(lElSpan.firstChild);
        }

        if (lObjArgs.url) {
          lStrUrl        = lObjArgs.url;
          lElA           = document.createElement('a');
          lElA.href      = lStrUrl;
          lElA.innerText = lStrUrl;
          lElSpan.appendChild(lElA);
        } else {
          lElSpan.innerHTML = 'None';
          reject(new Error("Doesn't get a purged url."));
          return;
        }

        return db.get({
          name : gStrDbPageInfoName,
          key  : lObjArgs.url,
        });
      })
      .then(pageInfo => {
        if (pageInfo === void 0 || pageInfo === null) {
          document.title = sElementUrl.textContent;
          sElementTitle.setAttribute('style', 'display: none');

          (() => {
            lStrName = 'get_title_when_does_not_title';
            chrome.storage.local.get(lStrName, items => {
              if (items.hasOwnProperty(lStrName) &&
                  items[lStrName] === true &&
                  sNumMaxRecorsiveCount >= 0) {
                console.log('MaxRecorsiveCount is ', sNumMaxRecorsiveCount);

                --sNumMaxRecorsiveCount;

                getDataOfBeforeToPurge().then(resolve).catch(reject);
              } else {
                reject(new Error("Doesn't get a title of a purged tab."));
              }
            });
          })();
        } else if (pageInfo.title === 'Unknown') {
            db.delete({ name: gStrDbPageInfoName, keys: pageInfo.url })
            .then(getDataOfBeforeToPurge)
            .catch(reject);
        } else {
          document.title            = pageInfo.title;
          sElementTitle.textContent = pageInfo.title;
        }

        return db.get({
          name : gStrDbDataURIName,
          key  : pageInfo.host,
        });
      })
      .then(dataURIInfo => {
        if (dataURIInfo !== void 0 && dataURIInfo !== null) {
          lStrFavicon  = dataURIInfo.dataURI;

          lElHead      = document.querySelector('head');
          lElLink      = document.createElement('link');
          lElLink.rel  = 'shortcut icon';
          lElLink.href = decodeURIComponent(lStrFavicon);
          lElHead.appendChild(lElLink);

          sElementIcon.src = lStrFavicon;
          removeStringFromAttributeOfElement(
            sElementIcon, 'class', 'doNotShow');
        }
      })
      .then(resolve)
      .catch(reject);
    });
  }

  document.addEventListener('click', navigateToPageBeforePurged, true);

  document.addEventListener('keydown', e => {//{{{
    if (gObjF5Key === generateKeyString(keyCheck(e))) {
      navigateToPageBeforePurged();
    }
  }, true);//}}}

  document.addEventListener('DOMContentLoaded', () => {//{{{
    (() => {
      db = new Database(gStrDbName, gNumDbVersion);
      return db.open(gObjDbCreateStores);
    })()
    .then(loadPurgedTabInfo);
  });//}}}

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {//{{{
      switch (message.event) {
        case 'location_replace':
          var lStrUrl = document.getElementById('url');
          if (lStrUrl.textContent.length === 0) {
            sendResponse(true);
          } else {
            window.location.replace(lStrUrl.textContent);
            sendResponse(false);
          }
          break;
      }
    }
  );//}}}
})(this, this.document);
