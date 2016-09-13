'use strict';

var eventBus = require('byteballcore/event_bus.js');
var breadcrumbs = require('byteballcore/breadcrumbs.js');

angular.module('copayApp.controllers').controller('walletHomeController', function($scope, $rootScope, $timeout, $filter, $modal, $log, notification, isCordova, profileService, lodash, configService, storageService, gettext, gettextCatalog, nodeWebkit, addressService, confirmDialog, animationService, addressbookService, correspondentListService) {

  var self = this;
  $rootScope.hideMenuBar = false;
  $rootScope.wpInputFocused = false;
  var config = configService.getSync();
  var configWallet = config.wallet;
  $scope.currentSpendUnconfirmed = configWallet.spendUnconfirmed;
    
  // INIT
  var walletSettings = configWallet.settings;
  this.unitToBytes = walletSettings.unitToBytes;
  this.bytesToUnit = 1 / this.unitToBytes;
  this.unitName = walletSettings.unitName;
  this.unitDecimals = walletSettings.unitDecimals;
  this.isCordova = isCordova;
  this.addresses = [];
  this.isMobile = isMobile.any();
  this.isWindowsPhoneApp = isMobile.Windows() && isCordova;
  this.blockUx = false;
  this.showScanner = false;
  this.isMobile = isMobile.any();
  this.addr = {};
  $scope.index.tab = 'walletHome'; // for some reason, current tab state is tracked in index and survives re-instatiations of walletHome.js

  var disablePaymentRequestListener = $rootScope.$on('paymentRequest', function(event, address, amount, asset, recipient_device_address) {
    console.log('paymentRequest event '+address);
    $rootScope.$emit('Local/SetTab', 'send');
    self.setForm(address, amount, null, asset, recipient_device_address);

    var form = $scope.sendForm;
    if (form.address.$invalid && !self.blockUx) {
        console.log("invalid address, resetting form");
        self.resetForm();
        self.error = gettext('Could not recognize a valid Byteball QR Code');
    }
  });

  var disablePaymentUriListener = $rootScope.$on('paymentUri', function(event, uri) {
    $timeout(function() {
      $rootScope.$emit('Local/SetTab', 'send');
      self.setForm(uri);
    }, 100);
  });

  var disableAddrListener = $rootScope.$on('Local/NeedNewAddress', function() {
    self.setAddress(true);
  });

  var disableFocusListener = $rootScope.$on('Local/NewFocusedWallet', function() {
    self.addr = {};
    self.resetForm();
  });

  var disableResumeListener = $rootScope.$on('Local/Resume', function() {
    // This is needed then the apps go to sleep
	// looks like it already works ok without rebinding touch events after every resume
    //self.bindTouchDown();
  });

  var disableTabListener = $rootScope.$on('Local/TabChanged', function(e, tab) {
    // This will slow down switch, do not add things here!
      console.log("tab changed "+tab);
    switch (tab) {
      case 'receive':
        // just to be sure we have an address
        self.setAddress();
        break;
      case 'history':
        $rootScope.$emit('Local/NeedFreshHistory');
        break;
      case 'send':
        self.resetError();
    };
  });

  var disableOngoingProcessListener = $rootScope.$on('Addon/OngoingProcess', function(e, name) {
    self.setOngoingProcess(name);
  });
    
    eventBus.on("new_wallet_address", function(new_address){
        console.log("==== NEW ADDRESSS "+new_address);
        self.addr = {};
        self.setAddress();
    });

  $scope.$on('$destroy', function() {
    console.log("walletHome $destroy");
    disableAddrListener();
    disablePaymentRequestListener();
    disablePaymentUriListener();
    disableTabListener();
    disableFocusListener();
    disableResumeListener();
    disableOngoingProcessListener();
    $rootScope.hideMenuBar = false;
  });

  var requestTouchid = function(cb) {
    var fc = profileService.focusedClient;
    config.touchIdFor = config.touchIdFor || {};
    if (window.touchidAvailable && config.touchIdFor[fc.credentials.walletId]) {
      $rootScope.$emit('Local/RequestTouchid', cb);
    } else {
      return cb();
    }
  };

    //$rootScope.$digest();

  var accept_msg = gettextCatalog.getString('Accept');
  var cancel_msg = gettextCatalog.getString('Cancel');
  var confirm_msg = gettextCatalog.getString('Confirm');

  $scope.openDestinationAddressModal = function(wallets, address) {
    $rootScope.modalOpened = true;
    var fc = profileService.focusedClient;
    self.resetForm();

    var ModalInstanceCtrl = function($scope, $modalInstance) {
      $scope.wallets = wallets;
      $scope.editAddressbook = false;
      $scope.addAddressbookEntry = false;
      $scope.selectedAddressbook = {};
      $scope.newAddress = address;
      $scope.addressbook = {
        'address': ($scope.newAddress || ''),
        'label': ''
      };
      $scope.color = fc.backgroundColor;

      $scope.beforeQrCodeScann = function() {
        $scope.error = null;
        $scope.addAddressbookEntry = true;
        $scope.editAddressbook = false;
      };

      $scope.onQrCodeScanned = function(data, addressbookForm) {
        $timeout(function() {
          var form = addressbookForm;
          if (data && form) {
            data = data.replace('byteball:', '');
            form.address.$setViewValue(data);
            form.address.$isValid = true;
            form.address.$render();
          }
          $scope.$digest();
        }, 100);
      };

      $scope.selectAddressbook = function(addr) {
        $modalInstance.close(addr);
      };

      $scope.toggleEditAddressbook = function() {
        $scope.editAddressbook = !$scope.editAddressbook;
        $scope.selectedAddressbook = {};
        $scope.addAddressbookEntry = false;
      };

      $scope.toggleSelectAddressbook = function(addr) {
        $scope.selectedAddressbook[addr] = $scope.selectedAddressbook[addr] ? false : true;
      };

      $scope.toggleAddAddressbookEntry = function() {
        $scope.error = null;
        $scope.addressbook = {
          'address': ($scope.newAddress || ''),
          'label': ''
        };
        $scope.addAddressbookEntry = !$scope.addAddressbookEntry;
      };

      $scope.list = function() {
        $scope.error = null;
        addressbookService.list(function(err, ab) {
          if (err) {
            $scope.error = err;
            return;
          }
          $scope.list = ab;
        });
      };

      $scope.add = function(addressbook) {
        $scope.error = null;
        $timeout(function() {
          addressbookService.add(addressbook, function(err, ab) {
            if (err) {
              $scope.error = err;
              return;
            }
            $rootScope.$emit('Local/AddressbookUpdated', ab);
            $scope.list = ab;
            $scope.editAddressbook = true;
            $scope.toggleEditAddressbook();
            $scope.$digest();
          });
        }, 100);
      };

      $scope.remove = function(addr) {
        $scope.error = null;
        $timeout(function() {
          addressbookService.remove(addr, function(err, ab) {
            if (err) {
              $scope.error = err;
              return;
            }
            $rootScope.$emit('Local/AddressbookUpdated', ab);
            $scope.list = ab;
            $scope.$digest();
          });
        }, 100);
      };

      $scope.cancel = function() {
        $modalInstance.dismiss('cancel');
      };

      $scope.selectWallet = function(walletId, walletName) {
        $scope.gettingAddress = true;
        $scope.selectedWalletName = walletName;
        $timeout(function() {
          $scope.$apply();
        });
        addressService.getAddress(walletId, false, function(err, addr) {
          $scope.gettingAddress = false;

          if (err) {
            self.error = err;
            $modalInstance.dismiss('cancel');
            return;
          }

          $modalInstance.close(addr);
        });
      };
    };

    var modalInstance = $modal.open({
      templateUrl: 'views/modals/destination-address.html',
      windowClass: animationService.modalAnimated.slideUp,
      controller: ModalInstanceCtrl,
    });

    var disableCloseModal = $rootScope.$on('closeModal', function() {
      modalInstance.dismiss('cancel');
    });

    modalInstance.result.finally(function() {
      $rootScope.modalOpened = false;
      disableCloseModal();
      var m = angular.element(document.getElementsByClassName('reveal-modal'));
      m.addClass(animationService.modalAnimated.slideOutDown);
    });

    modalInstance.result.then(function(addr) {
      if (addr) {
        self.setForm(addr);
      }
    });
  };

  this.openTxpModal = function(tx, copayers) {
      // deleted, maybe restore from copay sometime later
      // actually, nothing to display here that was not already shown
  };

  this.setAddress = function(forceNew) {
    self.addrError = null;
    var fc = profileService.focusedClient;
    if (!fc)
      return;

    // Address already set?
    if (!forceNew && self.addr[fc.credentials.walletId]) {
      return;
    }

    self.generatingAddress = true;
    $timeout(function() {
      addressService.getAddress(fc.credentials.walletId, forceNew, function(err, addr) {
        self.generatingAddress = false;

        if (err) {
          self.addrError = err;
        } else {
          if (addr)
            self.addr[fc.credentials.walletId] = addr;
        }

        $scope.$digest();
      });
    });
  };

  this.copyAddress = function(addr) {
    if (isCordova) {
      window.cordova.plugins.clipboard.copy(addr);
      window.plugins.toast.showShortCenter(gettextCatalog.getString('Copied to clipboard'));
    } else if (nodeWebkit.isDefined()) {
      nodeWebkit.writeToClipboard(addr);
    }
  };

  this.shareAddress = function(addr) {
    if (isCordova) {
      if (isMobile.Android() || isMobile.Windows()) {
        window.ignoreMobilePause = true;
      }
      window.plugins.socialsharing.share('byteball:' + addr, null, null, null);
    }
  };

  this.openCustomizedAmountModal = function(addr) {
    $rootScope.modalOpened = true;
    var self = this;
    var fc = profileService.focusedClient;
    var ModalInstanceCtrl = function($scope, $modalInstance) {
        $scope.addr = addr;
        $scope.color = fc.backgroundColor;
        $scope.unitName = self.unitName;
        $scope.unitToBytes = self.unitToBytes;
        $scope.unitDecimals = self.unitDecimals;
        $scope.isCordova = isCordova;
        $scope.buttonLabel = 'Generate QR Code';


      Object.defineProperty($scope,
        "_customAmount", {
          get: function() {
            return $scope.customAmount;
          },
          set: function(newValue) {
            $scope.customAmount = newValue;
          },
          enumerable: true,
          configurable: true
        });

      $scope.submitForm = function(form) {
        var amount = form.amount.$modelValue;
        var asset = $scope.index.arrBalances[$scope.index.assetIndex].asset;
        if (!asset)
            throw Error("no asset");
        var amountInSmallestUnits = (asset === 'base') ? parseInt((amount * $scope.unitToBytes).toFixed(0)) : amount;
        $timeout(function() {
            $scope.customizedAmountUnit = amount + ' ' + ((asset === 'base') ? $scope.unitName : 'of ' + asset);
            $scope.amountInSmallestUnits = amountInSmallestUnits;
            $scope.asset_param = (asset === 'base') ? '' : '&asset='+encodeURIComponent(asset);
        }, 1);
      };


      $scope.shareAddress = function(uri) {
        if (isCordova) {
          if (isMobile.Android() || isMobile.Windows()) {
            window.ignoreMobilePause = true;
          }
          window.plugins.socialsharing.share(uri, null, null, null);
        }
      };

      $scope.cancel = function() {
        $modalInstance.dismiss('cancel');
      };
    };

    var modalInstance = $modal.open({
        templateUrl: 'views/modals/customized-amount.html',
        windowClass: animationService.modalAnimated.slideUp,
        controller: ModalInstanceCtrl,
        scope: $scope
    });

    var disableCloseModal = $rootScope.$on('closeModal', function() {
      modalInstance.dismiss('cancel');
    });

    modalInstance.result.finally(function() {
      $rootScope.modalOpened = false;
      disableCloseModal();
      var m = angular.element(document.getElementsByClassName('reveal-modal'));
      m.addClass(animationService.modalAnimated.slideOutDown);
    });
  };

  // Send 

  var unwatchSpendUnconfirmed = $scope.$watch('currentSpendUnconfirmed', function(newVal, oldVal) {
    if (newVal == oldVal) return;
    $scope.currentSpendUnconfirmed = newVal;
  });

  $scope.$on('$destroy', function() {
    unwatchSpendUnconfirmed();
  });


  this.resetError = function() {
    this.error = this.success = null;
  };

  this.bindTouchDown = function(tries) {
    var self = this;
    tries = tries || 0;
    if (tries > 5) return;
    var e = document.getElementById('menu-walletHome');
    if (!e) return $timeout(function() {
      self.bindTouchDown(++tries);
    }, 500);

    // on touchdown elements
    $log.debug('Binding touchstart elements...');
    ['hamburger', 'menu-walletHome', 'menu-send', 'menu-receive', 'menu-history'].forEach(function(id) {
      var e = document.getElementById(id);
      if (e) e.addEventListener('touchstart', function() {
        try {
          event.preventDefault();
        } catch (e) {};
        angular.element(e).triggerHandler('click');
      }, true);
    });
  }

  this.hideMenuBar = lodash.debounce(function(hide) {
    if (hide) {
      $rootScope.hideMenuBar = true;
      this.bindTouchDown();
    } else {
      $rootScope.hideMenuBar = false;
    }
    $rootScope.$digest();
  }, 100);


  this.formFocus = function(what) {
    if (isCordova && !this.isWindowsPhoneApp) {
      this.hideMenuBar(what);
    }
    if (!this.isWindowsPhoneApp) return

    if (!what) {
      this.hideAddress = false;
      this.hideAmount = false;

    } else {
      if (what == 'amount') {
        this.hideAddress = true;
      } else if (what == 'msg') {
        this.hideAddress = true;
        this.hideAmount = true;
      }
    }
    $timeout(function() {
      $rootScope.$digest();
    }, 1);
  };

  this.setSendFormInputs = function() {
    /**
     * Setting the two related amounts as properties prevents an infinite
     * recursion for watches while preserving the original angular updates
     *
     */
    Object.defineProperty($scope,
      "_amount", {
        get: function() {
          return $scope.__amount;
        },
        set: function(newValue) {
          $scope.__amount = newValue;
          self.resetError();
        },
        enumerable: true,
        configurable: true
      });

    Object.defineProperty($scope,
      "_address", {
        get: function() {
          return $scope.__address;
        },
        set: function(newValue) {
          $scope.__address = self.onAddressChange(newValue);
          if ($scope.sendForm && $scope.sendForm.address.$valid) {
            self.lockAddress = true;
          }
        },
        enumerable: true,
        configurable: true
      });

    var fc = profileService.focusedClient;
    // ToDo: use a credential's (or fc's) function for this
    this.hideNote = true;
  };

  this.setSendError = function(err) {
    var fc = profileService.focusedClient;
    var prefix =
      fc.credentials.m > 1 ? gettextCatalog.getString('Could not create payment proposal') : gettextCatalog.getString('Could not send payment');

    this.error = prefix + ": "+err;
      console.log(this.error);

    $timeout(function() {
      $scope.$digest();
    }, 1);
  };


  this.setOngoingProcess = function(name) {
    var self = this;
    self.blockUx = !!name;

    if (isCordova) {
      if (name) {
        window.plugins.spinnerDialog.hide();
        window.plugins.spinnerDialog.show(null, name + '...', true);
      } else {
        window.plugins.spinnerDialog.hide();
      }
    } else {
      self.onGoingProcess = name;
      $timeout(function() {
        $rootScope.$apply();
      });
    };
  };

  this.submitForm = function() {
    var fc = profileService.focusedClient;
    var unitToBytes = this.unitToBytes;

    if (isCordova && this.isWindowsPhoneApp) {
        this.hideAddress = false;
        this.hideAmount = false;
    }

    var form = $scope.sendForm;
    if (form.$invalid) {
        this.error = gettext('Unable to send transaction proposal');
        return;
    }

    if (fc.isPrivKeyEncrypted()) {
        profileService.unlockFC(null, function(err) {
            if (err)
                return self.setSendError(err.message);
            return self.submitForm();
        });
        return;
    }

    var comment = form.comment.$modelValue;

    // ToDo: use a credential's (or fc's) function for this
    if (comment) {
        var msg = 'Could not add message to imported wallet without shared encrypting key';
        $log.warn(msg);
        return self.setSendError(gettext(msg));
    }

    //self.setOngoingProcess(gettext('Creating transaction'));
    $timeout(function() {

        var asset = $scope.index.arrBalances[$scope.index.assetIndex].asset;
        console.log("asset "+asset);
        var address = form.address.$modelValue;
        var recipient_device_address = assocDeviceAddressesByPaymentAddress[address];
        var amount = parseInt(form.amount.$modelValue.toFixed(0));
        if (asset === "base")
            amount *= unitToBytes;

        requestTouchid(function(err) {
            if (err) {
                profileService.lockFC();
                //self.setOngoingProcess();
                self.error = err;
                $timeout(function() {
                    $scope.$digest();
                }, 1);
                return;
            }
          
            // compose and send
            var arrSigningDeviceAddresses = []; // empty list means that all signatures are required (such as 2-of-2)
            if (fc.credentials.m < fc.credentials.n)
                $scope.index.copayers.forEach(function(copayer){
                    if (copayer.me || copayer.signs)
                        arrSigningDeviceAddresses.push(copayer.device_address);
                });
            var current_payment_key = ''+asset+address+amount;
            if (current_payment_key === self.current_payment_key){
                $rootScope.$emit('Local/ShowErrorAlert', "This payment is already under way");
                return;
            }
            self.current_payment_key = current_payment_key;
            fc.sendPayment(asset, address, amount, arrSigningDeviceAddresses, recipient_device_address, function(err){
                // if multisig, it might take very long before the callback is called
                //self.setOngoingProcess();
                delete self.current_payment_key;
                if (err)
                    return self.setSendError(err);
                self.resetForm();
                $rootScope.$emit("NewOutgoingTx");
                if (recipient_device_address) // show payment in chat window
                    eventBus.emit('sent_payment', recipient_device_address, amount, asset);
                else // redirect to history
                    $rootScope.$emit('Local/SetTab', 'history');
            });
            /*
            if (fc.credentials.n > 1){
                $rootScope.$emit('Local/ShowAlert', "Transaction created.\nPlease approve it on the other devices.", 'fi-key', function(){
                    go.walletHome();
                });
            }*/
        
        });
    }, 100);
  };


  var assocDeviceAddressesByPaymentAddress = {};

  this.setForm = function(to, amount, comment, asset, recipient_device_address) {
    var form = $scope.sendForm;
    if (to) {
        form.address.$setViewValue(to);
        form.address.$isValid = true;
        form.address.$render();
        this.lockAddress = true;
        if (recipient_device_address)
            assocDeviceAddressesByPaymentAddress[to] = recipient_device_address;
    }

    if (amount) {
        form.amount.$setViewValue("" + amount);
        form.amount.$isValid = true;
        form.amount.$render();
        this.lockAmount = true;
    }

    if (comment) {
        form.comment.$setViewValue(comment);
        form.comment.$isValid = true;
        form.comment.$render();
    }
      
    if (asset){
        var assetIndex = lodash.findIndex($scope.index.arrBalances, {asset: asset});
        if (assetIndex < 0)
            throw Error("failed to find asset index of asset "+asset);
        $scope.index.assetIndex = assetIndex;
    }

  };



  this.resetForm = function() {
    this.resetError();

    this.lockAddress = false;
    this.lockAmount = false;
    this.hideAdvSend = true;
    $scope.currentSpendUnconfirmed = configService.getSync().wallet.spendUnconfirmed;

    this._amount = this._address = null;

    var form = $scope.sendForm;


    if (form && form.amount) {
      form.amount.$pristine = true;
      form.amount.$setViewValue('');
      form.amount.$render();

      form.comment.$setViewValue('');
      form.comment.$render();
      form.$setPristine();

      if (form.address) {
        form.address.$pristine = true;
        form.address.$setViewValue('');
        form.address.$render();
      }
    }
    $timeout(function() {
      $rootScope.$digest();
    }, 1);
  };



  this.setFromUri = function(uri) {
      var objRequest;
      require('byteballcore/uri.js').parseUri(uri, {
          ifError: function(err){
          },
          ifOk: function(_objRequest){
              objRequest = _objRequest; // the callback is called synchronously
          }
      });
      
      if (!objRequest) // failed to parse
          return uri;
      if (objRequest.amount){
          var amount = (objRequest.amount / this.unitToBytes).toFixed(this.unitDecimals);
          this.setForm(objRequest.address, amount);
      }
      return objRequest.address;
  };

  this.onAddressChange = function(value) {
    this.resetError();
    if (!value) return '';

    if (value.indexOf('byteball:') === 0)
      return this.setFromUri(value);
    else
      return value;
  };

  // History 

  function strip(number) {
    return (parseFloat(number.toPrecision(12)));
  }

  this.getUnitName = function() {
    return this.unitName;
  };


  this.openTxModal = function(btx) {
    $rootScope.modalOpened = true;
    var self = this;
    var fc = profileService.focusedClient;
    var ModalInstanceCtrl = function($scope, $modalInstance) {
      $scope.btx = btx;
      $scope.settings = walletSettings;
      $scope.color = fc.backgroundColor;
      $scope.isShared = fc.credentials.n > 1;

      $scope.getAmount = function(amount) {
        return self.getAmount(amount);
      };

      $scope.getUnitName = function() {
        return self.getUnitName();
      };

      $scope.getShortNetworkName = function() {
        var n = fc.credentials.network;
        return n.substring(0, 4);
      };

      $scope.copyAddress = function(addr) {
        if (!addr) return;
        self.copyAddress(addr);
      };

      $scope.cancel = function() {
		breadcrumbs.add('dismiss tx details');
        $modalInstance.dismiss('cancel');
      };

    };

    var modalInstance = $modal.open({
      templateUrl: 'views/modals/tx-details.html',
      windowClass: animationService.modalAnimated.slideRight,
      controller: ModalInstanceCtrl,
    });

    var disableCloseModal = $rootScope.$on('closeModal', function() {
      modalInstance.dismiss('cancel');
    });

    modalInstance.result.finally(function() {
      $rootScope.modalOpened = false;
      disableCloseModal();
      var m = angular.element(document.getElementsByClassName('reveal-modal'));
      m.addClass(animationService.modalAnimated.slideOutRight);
    });
  };

  this.hasAction = function(actions, action) {
    return actions.hasOwnProperty('create');
  };

  this._doSendAll = function(amount) {
    this.setForm(null, amount, null);
  };

  this.sendAll = function(amount, feeStr) {
    var self = this;
    var msg = gettextCatalog.getString("{{fee}} will be deducted for bitcoin networking fees", {
      fee: feeStr
    });

    confirmDialog.show(msg, function(confirmed) {
      if (confirmed)
        self._doSendAll(amount);
    });
  };

  /* Start setup */

  this.bindTouchDown();
  if (profileService.focusedClient) {
    this.setAddress();
    this.setSendFormInputs();
  }
});