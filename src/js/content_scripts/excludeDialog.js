(function(window, document) {
  "use strict";

  function getNumber(pStrTarget) {//{{{
    var lArrayResult = pStrTarget.match(/(\d+)/);
    if (lArrayResult === null) {
      throw new Error("Doesn't get width and height.");
    } else {
      return parseInt(lArrayResult[1], 10);
    }
  }//}}}

  function getPathNames()//{{{
  {
    var lStrReplacedPathName =
      window.location.pathname.replace(/(^\/|\/$)/g, '');
    var lArrayPathName = lStrReplacedPathName.split('/');
    if (lArrayPathName && lStrReplacedPathName.length > 0) {
      return lArrayPathName;
    } else {
      return null;
    }
  }//}}}

  function getHosts()//{{{
  {
    var lRegexHost = /^(\w+)[.]+(.*):*(\d*)/i;
    var lArrayHostMatch = window.location.hostname.match(lRegexHost);
    if (lArrayHostMatch) {
      return lArrayHostMatch.filter((v, i) => (i !== 0 && v !== ""));
    } else {
      return [ window.location.hostname ];
    }
  }//}}}

  function initTextStyle(pElement)//{{{
  {
    pElement.style.fontFamily = 'sans-serif';
    pElement.style.fontSize   = sStrStyleBaseFontSize;
    textStyleLikeAdobe(pElement);
  }//}}}

  function textStyleLikeAdobe(pElement)//{{{
  {
    pElement.style.color      = sStrStyleFontColor;
    pElement.style.textshadow = `0 0 1px rgba(${sStrStyleFontColor}, .1)`;
    pElement.style.fontSmoothing = 'antialiased';
  }//}}}

  function createParentElement()//{{{
  {
    var lElParentDiv = sElDiv.cloneNode();
    lElParentDiv.style.position   = 'fixed';
    lElParentDiv.style.background = sStrStyleLightPrimaryColor;
    lElParentDiv.style.boxShadow  = `0px 1px 3px 0 ${sStrBorderColor}`;
    lElParentDiv.style.width      = "42em";
    lElParentDiv.style.height     = "32em";
    lElParentDiv.style.display    = 'none';
    lElParentDiv.style.zIndex     = '100';

    lElParentDiv.style.left =
      (window.innerWidth - getNumber(lElParentDiv.style.width) *
      getNumber(sStrStyleBaseFontSize)) / 2.0 + 'px';
    lElParentDiv.style.top =
      (window.innerHeight - getNumber(lElParentDiv.style.height) *
      getNumber(sStrStyleBaseFontSize)) / 2.0 + 'px';

    return lElParentDiv;
  }//}}}

  // title
  function createTitleBar()//{{{
  {
    var lElTitleBar       = sElDiv.cloneNode();
    var lElTitle          = sElSpan.cloneNode();
    var lElTitleBarButton = sElButton.cloneNode();

    lElTitleBar.style.padding    = '1em';
    lElTitleBar.style.fontWeight = 'bold';
    lElTitleBar.style.background = sStrStylePrimaryColor;

    lElTitle.style.fontSize = '1.5em';
    lElTitle.textContent    = "Tab Memory Purge";

    lElTitleBarButton.style.position = 'absolute';
    lElTitleBarButton.style.right    = '1em';
    lElTitleBarButton.textContent    = "x";
    lElTitleBarButton.onclick        = parentClose;

    lElTitleBar.appendChild(lElTitle);
    lElTitleBar.appendChild(lElTitleBarButton);

    return lElTitleBar;
  }//}}}

  // inside exclude dialog.
  function createExcludeDialog()//{{{
  {
    var lStrDialog     = sElDiv.cloneNode();
    var lElUrl         = sElDiv.cloneNode();
    var lElMessage1    = sElDiv.cloneNode();
    var lElMessage2    = sElDiv.cloneNode();
    var lElMessage2In1 = sElDiv.cloneNode();
    var lElMessage2In2 = sElDiv.cloneNode();
    var lElRangess     = sElDiv.cloneNode();
    var lElSpanHost    = sElSpan.cloneNode();
    var lElInputHost   = sElInput.cloneNode();
    var lElPageSpan    = document.createDocumentFragment();
    var lElPage        = document.createDocumentFragment();

    lStrDialog.style.padding   = "1em";
    lStrDialog.style.textAlign = "center";

    lElUrl.style.fontSize = '1.5em';
    lElUrl.style.padding  = '2em 0';
    lElUrl.textContent    = sStrUri;

    lElMessage1.textContent    = chrome.i18n.getMessage('exclude_dialog_mes1');

    lElMessage2In1.textContent = chrome.i18n.getMessage('exclude_dialog_mes2');
    lElMessage2In2.textContent = chrome.i18n.getMessage('exclude_dialog_mes3');

    lElSpanHost.style.padding = "0 1.5em;";
    lElSpanHost.textContent   = "Host:";

    lElInputHost.min   = 0;
    lElInputHost.max   = sArrayHosts.length-1;
    lElInputHost.value = 0;
    lElInputHost.addEventListener('change', pEvent => {
      var i   = 0;
      var lStrHostName = sStrHostName;

      i = 0;
      while (i < pEvent.target.value) {
        lStrHostName = lStrHostName.replace(sArrayHosts[i], '*');
        ++i;
      }
      lElUrl.textContent = lStrHostName + sStrPathName;
    });

    lElMessage2.appendChild(lElMessage2In1);
    lElMessage2.appendChild(lElMessage2In2);

    lStrDialog.appendChild(lElMessage1);
    lStrDialog.appendChild(lElUrl);
    lStrDialog.appendChild(lElMessage2);

    lElSpanHost.appendChild(lElInputHost);
    lElRangess.appendChild(lElSpanHost);

    if (sArrayPaths) {
      lElPageSpan = lElSpanHost.cloneNode();
      lElPageSpan.textContent = "Page:";

      lElPage = sElInput.cloneNode();
      lElPage.value = 0;
      lElPage.min   = 0;
      lElPage.max   = sArrayPaths.length;
      lElPage.addEventListener('change', pEvent => {
        var i   = 0;
        var lStrPathName = '';

        i = 0;
        while (i < pEvent.target.value) {
          lStrPathName += '/' + sArrayPaths[i];
          ++i;
        }
        lStrPathName += (lElPage.max > pEvent.target.value) ? '/*' : '/';
        lElUrl.textContent = sStrHostName + lStrPathName;
      });

      lElPageSpan.appendChild(lElPage);
      lElRangess.appendChild(lElPageSpan);
    }

    lStrDialog.appendChild(lElRangess);

    return lStrDialog;
  }//}}}

  function setAddUrlToExcludeList(pStrStorageName)//{{{
  {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(pStrStorageName, pArrayItems => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError));
          return;
        }
        var lArrayCheckItems = [];
        var lObjWrite        = {};
        var lStrAddUri       = "";
        var lStrItem         = "";
        var lBoolExclude     = false;

        lStrAddUri = sStrUri.replace(/\*/g, '').replace(/\/$/g, '');

        lStrItem = pArrayItems[pStrStorageName];
        lStrItem = lStrItem.replace(/\n$/, '').trim();

        lArrayCheckItems = lStrItem.split('\n');
        lBoolExclude = lArrayCheckItems.some(pValue => {
          return pValue.trim() === lStrAddUri;
        });
        if (lBoolExclude) {
          resolve();
          return;
        }

        lStrItem += '\n' + lStrAddUri;

        lObjWrite = {};
        lObjWrite[pStrStorageName] = lStrItem;
        chrome.storage.local.set(lObjWrite, resolve);
      });
    });
  }//}}}

  function addExclusionListClicked(pStrOptionName)//{{{
  {
    setAddUrlToExcludeList(pStrOptionName)
    .then(() => {
      chrome.runtime.sendMessage(
        { event: 'load_options_and_reload_current_tab' });
      parentClose();
    })
    .catch(pErr => console.error(pErr));
  }//}}}

  function parentClose() {//{{{
    sElParent.style.display = 'none';
  }//}}}

  chrome.runtime.onMessage.addListener(message => {//{{{
    switch (message.event) {
      case 'showExcludeDialog':
        sElParent.style.display = 'block';
        break;
    }
  });//}}}

  //{{{ variable in script.
  var sStrStyleBaseFontSize      = '12px';
  var sStrStyleFontColor         = '#212121';
  var sStrStylePrimaryColor      = '#03A9F4';
  var sStrStyleLightPrimaryColor = '#BBDEFB';
  var sStrBorderColor            = '#727272';

  var sStrHostName = window.location.hostname;
  var sStrPathName = '/*';
  var sStrUri      = sStrHostName + sStrPathName;

  var sArrayHosts = getHosts();
  var sArrayPaths = getPathNames();

  // main elements.
  var lElBody   = document.getElementsByTagName('body')[0];
  var sElParent = document.createDocumentFragment();
  var sElBr     = document.createElement('br');
  var sElDiv    = document.createElement('div');
  var sElSpan   = document.createElement('span');
  var sElButton = document.createElement('button');
  var sElInput  = document.createElement('input');
  initTextStyle(sElDiv);
  initTextStyle(sElSpan);
  initTextStyle(sElButton);
  initTextStyle(sElInput);
  sElInput.type           = 'range';
  sElInput.style.position = "relative";
  sElInput.style.top      = "0.4em";

  // clone elements.
  var sElExcludeDialogButtons        = document.createDocumentFragment();
  var sElExcludeButtonTemplate       = document.createDocumentFragment();
  var sElAddExcludeListButton        = document.createDocumentFragment();
  var sElAddKeybindExcludeListButton = document.createDocumentFragment();
  var sElAddTempExcludeListButton    = document.createDocumentFragment();
  var sElCancelButton                = document.createDocumentFragment();

  var sArrayButtons = [];
  //}}}

  // buttons
  sElExcludeDialogButtons                 = sElDiv.cloneNode();
  sElExcludeDialogButtons.style.position  = "absolute";
  sElExcludeDialogButtons.style.right     = "1em";
  sElExcludeDialogButtons.style.bottom    = "1em";
  sElExcludeDialogButtons.style.textAlign = "right";

  sElExcludeButtonTemplate              = sElButton.cloneNode();
  sElExcludeButtonTemplate.style.width  = '16em';
  sElExcludeButtonTemplate.style.margin = '0.16em';

  sElAddExcludeListButton        = sElExcludeButtonTemplate.cloneNode();
  sElAddKeybindExcludeListButton = sElExcludeButtonTemplate.cloneNode();
  sElAddTempExcludeListButton    = sElExcludeButtonTemplate.cloneNode();

  sElAddExcludeListButton.textContent =
    chrome.i18n.getMessage('exclude_dialog_add_to_exclude_list');
  sElAddExcludeListButton.addEventListener('click', () => {
    addExclusionListClicked('exclude_url');
  });

  sElAddKeybindExcludeListButton.textContent =
    chrome.i18n.getMessage('exclude_dialog_add_to_keybind_exclude_list');
  sElAddKeybindExcludeListButton.addEventListener('click', () => {
    addExclusionListClicked('keybind_exclude_url');
  });

  sElAddTempExcludeListButton.textContent =
    chrome.i18n.getMessage('exclude_dialog_add_to_temp_exclude_list');
  sElAddTempExcludeListButton.addEventListener('click', () => {
    var lStrUri = sStrHostName + sStrPathName;
    chrome.runtime.sendMessage(
      { event: 'add_to_temp_exclude_list', url: lStrUri });
    parentClose();
  });

  sElCancelButton             = sElExcludeButtonTemplate.cloneNode();
  sElCancelButton.textContent = chrome.i18n.getMessage('cancel');
  sElCancelButton.onclick     = parentClose;

  // be adding the elements to parent elements.
  sElParent = createParentElement();
  sElParent.appendChild(createTitleBar());
  sElParent.appendChild(createExcludeDialog());

  sArrayButtons = [
    sElAddExcludeListButton,
    sElAddKeybindExcludeListButton,
    sElAddTempExcludeListButton
  ];
  sArrayButtons.forEach(v => {
    sElExcludeDialogButtons.appendChild(v);
    sElExcludeDialogButtons.appendChild(sElBr);
  });
  sElExcludeDialogButtons.appendChild(sElCancelButton);

  sElParent.appendChild(sElExcludeDialogButtons); // add to parent.

  // show.
  lElBody.appendChild(sElParent);

  console.debug("exclude Dialog of Tab Memory Purge is loaded.");
})(this, this.document);
